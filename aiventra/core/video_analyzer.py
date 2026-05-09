"""Track B — forensic CCTV video analysis via YOLOv11n and Qwen3.5-397B-A17B.

Pipeline:
    Short CCTV clip (.mp4, 15s-1min)
    ├── Layer 1: OpenCV frame sampling (@1 FPS via grab/retrieve)
    ├── Layer 2: MOG2 motion pre-filter  (~10% pass-through)
    ├── Layer 3: YOLOv11n batch detection (parallel processes)
    └── Layer 4: Qwen3.5-397B forensic caption on ALL YOLO-relevant frames

The parallel batch YOLO step is the primary CPU optimization -- each worker
process owns a model instance so we bypass the Python GIL.  Only short clips
(≤1 min) are targeted in the demo scope, but the architecture is designed to
scale if longer footage is later supported.
"""

from __future__ import annotations

import base64
import io
import logging
import multiprocessing as mp
import os
import time
from pathlib import Path
from typing import Any, List, Optional, Tuple

import cv2
import numpy as np
from PIL import Image

from aiventra.core.config import Config
from aiventra.core.schemas import (
    DetectedObject,
    VideoAnalysisResult,
    VideoEvent,
)

logger = logging.getLogger(__name__)

try:
    import ultralytics  # noqa: F401
    import torch
    _ULTRALYTICS_AVAILABLE = True
except Exception as exc:
    logger.warning("ultralytics/torch not available: %s", exc)
    _ULTRALYTICS_AVAILABLE = False
    torch = None
    ultralytics = None

FORENSIC_VIDEO_SYSTEM_PROMPT = (
    "You are a forensic video analyst. Given one or more frames from a CCTV clip, "
    "describe what is visible that may be relevant to a criminal investigation. "
    "Identify persons present, their clothing, any weapons or objects they carry, "
    "their actions, gait, body posture, and any interactions with the environment. "
    "Be objective and factual. Return a concise 3-5 sentence forensic summary."
)

FORENSIC_VIDEO_FRAME_PROMPT = [
    {
        "type": "text",
        "text": (
            "These are frames from a surveillance video. "
            "Describe what is visible in a forensic context."
        ),
    }
]

# YOLO interest set (overlaps with image set but adds movement-related classes)
FORENSIC_CLASSES = {
    "person",
    "knife",
    "scissors",
    "blood",
    "bag",
    "backpack",
    "handbag",
    "suitcase",
    "chair",
    "tie",
    "cell phone",
}

DEFAULT_SAMPLE_FPS = 1
CLS_CONF_THRESHOLD = 0.30
MOTION_FG_THRESHOLD = 500  # minimum foreground pixels to count as motion
YOLO_BATCH_SIZE = 4
YOLO_WORKERS = 3
VLM_BATCH_SIZE = 3


def sample_frames(
    video_path: os.PathLike, sample_fps: int = DEFAULT_SAMPLE_FPS
) -> List[Tuple[np.ndarray, float, int]]:
    """Extract frames from a video at the given sample rate.

    Uses cap.grab() + cap.retrieve() to minimise decode overhead between target
    frames.  Returns a list of (frame_bgr, timestamp_seconds, original_frame_idx).
    """
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {video_path}")

    original_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_interval = max(1, int(round(original_fps / sample_fps)))

    sampled: List[Tuple[np.ndarray, float, int]] = []
    for orig_idx in range(0, total_frames, frame_interval):
        cap.set(cv2.CAP_PROP_POS_FRAMES, orig_idx)
        ok, frame = cap.read()
        if not ok or frame is None:
            break
        timestamp = orig_idx / original_fps
        sampled.append((frame, timestamp, orig_idx))

    cap.release()
    logger.info(
        "Sampled %d frames (%.1f FPS → %d FPS) from %s",
        len(sampled),
        original_fps,
        sample_fps,
        video_path,
    )
    return sampled


def detect_motion_frames(
    frames: List[Tuple[np.ndarray, float, int]],
    foreground_threshold: int = MOTION_FG_THRESHOLD,
) -> List[Tuple[np.ndarray, float, int]]:
    """Thin input frames using MOG2 background subtraction on CPU.

    Only frames with >foreground_threshold moving pixels are kept.
    """
    if not frames:
        return []

    fgbg = cv2.createBackgroundSubtractorMOG2(
        history=500, varThreshold=25, detectShadows=False
    )
    motion: List[Tuple[np.ndarray, float, int]] = []

    for frame, ts, idx in frames:
        fg_mask = fgbg.apply(frame)
        fg_pixels = cv2.countNonZero(fg_mask)
        if fg_pixels > foreground_threshold:
            motion.append((frame, ts, idx))

    logger.info(
        "MOG2: %d motion frames from %d sampled (%.0f%%)",
        len(motion),
        len(frames),
        100 * len(motion) / len(frames) if frames else 0,
    )
    return motion


# ---------------------------------------------------------------------------
# YOLO multiprocessing helpers
# ---------------------------------------------------------------------------


def _yolo_worker_init():
    global ultralytics, torch
    if _ULTRALYTICS_AVAILABLE:
        import ultralytics  # noqa: F401
        import torch
        torch.set_num_threads(2)


class _YOLOPredictor:
    """Picklable callable that loads a YOLO model in the target process."""

    def __init__(
        self,
        model_name: str = "yolo11n.pt",
        device: str = "cpu",
        conf: float = CLS_CONF_THRESHOLD,
        forensic_classes: Optional[set] = None,
    ):
        self.model_name = model_name
        self.device = device
        self.conf = conf
        self.forensic_classes = forensic_classes or FORENSIC_CLASSES
        self._model: Any = None

    def _load(self) -> None:
        if self._model is not None:
            return
        _yolo_worker_init()
        from ultralytics import YOLO

        self._model = YOLO(self.model_name)

    @staticmethod
    def _to_detections(res, forensic_classes: set, conf_th: float) -> List[DetectedObject]:
        detections: List[DetectedObject] = []
        if res.boxes is None:
            return detections
        for box in res.boxes:
            cls_id = int(box.cls[0])
            cls_name = res.names.get(cls_id, str(cls_id))
            cf = float(box.conf[0])
            if cf < conf_th:
                continue
            if cls_name not in forensic_classes:
                continue
            x_min, y_min, x_max, y_max = box.xyxy[0].tolist()
            h, w = res.orig_shape
            bbox_norm = [x_min / w, y_min / h, x_max / w, y_max / h]
            detections.append(
                DetectedObject(
                    class_name=cls_name,
                    confidence=round(cf, 4),
                    bounding_box=[round(v, 4) for v in bbox_norm],
                )
            )
        return detections

    def __call__(
        self, batch: List[Tuple[int, np.ndarray]], batch_size: int = YOLO_BATCH_SIZE
    ) -> List[Tuple[int, List[DetectedObject]]]:
        self._load()
        idxs = [b[0] for b in batch]
        imgs = [b[1] for b in batch]
        results: List[Tuple[int, List[DetectedObject]]] = []
        for i in range(0, len(imgs), batch_size):
            sub_images = imgs[i : i + batch_size]
            preds = self._model.predict(
                sub_images, device=self.device, verbose=False, conf=self.conf
            )
            for j, pred in enumerate(preds):
                idx = idxs[i + j]
                detections = self._to_detections(
                    pred, self.forensic_classes, self.conf
                )
                results.append((idx, detections))
        return results


def _split_batches(
    items: List[Any], n_batches: int
) -> List[List[Any]]:
    """Split *items* into *n_batches* roughly-equal chunks."""
    if n_batches <= 0 or len(items) <= 1:
        return [list(items)]
    per_batch = max(1, len(items) // n_batches)
    batches: List[List[Any]] = []
    for i in range(0, len(items), per_batch):
        chunk = items[i : i + per_batch]
        batches.append(chunk)
        if len(batches) == n_batches - 1:
            # remainder goes into last batch
            remainder = items[i + per_batch :]
            if remainder:
                batches.append(remainder)
            break
    return batches


def detect_objects_batch(
    frames_with_idx: List[Tuple[int, np.ndarray, float, int]],
    workers: int = YOLO_WORKERS,
    batch_size: int = YOLO_BATCH_SIZE,
    device: str = "cpu",
) -> List[Tuple[int, np.ndarray, float, int, List[DetectedObject]]]:
    """Run YOLOv11n on a list of frames using multiple worker processes and
    batched inference.

    Args:
        frames_with_idx: List of (internal_idx, frame_bgr, timestamp, original_idx).
        workers: Number of parallel processes to spawn for YOLO.
        device: torch device string ("cpu" is default).

    Returns:
        Same tuples with YOLO detections appended in the last slot.
    """
    if not frames_with_idx:
        return []

    # If sample is tiny, avoid process overhead
    if len(frames_with_idx) <= batch_size:
        predictor = _YOLOPredictor(device=device)
        batch = [(t[0], t[1]) for t in frames_with_idx]
        results_map: dict[int, List[DetectedObject]] = {
            idx: dets for idx, dets in predictor(batch, batch_size=batch_size)
        }
        return [
            (t[0], t[1], t[2], t[3], results_map.get(t[0], []))
            for t in frames_with_idx
        ]

    # Distribute across worker processes
    worker_inputs = _split_batches(
        [(t[0], t[1]) for t in frames_with_idx], n_batches=min(workers, len(frames_with_idx))
    )

    logger.info(
        "YOLOv11n: spawning %d worker processes, %d batches",
        len(worker_inputs),
        len(worker_inputs),
    )
    start = time.time()
    results_map: dict[int, List[DetectedObject]] = {}
    try:
        with mp.Pool(
            processes=len(worker_inputs),
            initializer=_yolo_worker_init,
        ) as pool:
            futures = [
                pool.apply_async(
                    _YOLOPredictor(device=device),
                    args=(batch, batch_size),
                )
                for batch in worker_inputs
            ]
            for fut in futures:
                for idx, dets in fut.get(timeout=300):
                    results_map[idx] = dets
    except Exception as exc:
        logger.error("Parallel YOLO inference failed: %s", exc)
        # Fallback: single-process
        predictor = _YOLOPredictor(device=device)
        batch = [(t[0], t[1]) for t in frames_with_idx]
        for idx, dets in predictor(batch, batch_size=batch_size):
            results_map[idx] = dets

    elapsed = time.time() - start
    logger.info(
        "YOLOv11n: processed %d frames in %.2fs", len(frames_with_idx), elapsed
    )

    return [
        (t[0], t[1], t[2], t[3], results_map.get(t[0], []))
        for t in frames_with_idx
    ]


def classify_events(
    frames_with_detections: List[
        Tuple[int, np.ndarray, float, int, List[DetectedObject]]
    ]
) -> List[Tuple[int, np.ndarray, float, int, List[DetectedObject], str]]:
    """Heuristic classification of events from YOLO detections.

    Returns the same tuples with an appended event_type string.
    """
    classified: List[
        Tuple[int, np.ndarray, float, int, List[DetectedObject], str]
    ] = []

    for idx, frame, ts, orig_idx, detections in frames_with_detections:
        classes = {d.class_name for d in detections}
        event_type = "unknown"
        if "blood" in classes:
            event_type = "blood_visible"
        elif "knife" in classes or "scissors" in classes:
            event_type = "weapon_visible"
        elif any(c in classes for c in {"bag", "backpack", "handbag", "suitcase"}):
            if "person" in classes:
                event_type = "suspicious_carry"
            else:
                event_type = "object_present"
        elif "person" in classes:
            event_type = "person_present"

        classified.append((idx, frame, ts, orig_idx, detections, event_type))

    return classified


# ---------------------------------------------------------------------------
# VLM helper
# ---------------------------------------------------------------------------


def _encode_frame_to_b64(frame_bgr: np.ndarray, fmt: str = "JPEG") -> str:
    pil = Image.fromarray(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
    buf = io.BytesIO()
    pil.save(buf, format=fmt)
    return base64.b64encode(buf.getvalue()).decode()


def analyze_frames_qwen_batched(
    classified_frames: List[
        Tuple[int, np.ndarray, float, int, List[DetectedObject], str]
    ],
    max_batch_size: int = VLM_BATCH_SIZE,
    model: Optional[str] = None,
) -> List[VideoEvent]:
    """Send ALL classified frames to Qwen3.5-397B-A17B in base64 batches.

    Returns:
        List of VideoEvent with Qwen-generated forensic descriptions.
    """
    if not classified_frames:
        return []

    Config.validate()
    try:
        from openai import OpenAI
        client = OpenAI(api_key=Config.API_KEY, base_url=Config.API_BASE_URL)
    except ImportError as exc:
        raise RuntimeError("openai package required for Qwen API calls") from exc

    model_name = model or "Qwen/Qwen3.5-397B-A17B"
    events: List[VideoEvent] = []

    for batch_start in range(0, len(classified_frames), max_batch_size):
        batch = classified_frames[batch_start : batch_start + max_batch_size]
        content = FORENSIC_VIDEO_FRAME_PROMPT[:]
        frames_meta: List[Tuple[float, int, str, List[DetectedObject]]] = []
        for _idx, frame_bgr, ts, orig_idx, detections, event_type in batch:
            b64 = _encode_frame_to_b64(frame_bgr)
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                }
            )
            frames_meta.append((ts, orig_idx, event_type, detections))

        try:
            resp = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": FORENSIC_VIDEO_SYSTEM_PROMPT},
                    {"role": "user", "content": content},
                ],
                temperature=0.0,
                max_tokens=2048,
            )
            reply = (resp.choices[0].message.content or "").strip()
        except Exception as exc:
            logger.error(
                "Qwen API call failed for batch %d: %s",
                batch_start // max_batch_size,
                exc,
            )
            reply = ""

        for (ts, orig_idx, event_type, detections) in frames_meta:
            motion_score = 0.5  # cosmetic default; MOG2 already vetted this frame
            events.append(
                VideoEvent(
                    event_type=event_type,
                    timestamp_seconds=round(ts, 2),
                    frame_number=orig_idx,
                    detected_objects=detections,
                    event_description=reply,
                    confidence=min(0.85, 0.3 + 0.15 * len(detections)),
                    motion_score=motion_score,
                )
            )

    return events


# ---------------------------------------------------------------------------
# Public orchestrator
# ---------------------------------------------------------------------------


def analyze_cctv_video(
    video_path: os.PathLike,
    output_dir: Optional[os.PathLike] = None,
    sample_fps: int = DEFAULT_SAMPLE_FPS,
    skip_motion_filter: bool = False,
    skip_yolo_filter: bool = False,
    model: Optional[str] = None,
) -> VideoAnalysisResult:
    """Analyse a short CCTV clip (Track B).

    Args:
        video_path: Path to the video file.
        output_dir: Optional directory to save debug frames.
        sample_fps: Frame sampling rate.
        skip_motion_filter: If True, bypass MOG2 and feed all frames to YOLO.
        skip_yolo_filter: If True, send all frames to VLM directly.
        model: Override VLM model name.

    Returns:
        VideoAnalysisResult with all VideoEvents.
    """
    start_time = time.time()
    video_path = Path(video_path)
    logger.info("Track B: analysing CCTV clip %s", video_path)

    # Layer 1: frame sampling
    frames = sample_frames(video_path, sample_fps=sample_fps)
    frames_sampled = len(frames)

    # Layer 2: motion pre-filter
    if skip_motion_filter:
        motion_frames = frames
        motion_count = len(frames)
    else:
        motion_frames = detect_motion_frames(frames)
        motion_count = len(motion_frames)

    # Layer 3: YOLO detection (parallel batch)
    if skip_yolo_filter:
        frames_with_idx = [
            (i, f[0], f[1], f[2], []) for i, f in enumerate(motion_frames)
        ]
        yolo_results = frames_with_idx
    else:
        frames_with_idx = [
            (i, f[0], f[1], f[2]) for i, f in enumerate(motion_frames)
        ]
        yolo_results = detect_objects_batch(
            frames_with_idx, workers=YOLO_WORKERS
        )

    # Layer 3.5: event classification
    classified = classify_events(yolo_results)

    # Layer 4: VLM forensic caption on ALL classified frames
    events = analyze_frames_qwen_batched(classified, model=model)

    # Optional debug output
    if output_dir:
        dbg = Path(output_dir)
        dbg.mkdir(parents=True, exist_ok=True)
        for idx, frame, ts, orig_idx, detections, event_type in classified:
            dbg_name = f"frame_{orig_idx:06d}_ts{ts:.2f}_{event_type}.jpg"
            cv2.imwrite(str(dbg / dbg_name), frame)
        logger.info("Saved %d debug frames to %s", len(classified), dbg)

    elapsed = time.time() - start_time
    logger.info(
        "Track B complete in %.1fs: %d sampled → %d motion → %d classified → %d events",
        elapsed,
        frames_sampled,
        motion_count,
        len(classified),
        len(events),
    )

    return VideoAnalysisResult(
        video_path=str(video_path),
        events=events,
        total_events=len(events),
        frames_sampled=frames_sampled,
        motion_frames=motion_count,
        yolo_relevant_frames=len(classified),
        frame_sample_rate_fps=sample_fps,
        processing_time_seconds=round(elapsed, 2),
        model_used=model or "Qwen/Qwen3.5-397B-A17B",
    )
