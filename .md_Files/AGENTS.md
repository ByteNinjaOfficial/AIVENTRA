# AIVENTRA — AI-Powered Forensic Triage & Postmortem Intelligence System

## Stack

- Python 3.10+; `requirements.txt` (root) has AIVENTRA CLI deps only
- `backend/` has its own `requirements.txt` (FastAPI + web deps — no CLI deps)
- `aiventra/` package lives at `backend/aiventra/` — NOT at the repo root
- `frontend/` is Vite + React + TypeScript; runs on port **3000** (not 3001)

## Running the AIVENTRA CLI

The `aiventra/` package is inside `backend/`. From the repo root you **must** set `PYTHONPATH`:

```bash
# Install CLI deps first (root requirements.txt)
pip install -r requirements.txt

# All CLI commands require PYTHONPATH=backend
PYTHONPATH=backend python3 -m aiventra.cli.main analyze report.pdf
PYTHONPATH=backend python3 -m aiventra.cli.main analyze-images report.pdf
PYTHONPATH=backend python3 -m aiventra.cli.main analyze-video clip.mp4
PYTHONPATH=backend python3 -m aiventra.cli.main check
```

Or `cd backend` then run without PYTHONPATH (backend/ becomes cwd so `aiventra` resolves).

## Running Tests

```bash
# ALL tests require PYTHONPATH=backend — no pytest.ini or conftest.py exists
PYTHONPATH=backend python3 -m pytest tests/ -v   # 78 tests
```

Running `python3 -m pytest tests/` from root without PYTHONPATH fails with `ModuleNotFoundError: No module named 'aiventra'`.

## Running the ForensiAI Web Platform

```bash
# Backend (port 8000) — separate deps from CLI; needs backend/.env
cd backend && pip install -r requirements.txt && cp .env.example .env && python main.py

# Frontend (port 3000) — no Vite proxy; direct Axios calls to http://localhost:8000
cd frontend && npm install && npm run dev
```

## Architecture

```
backend/
├── main.py                  FastAPI entry (port 8000)
├── config.py                ForensiAI settings (Qwen2.5-7B, SQLite, uploads)
├── routes/analysis.py       8-stage pipeline; calls aiventra.* directly
├── agents/                  CrewAI agents: autopsy, correlation, summary (Qwen2.5-7B)
├── services/                tod_calculator, risk_engine, timeline_engine, pdf_parser
└── aiventra/                AIVENTRA forensic extraction engine
    ├── core/
    │   ├── pipeline.py      PDF → parse → preprocess → extract → validate (DeepSeek-V4-Pro)
    │   ├── image_analyzer.py Track A: PyMuPDF extract → Qwen3.5-397B VLM (batch=2, no YOLO)
    │   ├── video_analyzer.py Track B: OpenCV → MOG2 → YOLOv11n → Qwen3.5-397B VLM (batch=2)
    │   ├── llm_extractor.py DeepSeek-V4-Pro via Featherless API, JSON extraction
    │   ├── validator.py     Hallucination detection, cross-reference, confidence adj
    │   ├── rule_preprocessor.py 25-section detection, 9-pattern PII redaction
    │   ├── schemas.py       Pydantic models
    │   └── config.py        AIVENTRA settings (DeepSeek-V4-Pro, env vars)
    └── cli/main.py          Typer CLI: analyze, analyze-images, analyze-video, check
```

## ForensiAI 8-Stage Pipeline

```
POST /cases/{id}/analyze  (FastAPI background task)
  Stage 1: Parse — calls aiventra.core.pipeline (text), aiventra.core.image_analyzer (Track A),
           aiventra.core.video_analyzer (Track B), csv_parser
  Stage 2: Normalize data
  Stage 3: Time-of-death (Henssge nomogram, deterministic)
  Stage 4: Timeline reconstruction (deterministic)
  Stage 5: Hybrid autopsy — AIVENTRA extraction + CrewAI autopsy_agent (Qwen2.5-7B) enrichment
  Stage 6: Correlation agent (Qwen2.5-7B, anomaly detection)
  Stage 7: Risk engine (11-rule scoring: LOW/MEDIUM/HIGH/CRITICAL)
  Stage 8: Summary agent (Qwen2.5-7B, final report)
  → persisted to SQLite (forensiai.db)
```

## Dual LLM Models — Both Use Same API Key

| Component | Model | .env location |
|---|---|---|
| AIVENTRA (CLI + ForensiAI Stage 1) | DeepSeek-V4-Pro | root `.env` (`FEATHERLESS_API_KEY`) |
| ForensiAI CrewAI agents (Stages 5,6,8) | Qwen2.5-7B-Instruct | `backend/.env` (`FEATHERLESS_API_KEY`) |

Both read `FEATHERLESS_API_KEY` via `load_dotenv()` at import time. Key must be set before any module imports.

## Gotchas

- `imghdr` deprecation warning in image_analyzer.py (Python 3.13 removal) — harmless
- `backend/requirements.txt` does NOT include AIVENTRA CLI deps (no typer, openai, PyMuPDF, opencv, ultralytics)
- `.env` files are gitignored — copy `.env.example` to `.env` in both root and `backend/`
- PII redaction is ON by default (`--no-redact` to disable in CLI)
- All AI-generated outputs are marked **advisory, not conclusive**
- Every extracted field links back to **source location** (page/section) for audit trail
- Track A (image_analyzer.py) does **not** use YOLO — the VLM sees every extracted image directly