# AIVENTRA — AI-Powered Forensic Triage & Postmortem Intelligence System

## Project

Forensic investigation assistance platform. Not a replacement for forensic experts or legal authorities — all outputs support human decision-making only.

Remote: `https://github.com/ByteNinjaOfficial/AIVENTRA.git`, branch `main`, no commits yet.

## Core Modules (from ProblemStatement.txt)

1. **Autopsy Report Analysis** — NLP extraction of cause of death, injury patterns, medical observations from unstructured reports *(v1 — implemented)*
2. **Forensic Image Analysis (Track A)** — Extract embedded images from PDF reports → YOLOv11n filter → Qwen3.5-397B forensic captioning *(v1 — implemented)*
3. **CCTV Video Analysis (Track B)** — OpenCV frame sampling → MOG2 motion filter → YOLOv11n parallel batch detection → Qwen3.5-397B forensic event analysis *(v1 — implemented)*
4. **Time-of-Death Estimation** — Uses body temperature, rigor mortis, livor mortis, and environmental conditions
3. **Digital Evidence Correlation** — Connects CCTV logs, timestamps, mobile metadata, geolocation records into patterns/timelines
4. **Case Risk Scoring & Anomaly Detection** — Identifies suspicious patterns, generates structured case insights for triage
5. **Interactive Investigation Dashboard** — Summarized reports, evidence timelines, visual insights

## Stack

- Python 3.10+ (venv at `.venv/`, created on Windows)
- `requirements.txt` — pdfplumber, PyMuPDF, pytesseract, Pillow, openai, pydantic, python-dotenv, typer, pytest, ultralytics, opencv-python, numpy
- LLM: DeepSeek-V4-Pro via Featherless API (OpenAI-compatible), temperature=0.0
- Explainable AI methods required for transparency in forensic contexts

## Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Run tests
python3 -m pytest tests/ -v

# Analyze an autopsy report (Phase 1)
python3 -m aiventra.cli.main analyze report.pdf

# Analyze embedded images in a PDF (Phase 2 Track A)
python3 -m aiventra.cli.main analyze-images report.pdf

# Analyze a CCTV video clip (Phase 2 Track B)
python3 -m aiventra.cli.main analyze-video clip.mp4

# Check configuration and dependencies
python3 -m aiventra.cli.main check
```

## Package Structure

```
aiventra/
├── __init__.py              # Package init, version 0.1.0
├── core/
│   ├── __init__.py
│   ├── config.py            # Config: API_KEY, BASE_URL, MODEL_NAME from .env
│   ├── schemas.py           # Pydantic models: AutopsyExtraction, ForensicImageResult, VideoEvent, etc.
│   ├── pdf_parser.py        # pdfplumber text+table extraction, PyMuPDF OCR fallback
│   ├── rule_preprocessor.py # Section detection (25 autopsy sections), PII redaction, normalization
│   ├── llm_extractor.py     # DeepSeek via Featherless API, structured extraction prompt
│   ├── validator.py         # Post-LLM validation: hallucination detection, cross-referencing
│   ├── pipeline.py          # Orchestrator: PDF → parse → preprocess → extract → validate
│   ├── image_analyzer.py    # Track A: PDF image extraction → YOLOv11n → Qwen3.5-397B
│   └── video_analyzer.py    # Track B: OpenCV → MOG2 → YOLOv11n batch → Qwen3.5-397B
├── cli/
│   ├── __init__.py
│   └── main.py              # Typer CLI: analyze, check, analyze-images, analyze-video
tests/
├── __init__.py
├── test_schemas.py          # Pydantic model validation tests
├── test_config.py           # Config loading/validation tests
├── test_preprocessor.py     # Section detection, PII redaction, normalization tests
├── test_validator.py        # Cross-referencing, hallucination detection tests
├── test_image_analyzer.py   # PDF image extraction, YOLO filter, VLM analysis tests
└── test_video_analyzer.py   # Frame sampling, MOG2, YOLO batch, VLM analysis tests
```

## Pipeline

```
PDF → pdf_parser.py → rule_preprocessor.py → llm_extractor.py → validator.py → ExtractionResult
        (text+tables)    (sections, PII redact,    (DeepSeek API,        (cross-ref,
                          normalize)               JSON extraction)      confidence adj)

PDF → extract_images_from_pdf → filter_images_yolo → analyze_images_qwen → ImageAnalysisResult
         (PyMuPDF)              (YOLOv11n)              (Qwen3.5-397B)

Video → sample_frames → detect_motion_frames → detect_objects_batch → classify_events → analyze_frames_qwen_batched → VideoAnalysisResult
           (OpenCV)        (MOG2)                  (YOLOv11n mp.Pool)                          (Qwen3.5-397B)
```

## Security

- `.env` is in `.gitignore` — API keys must never be committed
- PII redaction is ON by default (`--no-redact` to disable)
- Data privacy, secure storage, and controlled access are requirements per the problem statement

## Conventions

- `core/` has zero framework deps — testable with plain pytest, swappable frontend later
- All AI-generated outputs must be clearly marked as advisory, not conclusive
- Every extracted field links back to source location for audit trail
- FastAPI + Streamlit deferred to v2; v1 is CLI-only (Typer)
- Offline fallback (rule-based extractor) planned for when API is unavailable