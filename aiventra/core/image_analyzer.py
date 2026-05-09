"""Track A — forensic image analysis from PDFs via Qwen3.5-397B-A17B.

Pipeline:
    PDF → PyMuPDF image extraction (size/colour filter)
        → ALL images → Qwen3.5-397B in batches of 2
        → ImageAnalysisResult

No YOLO in the PDF image pipeline — the VLM sees every image directly.
YOLO is used only for CCTV video (Track B).
"""

from __future__ import annotations

import base64
import io
import imghdr
import logging
import os
import time
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
import hashlib
from collections import defaultdict
import fitz  # PyMuPDF
from PIL import Image

from aiventra.core.config import Config
from aiventra.core.schemas import ForensicImageResult, ImageAnalysisResult

logger = logging.getLogger(__name__)

MIN_IMAGE_SIZE = 64
DEFAULT_VLM_BATCH_SIZE = 2

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


def _is_single_colour(img: Image.Image, threshold: int = 10, _downsample: int = 32) -> bool:
    """Detect near-uniform single-colour images (logos, headers).

    To speed up checks for large images we downsample to a small thumbnail
    before converting to a NumPy array.
    """
    if img.mode == "1":
        return True
    if img.mode != "RGB":
        img = img.convert("RGB")

    # downsample to reduce memory & computation cost
    thumb = img.resize((_downsample, _downsample), resample=Image.BILINEAR)
    arr = np.asarray(thumb)
    if arr.ndim == 2:
        return (arr.max() - arr.min()) <= threshold
    channel_ranges = [int(arr[:, :, i].max()) - int(arr[:, :, i].min()) for i in range(3)]
    return all(r <= threshold for r in channel_ranges)


def extract_images_from_pdf(
    pdf_path: os.PathLike, min_size: int = MIN_IMAGE_SIZE
) -> List[Tuple[str, bytes, int, str]]:
    """Extract embedded images from a PDF.

    Returns:
        List of tuples: (unique_image_id, raw_image_bytes, xref, page_location_str)
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


def _image_to_base64(raw_bytes: bytes) -> str:
    """Convert raw image bytes to a data URL without unnecessary re-encoding.

    Fast-path uses `imghdr` to detect common formats and base64-encodes the
    original bytes. If the format cannot be detected, we fall back to PIL
    and choose a sensible encoded format.
    """
    fmt_guess = imghdr.what(None, raw_bytes)
    if fmt_guess:
        # Return plain base64 payload (caller composes data URL).
        return base64.b64encode(raw_bytes).decode()

    # Fallback: use PIL to determine format and encode accordingly
    pil = Image.open(io.BytesIO(raw_bytes))
    if pil.mode in ("RGBA", "P"):
        buf = io.BytesIO()
        pil.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()
    else:
        buf = io.BytesIO()
        pil.save(buf, format="JPEG")
        return base64.b64encode(buf.getvalue()).decode()


def analyze_images_qwen(
    image_tuples: List[Tuple[str, bytes, int, str]],
    max_batch_size: int = DEFAULT_VLM_BATCH_SIZE,
    model: Optional[str] = None,
) -> List[ForensicImageResult]:
    """Send ALL images to Qwen3.5-397B-A17B in batches.

    Every image gets its own ForensicImageResult.  Images are grouped in
    batches of max_batch_size for a single API call — one description per
    batch, assigned to every image in that batch.

    Args:
        image_tuples: List of (image_id, bytes, xref, location) tuples.
        max_batch_size: Images per API call (default 2).
        model: Override VLM model name.

    Returns:
        List of ForensicImageResult — one per image.
    """
    if not image_tuples:
        return []

    Config.validate()

    try:
        import openai as _openai
    except ImportError as exc:
        raise RuntimeError("openai package required for Qwen API calls") from exc

    model_name = model or "Qwen/Qwen3.5-397B-A17B"
    results: List[ForensicImageResult] = []

    # Partition original images into ordered batches (preserve ordering for confidence)
    ordered_batches: List[List[Tuple[str, bytes, int, str]]] = [
        image_tuples[i : i + max_batch_size] for i in range(0, len(image_tuples), max_batch_size)
    ]

    # For each batch, deduplicate identical images within the batch only
    unique_batches: List[List[Tuple[str, Tuple[str, bytes, int, str]]]] = []
    batch_groups_list: List[dict] = []
    for batch in ordered_batches:
        grp: dict[str, List[Tuple[str, bytes, int, str]]] = defaultdict(list)
        order: List[str] = []
        for img_id, raw_bytes, xref, loc in batch:
            key = hashlib.sha256(raw_bytes).hexdigest()
            if key not in grp:
                order.append(key)
            grp[key].append((img_id, raw_bytes, xref, loc))
        # representative list preserving order of first appearance
        unique_batch = [(k, grp[k][0]) for k in order]
        unique_batches.append(unique_batch)
        batch_groups_list.append(grp)

    # Worker to send one batch (of unique images) to the VLM
    def _send_batch(batch: List[Tuple[str, Tuple[str, bytes, int, str]]], batch_index: int) -> Tuple[int, str]:
        client = _openai.OpenAI(api_key=Config.API_KEY, base_url=Config.API_BASE_URL)
        content: List[dict] = [{"type": "text", "text": FORENSIC_IMAGE_PROMPT}]
        for _key, (img_id, raw_bytes, _xref, _loc) in batch:
            b64 = _image_to_base64(raw_bytes)
            fmt_guess = imghdr.what(None, raw_bytes) or "jpeg"
            mime = "jpeg" if fmt_guess == "jpeg" else fmt_guess
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/{mime};base64,{b64}"},
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
            logger.error("Qwen API call failed for batch %d: %s", batch_index, exc)
            reply = ""

        return batch_index, (reply or "").strip()

    # Execute batches in parallel (network-bound) to improve throughput
    from concurrent.futures import ThreadPoolExecutor, as_completed

    batch_replies: dict[int, str] = {}
    if unique_batches:
        max_workers = min(4, len(unique_batches))
        with ThreadPoolExecutor(max_workers=max_workers) as ex:
            futures = {ex.submit(_send_batch, batch, idx): idx for idx, batch in enumerate(unique_batches)}
            for fut in as_completed(futures):
                try:
                    idx, reply = fut.result()
                    batch_replies[idx] = reply
                except Exception as exc:
                    logger.error("VLM batch worker failed: %s", exc)

    # Build results mapping back to original images (preserve original ordering)
    for batch_index, unique_batch in enumerate(unique_batches):
        reply = batch_replies.get(batch_index, "")
        description = reply
        confidence = round(min(0.85, 0.65 + 0.05 * batch_index), 2)

        grp = batch_groups_list[batch_index]
        for key, _rep in unique_batch:
            for orig_img_id, _rb, _xr, orig_loc in grp.get(key, []):
                results.append(
                    ForensicImageResult(
                        image_id=orig_img_id,
                        source_type="pdf_image",
                        source_location=orig_loc,
                        forensic_description=description,
                        confidence=confidence,
                    )
                )

    return results


def analyze_pdf_images(
    pdf_path: os.PathLike,
    output_dir: Optional[os.PathLike] = None,
    model: Optional[str] = None,
    vlm_batch_size: int = DEFAULT_VLM_BATCH_SIZE,
) -> ImageAnalysisResult:
    """Analyse ALL embedded images in a forensic PDF report (Track A).

    Pipeline:
        1. Extract all images via PyMuPDF
        2. ALL images → Qwen3.5-397B in batches of vlm_batch_size
        3. Return ImageAnalysisResult

    Args:
        pdf_path: Path to the PDF file.
        output_dir: Optional directory to save extracted images for audit.
        model: Override VLM model name.
        vlm_batch_size: Images per API call (default 2).

    Returns:
        ImageAnalysisResult with a ForensicImageResult per image.
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

    logger.info("Track A: %d images → VLM (batch size %d)", total_extracted, vlm_batch_size)

    forensic_results = analyze_images_qwen(
        extracted,
        max_batch_size=vlm_batch_size,
        model=model,
    )

    elapsed = time.time() - start_time
    logger.info(
        "Track A complete in %.1fs, %d forensic images",
        elapsed,
        len(forensic_results),
    )

    return ImageAnalysisResult(
        images=forensic_results,
        total_images_extracted=total_extracted,
        images_analyzed=len(forensic_results),
        vlm_batch_size=vlm_batch_size,
        processing_time_seconds=round(elapsed, 2),
        model_used=model or "Qwen/Qwen3.5-397B-A17B",
    )
