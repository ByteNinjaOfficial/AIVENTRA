# AIVENTRA — AI-Powered Forensic Triage & Postmortem Intelligence System

## Project Overview

Forensic investigation assistance platform. Not a replacement for forensic experts or legal authorities — all outputs support human decision-making only.

## Stack

- Python 3.10+; `requirements.txt` (root) has AIVENTRA CLI deps only
- `backend/` uses its own `requirements.txt` (FastAPI + CrewAI + SQLite)
- `frontend/` is Vite + React + TypeScript; runs separately
- LLM: DeepSeek-V4-Pro via Featherless API (OpenAI-compatible), temperature=0.0

## Architecture

```
root/
├── aiventra/                  AIVENTRA CLI package (Phase 1-2)
│   ├── core/
│   │   ├── pipeline.py        Orchestrator: PDF → parse → preprocess → extract → validate
│   │   ├── pdf_parser.py      pdfplumber + PyMuPDF + pytesseract OCR fallback
│   │   ├── rule_preprocessor.py 25-section detection, 9-pattern PII redaction, normalization
│   │   ├── llm_extractor.py   DeepSeek-V4-Pro via Featherless API, structured JSON extraction
│   │   ├── validator.py       Hallucination detection, cross-referencing, confidence adjustment
│   │   ├── schemas.py         Pydantic models: AutopsyExtraction, ForensicImageResult, VideoEvent
│   │   ├── image_analyzer.py  Track A: PyMuPDF extract → all images → Qwen3.5-397B (batch=2)
│   │   ├── video_analyzer.py  Track B: OpenCV → MOG2 → YOLOv11n batch → Qwen3.5-397B (batch=2)
│   │   └── config.py          API_KEY, BASE_URL, MODEL_NAME from .env
│   └── cli/main.py            Typer CLI: analyze, analyze-images, analyze-video, check
├── backend/                   ForensiAI FastAPI web platform
│   ├── main.py                FastAPI entry (port 8000)
│   ├── routes/analysis.py     8-stage pipeline; Stage 5 calls agents/autopsy_agent.py
│   ├── agents/               CrewAI agents (autopsy, correlation, summary) using Qwen2.5-7B
│   └── services/              tod_calculator, risk_engine, timeline_engine, pdf_parser
├── frontend/                 Vite + React (port 3001), talks to backend:8000
└── tests/                    Unit tests for AIVENTRA (import from root `aiventra/`)
```

## Core Modules

1. **Autopsy Report Analysis** — NLP extraction of cause of death, injury patterns, medical observations *(v1 — implemented)*
2. **Forensic Image Analysis (Track A)** — Extract images from PDF → Qwen3.5-397B forensic captioning, batch=2 *(v1 — implemented)*
3. **CCTV Video Analysis (Track B)** — OpenCV frame sampling → MOG2 motion → YOLOv11n batch → Qwen3.5-397B *(v1 — implemented)*
4. **Time-of-Death Estimation** — Body temperature, rigor mortis, livor mortis, environmental conditions
5. **Digital Evidence Correlation** — CCTV logs, timestamps, mobile metadata, geolocation into patterns/timelines
6. **Case Risk Scoring & Anomaly Detection** — Suspicious patterns, structured case insights for triage
7. **Interactive Investigation Dashboard** — Summarized reports, evidence timelines, visual insights

## AIVENTRA CLI Commands

```bash
# Install AIVENTRA CLI deps
pip install -r requirements.txt

# Run tests (78 tests, all passing)
python3 -m pytest tests/ -v

# Analyze autopsy report (Phase 1)
python3 -m aiventra.cli.main analyze report.pdf

# Analyze embedded images in a PDF (Phase 2 Track A)
python3 -m aiventra.cli.main analyze-images report.pdf

# Analyze CCTV video clip (Phase 2 Track B)
python3 -m aiventra.cli.main analyze-video clip.mp4

# Check configuration and dependencies
python3 -m aiventra.cli.main check
```

## ForensiAI Web Platform Commands

```bash
# Backend (port 8000)
cd backend && pip install -r requirements.txt && python main.py

# Frontend (port 3001)
cd frontend && npm install && npm run dev
```

## AIVENTRA Pipeline

```
PDF → pdf_parser → rule_preprocessor → llm_extractor → validator → ExtractionResult
  (text+tables)  (sections, PII,   (DeepSeek API,     (cross-ref,
                        normalize)    JSON extraction)  confidence adj)

PDF → extract_images_from_pdf → analyze_images_qwen → ImageAnalysisResult
  (PyMuPDF)                            (Qwen3.5-397B, batch=2)

Video → sample_frames → detect_motion_frames → detect_objects_batch → classify_events
  (OpenCV)        (MOG2)               (YOLOv11n mp.Pool)
              → analyze_frames_qwen_batched → VideoAnalysisResult
                                 (Qwen3.5-397B, batch=2)
```

## Gotchas

- `tests/` imports `aiventra.core.*` — relies on working directory being root with `aiventra/` accessible on the Python path. Tests pass from root with no extra setup.
- `.env` files (API keys) are gitignored — copy `.env.example` to `.env` before running anything
- **Dual LLM models**: AIVENTRA uses **DeepSeek-V4-Pro**; ForensiAI's CrewAI agents use **Qwen2.5-7B**. Different models, different `.env` vars. Do not assume they share the same key.
- PII redaction is ON by default (`--no-redact` to disable in CLI)
- All AI-generated outputs must be marked as **advisory, not conclusive**
- Every extracted field links back to **source location** (page/section) for audit trail
- Track A (image_analyzer.py) does **not** use YOLO — the VLM sees every extracted image directly
- `imghdr` deprecation warning in image_analyzer.py (Python 3.13 removal pending) — harmless for now