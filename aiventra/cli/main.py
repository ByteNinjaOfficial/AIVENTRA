"""Typer CLI for AIVENTRA autopsy report analysis."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional
from pathlib import Path
from typing import Optional

import typer

app = typer.Typer(
    name="aiventra",
    help="AIVENTRA — AI-Powered Forensic Triage & Postmortem Intelligence System",
)


def _setup_logging(verbose: bool):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


@app.command()
def analyze(
    pdf_path: Path = typer.Argument(..., exists=True, help="Path to the PDF autopsy report"),
    output: Optional[Path] = typer.Option(None, "--output", "-o", help="Output file path (JSON)"),
    no_redact: bool = typer.Option(False, "--no-redact", help="Disable PII redaction"),
    model: Optional[str] = typer.Option(None, "--model", "-m", help="Override LLM model name"),
    temperature: Optional[float] = typer.Option(None, "--temperature", "-t", help="Override LLM temperature"),
    max_tokens: Optional[int] = typer.Option(None, "--max-tokens", help="Override max output tokens"),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Enable debug logging"),
    quiet: bool = typer.Option(False, "--quiet", "-q", help="Only output JSON result"),
):
    """Analyze an autopsy report PDF and extract structured forensic findings."""
    _setup_logging(verbose)

    if quiet:
        logging.getLogger().setLevel(logging.ERROR)

    from aiventra.core.pipeline import run_pipeline

    try:
        result = run_pipeline(
            pdf_path=pdf_path,
            redact_pii=not no_redact,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except FileNotFoundError as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise typer.Exit(code=1)
    except EnvironmentError as exc:
        typer.echo(f"Configuration error: {exc}", err=True)
        raise typer.Exit(code=1)
    except RuntimeError as exc:
        typer.echo(f"Extraction error: {exc}", err=True)
        raise typer.Exit(code=1)

    output_json = result.model_dump_json(indent=2)

    if output:
        output.write_text(output_json, encoding="utf-8")
        if not quiet:
            typer.echo(f"Results written to: {output}")
    else:
        typer.echo(output_json)

    if not quiet:
        ext = result.extraction
        typer.echo("", err=True)
        typer.echo("=== EXTRACTION SUMMARY ===", err=True)
        typer.echo(f"  Cause of death: {ext.cause_of_death or 'NOT FOUND'}", err=True)
        typer.echo(f"  Manner of death: {ext.manner_of_death.value if ext.manner_of_death else 'NOT FOUND'}", err=True)
        typer.echo(f"  Confidence: {ext.extraction_confidence:.2f}", err=True)
        typer.echo(f"  Injuries: {len(ext.injury_patterns)}", err=True)
        typer.echo(f"  Toxicology findings: {len(ext.toxicology_findings)}", err=True)
        typer.echo(f"  Validation: {'PASSED' if result.validation.is_valid else 'FLAGGED'}", err=True)
        if result.validation.flags:
            typer.echo("  Flags:", err=True)
            for flag in result.validation.flags:
                typer.echo(f"    - {flag}", err=True)
        typer.echo(f"  Model: {result.model_used}", err=True)
        typer.echo(f"  Processing time: {result.processing_time_seconds:.2f}s", err=True)


@app.command()
def check():
    """Verify that configuration and dependencies are in place."""
    from aiventra.core.config import Config

    issues = []

    try:
        Config.validate()
        typer.echo("OK  API key configured")
    except EnvironmentError as exc:
        typer.echo(f"MISSING  {exc}")
        issues.append("api_key")

    try:
        import pdfplumber
        typer.echo("OK  pdfplumber installed")
    except ImportError:
        typer.echo("MISSING  pdfplumber not installed")
        issues.append("pdfplumber")

    try:
        import fitz
        typer.echo("OK  PyMuPDF installed")
    except ImportError:
        typer.echo("OPTIONAL  PyMuPDF not installed (OCR fallback unavailable)")
        issues.append("pymupdf")

    try:
        import pytesseract
        typer.echo("OK  pytesseract installed")
    except ImportError:
        typer.echo("OPTIONAL  pytesseract not installed (OCR fallback unavailable)")
        issues.append("pytesseract")

    try:
        from openai import OpenAI
        typer.echo("OK  openai installed")
    except ImportError:
        typer.echo("MISSING  openai not installed")
        issues.append("openai")

    try:
        import cv2
        typer.echo("OK  opencv-python installed")
    except ImportError:
        typer.echo("MISSING  opencv-python not installed")
        issues.append("opencv-python")

    try:
        import ultralytics
        typer.echo("OK  ultralytics installed")
    except ImportError:
        typer.echo("MISSING  ultralytics not installed")
        issues.append("ultralytics")

    try:
        import numpy
        typer.echo("OK  numpy installed")
    except ImportError:
        typer.echo("MISSING  numpy not installed")
        issues.append("numpy")

    if not issues:
        typer.echo("\nAll checks passed!")
    else:
        typer.echo(f"\n{len(issues)} issue(s) found. Run: pip install -r requirements.txt")


@app.command()
def analyze_images(
    pdf_path: Path = typer.Argument(..., exists=True, help="Path to the PDF report with images"),
    output: Optional[Path] = typer.Option(None, "--output", "-o", help="Output file path (JSON)"),
    model: Optional[str] = typer.Option(None, "--model", "-m", help="Override VLM model name"),
    
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Enable debug logging"),
    quiet: bool = typer.Option(False, "--quiet", "-q", help="Only output JSON result"),
):
    """Extract and forensic-analyse ALL embedded images from a PDF report (Track A)."""
    _setup_logging(verbose)
    if quiet:
        logging.getLogger().setLevel(logging.ERROR)

    from aiventra.core.image_analyzer import analyze_pdf_images

    try:
        result = analyze_pdf_images(
            pdf_path=pdf_path,
            output_dir=None,
            model=model,
        )
    except FileNotFoundError as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise typer.Exit(code=1)
    except EnvironmentError as exc:
        typer.echo(f"Configuration error: {exc}", err=True)
        raise typer.Exit(code=1)
    except RuntimeError as exc:
        typer.echo(f"Analysis error: {exc}", err=True)
        raise typer.Exit(code=1)

    output_json = result.model_dump_json(indent=2)
    if output:
        output.write_text(output_json, encoding="utf-8")
        if not quiet:
            typer.echo(f"Results written to: {output}")
    else:
        typer.echo(output_json)

    if not quiet:
        typer.echo("", err=True)
        typer.echo("=== IMAGE ANALYSIS SUMMARY ===", err=True)
        typer.echo(f"  Total images extracted: {result.total_images_extracted}", err=True)
        typer.echo(f"  Images analyzed: {result.images_analyzed}", err=True)
        typer.echo(f"  VLM batch size: {result.vlm_batch_size}", err=True)
        typer.echo(f"  Model: {result.model_used}", err=True)
        typer.echo(f"  Processing time: {result.processing_time_seconds:.2f}s", err=True)
        for img in result.images:
            typer.echo(f"\n  Image: {img.image_id}", err=True)
            typer.echo(f"    Location: {img.source_location}", err=True)
            typer.echo(f"    Confidence: {img.confidence}", err=True)
            typer.echo(f"    Description: {img.forensic_description or 'N/A'}", err=True)


@app.command()
def analyze_video(
    video_path: Path = typer.Argument(..., exists=True, help="Path to the CCTV video clip"),
    output: Optional[Path] = typer.Option(None, "--output", "-o", help="Output file path (JSON)"),
    model: Optional[str] = typer.Option(None, "--model", "-m", help="Override VLM model name"),
    sample_fps: int = typer.Option(1, "--sample-fps", help="Frame sample rate (default 1 FPS)"),
    skip_motion: bool = typer.Option(False, "--skip-motion", help="Bypass MOG2 motion pre-filter"),
    skip_yolo: bool = typer.Option(False, "--skip-yolo", help="Send all frames to VLM (no YOLO)"),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Enable debug logging"),
    quiet: bool = typer.Option(False, "--quiet", "-q", help="Only output JSON result"),
):
    """Forensic-analyse a CCTV clip using YOLO + Qwen VLM (Track B)."""
    _setup_logging(verbose)
    if quiet:
        logging.getLogger().setLevel(logging.ERROR)

    from aiventra.core.video_analyzer import analyze_cctv_video

    try:
        result = analyze_cctv_video(
            video_path=video_path,
            output_dir=None,
            sample_fps=sample_fps,
            skip_motion_filter=skip_motion,
            skip_yolo_filter=skip_yolo,
            model=model,
        )
    except FileNotFoundError as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise typer.Exit(code=1)
    except EnvironmentError as exc:
        typer.echo(f"Configuration error: {exc}", err=True)
        raise typer.Exit(code=1)
    except RuntimeError as exc:
        typer.echo(f"Analysis error: {exc}", err=True)
        raise typer.Exit(code=1)

    output_json = result.model_dump_json(indent=2)
    if output:
        output.write_text(output_json, encoding="utf-8")
        if not quiet:
            typer.echo(f"Results written to: {output}")
    else:
        typer.echo(output_json)

    if not quiet:
        typer.echo("", err=True)
        typer.echo("=== VIDEO ANALYSIS SUMMARY ===", err=True)
        typer.echo(f"  Video: {result.video_path}", err=True)
        typer.echo(f"  Total events: {result.total_events}", err=True)
        typer.echo(f"  Frames sampled: {result.frames_sampled}", err=True)
        typer.echo(f"  Motion frames: {result.motion_frames}", err=True)
        typer.echo(f"  YOLO relevant frames: {result.yolo_relevant_frames}", err=True)
        typer.echo(f"  Model: {result.model_used}", err=True)
        typer.echo(f"  Processing time: {result.processing_time_seconds:.2f}s", err=True)
        for evt in result.events:
            typer.echo(f"\n  Event: {evt.event_type} @ {evt.timestamp_seconds:.1f}s", err=True)
            typer.echo(f"    Objects: {[d.class_name for d in evt.detected_objects]}", err=True)
            typer.echo(f"    Description: {evt.event_description or 'N/A'}", err=True)


def main():
    app()


if __name__ == "__main__":
    main()