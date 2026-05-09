"""Track A — forensic image analysis from PDFs via Qwen3.5-397B-A17B.

Pipeline:
    PDF → PyMuPDF image extraction → size/colour filter
        → YOLOv11n batch detection (filter: person, knife, weapon, blood, bag, chair)
        → Qwen3.5-397B forensic captioning per relevant image
        → ImageAnalysisResult
"""

from __future__ import annotations

import base64
import io
import logging
import os
import time
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
import fitz  # PyMuPDF
from PIL import Image

from aiventra.core.config import Config
from aiventra.core.schemas import DetectedObject, ForensicImageResult, ImageAnalysisResult

logger = logging.getLogger(__name__)

try:
    from ultralytics import YOLO as _YOLO
    _YOLO_AVAILABLE = True
except Exception as exc:
    logger.warning("ultralytics not available: %s", exc)
    _YOLO_AVAILABLE = False
    _YOLO = None

# Relevant YOLO COCO classes for forensic filtering.
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

MIN_IMAGE_SIZE = 64

FORENSIC_IMAGE_PROMPT = (
    "You are a forensic image analyst. Describe the image for investigation use. "
    "Identify if the image shows: injuries or wounds, weapons, blood, persons, "
    "suspicious objects, clothing, body position, room layout, or any scene evidence. "
    "Use objective, factual language. State uncertainty clearly. "
    "Return a concise forensic summary in 3-5 sentences."
)

FORENSIC_IMAGE_SYSTEM_PROMPT = (
    "You are an expert forensic image analyst. You examine crime-scene photographs, "
    "autopsy images, and investigative visuals. You describe what is objectively visible, "
    "note any uncertainties, and flag anything that appears unusual or significant for "
    "forensic investigation."
)


def _is_single_colour(img: Image.Image, threshold: int = 10) -> bool:
    """Detect near-uniform single-colour images (logos, headers)."""
    if img.mode == "1":
        return True
    if img.mode != "RGB":
        img = img.convert("RGB")
    arr = np.asarray(img)
    if arr.ndim == 2:
        return (arr.max() - arr.min()) <= threshold
    channel_ranges = [arr[:, :, i].max() - arr[:, :, i].min() for i in range(3)]
    return all(r <= threshold for r in channel_ranges)


def extract_images_from_pdf(
    pdf_path: os.PathLike, min_size: int = MIN_IMAGE_SIZE
) -> List[Tuple[str, bytes, int, str]]:
    """Extract embedded images from a PDF.

    Returns:
        List of tuples: (unique_image_id, raw_image_bytes, xref, page_number/location_str)
    """
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    doc = fitz.open(pdf_path)
    images: List[Tuple[str, bytes, int, str]] = []
    seen_xrefs: set[int] = set()

    try:
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            img_list = page.get_images(full=True)
            for img_index, img_info in enumerate(img_list):
                xref = img_info[0]
                if xref in seen_xrefs:
                    continue
                seen_xrefs.add(xref)
                try:
                    base_image = doc.extract_image(xref)
                    if not base_image:
                        continue
                    image_bytes = base_image.get("image")
                    if image_bytes is None:
                        continue
                    width = base_image.get("width", 0)
                    height = base_image.get("height", 0)
                    if width < min_size or height < min_size:
                        logger.debug(
                            "Skipping tiny image xref=%s %sx%s", xref, width, height
                        )
                        continue
                    img = Image.open(io.BytesIO(image_bytes))
                    if _is_single_colour(img):
                        logger.debug("Skipping single-colour image xref=%s", xref)
                        continue
                    image_id = f"{pdf_path.stem}_page{page_num + 1}_img{img_index}_xref{xref}"
                    location = f"Page {page_num + 1}, xref {xref}"
                    images.append((image_id, image_bytes, xref, location))
                except Exception as exc:
                    logger.warning("Failed to extract image xref=%s: %s", xref, exc)
                    continue
    finally:
        doc.close()

    logger.info("Extracted %d unique images from %s", len(images), pdf_path)
    return images


def _load_yolo_model():
    if not _YOLO_AVAILABLE:
        return None
    try:
        model = _YOLO("yolo11n.pt")
        return model
    except Exception as exc:
        logger.warning("Failed to load YOLOv11n: %s", exc)
        return None


def filter_images_yolo(
    images: List[Tuple[str, bytes, int, str]],
    batch_size: int = 4,
    conf_threshold: float = 0.3,
    device: str = "cpu",
) -> List[Tuple[str, bytes, int, str, List[DetectedObject]]]:
    """Run YOLOv11n detection on extracted images and filter by relevant forensic classes.

    Args:
        images: List of (image_id, bytes, xref, location) tuples.
        batch_size: Batch size for YOLO inference.
        conf_threshold: Minimum confidence for detection.
        device: Device to run YOLO on.

    Returns:
        List of tuples with YOLO detections appended.
    """
    if not images:
        return []

    model = _load_yolo_model()
    if model is None:
        logger.error("YOLOv11n not available; skipping image filter.")
        # Return all images without detections
        return [(img[0], img[1], img[2], img[3], []) for img in images]

    # Convert bytes to numpy arrays for YOLO
    pil_images: List[Optional[Image.Image]] = []
    for _, raw_bytes, _, _ in images:
        try:
            pil = Image.open(io.BytesIO(raw_bytes))
            if pil.mode != "RGB":
                pil = pil.convert("RGB")
            pil_images.append(pil)
        except Exception as exc:
            logger.warning("Failed to decode image for YOLO: %s", exc)
            pil_images.append(None)

    results: List[Tuple[int, List[DetectedObject]]] = []
    for batch_start in range(0, len(pil_images), batch_size):
        batch: List[np.ndarray] = []
        batch_indices: List[int] = []
        for j, pil in enumerate(
            pil_images[batch_start : batch_start + batch_size], start=batch_start
        ):
            if pil is not None:
                batch.append(np.asarray(pil))
                batch_indices.append(j)
        if not batch:
            continue
        try:
            preds = model.predict(batch, device=device, verbose=False)
            for bi, idx in enumerate(batch_indices):
                detections: List[DetectedObject] = []
                res = preds[bi]
                for box in res.boxes:
                    cls_id = int(box.cls[0])
                    cls_name = model.names.get(cls_id, str(cls_id))
                    conf = float(box.conf[0])
                    if conf < conf_threshold:
                        continue
                    if cls_name in FORENSIC_CLASSES:
                        # Normalise bounding box
                        xn_min, yn_min, xn_max, yn_max = box.xyxy[0].tolist()
                        h, w = res.orig_shape
                        bbox_norm = [
                            xn_min / w,
                            yn_min / h,
                            xn_max / w,
                            yn_max / h,
                        ]
                        detections.append(
                            DetectedObject(
                                class_name=cls_name,
                                confidence=round(conf, 4),
                                bounding_box=[round(v, 4) for v in bbox_norm],
                            )
                        )
                results.append((idx, detections))
        except Exception as exc:
            logger.error(
                "YOLO batch inference failed at batch %d: %s",
                batch_start // batch_size,
                exc,
            )
            for idx in batch_indices:
                results.append((idx, []))
            continue

    # Sort by original index and attach to image tuples
    results_by_idx = {idx: dets for idx, dets in sorted(results, key=lambda x: x[0])}
    relevant: List[Tuple[str, bytes, int, str, List[DetectedObject]]] = []
    for idx, img_tuple in enumerate(images):
        detections = results_by_idx.get(idx, [])
        relevant.append(
            (img_tuple[0], img_tuple[1], img_tuple[2], img_tuple[3], detections)
        )

    return relevant


def _image_to_base64(raw_bytes: bytes, fmt: str = "JPEG") -> str:
    """Convert raw image bytes to base64 data URL."""
    pil = Image.open(io.BytesIO(raw_bytes))
    if pil.mode in ("RGBA", "P"):
        pil = pil.convert("RGB")
    buf = io.BytesIO()
    pil.save(buf, format=fmt)
    return base64.b64encode(buf.getvalue()).decode()


def analyze_images_qwen(
    image_tuples: List[Tuple[str, bytes, int, str, List[DetectedObject]]],
    max_batch_size: int = 3,
    model: Optional[str] = None,
) -> List[ForensicImageResult]:
    """Send image batches to Qwen3.5-397B-A17B for forensic captioning.

    Args:
        image_tuples: List of (image_id, bytes, xref, location, detections).
        max_batch_size: Max images per API call (stay within token/image limits).
        model: Override model name.

    Returns:
        List of ForensicImageResult.
    """
    if not image_tuples:
        return []

    Config.validate()

    try:
        from openai import OpenAI

        client = OpenAI(api_key=Config.API_KEY, base_url=Config.API_BASE_URL)
    except ImportError as exc:
        raise RuntimeError("openai package required for Qwen API calls") from exc

    model_name = model or "Qwen/Qwen3.5-397B-A17B"
    results: List[ForensicImageResult] = []

    for batch_start in range(0, len(image_tuples), max_batch_size):
        batch = image_tuples[batch_start : batch_start + max_batch_size]

        content: List[dict] = [{"type": "text", "text": FORENSIC_IMAGE_PROMPT}]
        for _img_id, raw_bytes, _xref, _loc, _dets in batch:
            b64 = _image_to_base64(raw_bytes)
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                }
            )

        try:
            resp = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": FORENSIC_IMAGE_SYSTEM_PROMPT},
                    {"role": "user", "content": content},
                ],
                temperature=0.0,
                max_tokens=2048,
            )
            reply = resp.choices[0].message.content or ""
        except Exception as exc:
            logger.error(
                "Qwen API call failed for batch %d: %s", batch_start // max_batch_size, exc
            )
            reply = ""

        for img_id, _raw_bytes, xref, location, detections in batch:
            results.append(
                ForensicImageResult(
                    image_id=img_id,
                    source_type="pdf_image",
                    source_location=location,
                    detected_objects=detections,
                    forensic_description=reply.strip(),
                    confidence=0.7,
                )
            )

    return results


def analyze_pdf_images(
    pdf_path: os.PathLike,
    output_dir: Optional[os.PathLike] = None,
    skip_yolo_filter: bool = False,
    model: Optional[str] = None,
) -> ImageAnalysisResult:
    """Analyse embedded images in a forensic PDF report (Track A).

    Args:
        pdf_path: Path to the PDF file.
        output_dir: Optional directory to save extracted images for audit.
        skip_yolo_filter: If True, send ALL extracted images to Qwen regardless of YOLO.
        model: Override VLM model name.

    Returns:
        ImageAnalysisResult containing forensic descriptions for each relevant image.
    """
    start_time = time.time()
    pdf_path = Path(pdf_path)

    logger.info("Track A: extracting images from %s", pdf_path)
    extracted = extract_images_from_pdf(pdf_path)
    total_extracted = len(extracted)

    if output_dir:
        out_dir = Path(output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        for img_id, raw_bytes, _xref, _loc in extracted:
            safe_id = "".join(c if c.isalnum() or c in "_-" else "_" for c in img_id)
            out_path = out_dir / f"{safe_id}.jpg"
            try:
                pil = Image.open(io.BytesIO(raw_bytes))
                if pil.mode in ("RGBA", "P"):
                    pil = pil.convert("RGB")
                pil.save(out_path, "JPEG")
            except Exception as exc:
                logger.warning("Could not save %s: %s", safe_id, exc)
        logger.info("Saved %d images to %s", len(extracted), out_dir)

    if skip_yolo_filter:
        # Send all images, no YOLO filtering
        relevant = [(t[0], t[1], t[2], t[3], []) for t in extracted]
    else:
        relevant = filter_images_yolo(extracted)

    with_detections = [r for r in relevant if r[4]]
    without_detections = [r for r in relevant if not r[4]]

    # If no detections at all but images extracted, send a sample to Qwen
    if not with_detections and without_detections:
        logger.info(
            "No YOLO detections found; sending up to 2 images for manual review."
        )
        to_analyze = without_detections[:2]
    else:
        to_analyze = relevant if skip_yolo_filter else with_detections

    logger.info(
        "Track A: %d extracted → YOLO relevant %d → sending %d to Qwen",
        total_extracted,
        len(with_detections),
        len(to_analyze),
    )

    forensic_results = analyze_images_qwen(to_analyze, model=model)

    elapsed = time.time() - start_time
    logger.info(
        "Track A complete in %.1fs, %d forensic images", elapsed, len(forensic_results)
    )

    return ImageAnalysisResult(
        images=forensic_results,
        total_images_extracted=total_extracted,
        relevant_images=len(forensic_results),
        processing_time_seconds=round(elapsed, 2),
        model_used=model or "Qwen/Qwen3.5-397B-A17B",
    )
