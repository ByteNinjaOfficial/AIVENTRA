# FORENSIAI
### AI-Powered Forensic Investigation Platform

> An end-to-end forensic intelligence platform that combines multi-model AI extraction, multi-agent orchestration, and a web dashboard to help investigators triage evidence — autopsy reports, CCTV footage, GPS/mobile metadata — and generate structured investigation reports with deterministic risk scoring.

---

## Screenshots

| | |
|:--|:--|
| ![Main Dashboard](frontend/src/screenshots/ForensiAI%20-%20Main%20Dashboard.png) | ![New Case Registration](frontend/src/screenshots/ForensiAI%20-%20New%20Case%20Regestration.png) |
| **Dashboard** — Case metrics, risk levels, and quick actions | **New Case** — Multi-step wizard with evidence upload |
| ![Risk Engine](frontend/src/screenshots/ForensiAI%20-%20Risk%20Engine.png) | ![AI Analysis](frontend/src/screenshots/ForensiAI%20-%20AI%20Analysis%20Section.png) |
| **Risk Engine** — Circular gauge (0–100) with 11 triggered flags | **AI Analysis** — Autopsy findings, correlation anomalies, summary |
| ![Narrative Graph](frontend/src/screenshots/ForensiAI%20-%20Narrative%20Graph.png) | ![Evidence Database](frontend/src/screenshots/ForensiAI%20-%20Evidence%20DataBase.png) |
| **Narrative Graph** — Interactive React Flow evidence graph | **Evidence** — Upload autopsy PDFs, CCTV logs, GPS, metadata |
| ![Q&A Chatbot](frontend/src/screenshots/ForensiAI%20-%20Q&A%20Chatbot.png) | ![Case Details](frontend/src/screenshots/ForensiAI%20-%20Case%20Details%20with%20latest%20report%20generated%20after%20adding%20CCTV%20video%20to%20evidence.png) |
| **Q&A** — Ask questions with source citations | **Case Details** — Victim profile, timeline, generated report |
| ![Pipeline Architecture](frontend/src/screenshots/flow.jpeg) | |
| **Pipeline Architecture** — Full 8-stage investigation flow from evidence upload to report generation | |

---

## AI Setup

FORENSIAI's AI layer has three integrated components — AIVENTRA (Phase 1 + Tracks A & B) handles forensic extraction; ForensiAI's multi-agent system handles enrichment, correlation, and risk assessment.

---

### AIVENTRA Phase 1 — Autopsy PDF Text Extraction

AIVENTRA parses autopsy reports into structured forensic findings using a four-stage pipeline.

```
PDF → parse → preprocess → LLM extract → validate → ExtractionResult
```

**Stage 1 — Parse**
pdfplumber extracts raw text, tables, and page count from the PDF. Tables are flattened into structured dicts.

**Stage 2 — Preprocess**
Rule-based normalization handles:
- **Measurements** — standardizes cm, mm, kg, g, lbs, mcg, µg, mg, ng, mL, dL
- **Dates** — converts MM/DD/YYYY, DD-MM-YYYY to ISO 8601 (YYYY-MM-DD)
- **PII Redaction** — 10 patterns redacted by default (SSN, HKID, phone, email, DOB, address, MRN, case number, officer ID, person name/title)
- **Section Detection** — splits into 25+ document sections (external examination, internal examination, cardiovascular, respiratory, CNS, toxicology, cause of death, manner of death, etc.)
- **Document Type Detection** — classifies as `autopsy` or `crime_scene`

**Stage 3 — LLM Extract**
DeepSeek-V4-Pro (via Featherless API, temperature=0.0) extracts structured JSON:
- `case_identifier`, `date_of_exam`, `date_of_death`
- `cause_of_death`, `manner_of_death` (natural / accident / homicide / suicide / undetermined)
- `certainty` (confirmed / probable / possible / undetermined)
- `contributing_factors`, `injury_patterns`, `toxicology_findings`
- `extraction_confidence` (0.0–1.0)
- `source_references` — maps every field to page/section location for audit trail

If the LLM API fails, a deterministic fallback extracts findings via regex keyword matching (confidence drops to 0.2–0.45).

**Stage 4 — Validate**
Cross-references every extracted field against the raw document:
- **HALLUCINATION_SUSPECT** — extracted cause/manner not found in text → confidence −0.10
- **MISSING_CRITICAL** — required fields empty → confidence −0.15
- **POSSIBLE_PARAPHRASE** — partial text match → confidence −0.05
- **LOW_CONFIDENCE** — field present but unverifiable → confidence −0.10

Every extracted field carries a `source_location` reference back to the PDF. Every AI output is marked **"advisory, not conclusive"**.

> See [.md_files/AIVENTRA_PHASE1.md](.md_files/AIVENTRA_PHASE1.md) for the full pipeline documentation with architecture diagram.

```bash
# CLI commands
aiventra analyze report.pdf                          # Phase 1 text extraction
aiventra analyze --no-redact report.pdf              # Disable PII redaction
aiventra analyze -o result.json report.pdf           # Save output to JSON
aiventra check                                       # Verify config and dependencies
```

---

### AIVENTRA Track A — PDF Image Analysis

PyMuPDF extracts every embedded image from the PDF (filters out single-color images and anything smaller than 64×64 px). All remaining images are sent to Qwen3.5-397B in batches of 2 for forensic captioning.

Output: `ForensicImageResult` per image — `image_id`, `source_location`, `forensic_description`, `confidence`.

```bash
aiventra analyze-images report.pdf
```

---

### AIVENTRA Track B — CCTV Video Analysis

Four-layer pipeline processes video footage:

1. **Frame Sampling** — OpenCV extracts frames at configurable FPS (default 1 FPS)
2. **Motion Filter** — MOG2 background subtraction keeps only frames with >500 moving pixels
3. **Object Detection** — YOLOv11n (parallel multiprocessing) detects person, knife, blood, bag, backpack, chair, cell phone, etc.
4. **VLM Captioning** — Qwen3.5-397B generates forensic event descriptions for all classified frames

Output: `VideoEvent` per relevant frame — `event_type` (blood_visible / weapon_visible / person_present / empty_frame / property_evidence), `timestamp`, `frame_number`, `detected_objects[]`, `event_description`, `confidence`.

```bash
aiventra analyze-video clip.mp4                      # Full pipeline
aiventra analyze-video clip.mp4 --skip-motion        # Bypass MOG2
aiventra analyze-video clip.mp4 --skip-yolo          # Send all motion frames to VLM
```

---

## Multi-Agent System — ForensiAI Investigation Pipeline

ForensiAI wraps AIVENTRA in an 8-stage investigation pipeline triggered by `POST /cases/{id}/analyze`. All three CrewAI agents use Qwen2.5-7B-Instruct via Featherless API.

```
Stage 1: PARSE EVIDENCE          → AIVENTRA (text + Track A + Track B) + csv_parser
Stage 2: NORMALIZE DATA          → Standardize timestamps, units, formats
Stage 3: TIME OF DEATH           → Algor + rigor mortis (deterministic Henssge nomogram)
Stage 4: TIMELINE RECONSTRUCTION → Sort, deduplicate, merge events (15-min windows)
Stage 5: HYBRID AUTOPSY          → AIVENTRA extraction + CrewAI autopsy_agent enrichment
Stage 6: CORRELATION AGENT       → Anomaly detection across evidence sources
Stage 7: RISK ENGINE             → 11-rule deterministic scoring
Stage 8: SUMMARY AGENT           → Crime story narrative + recommendations
         → persisted to SQLite (forensiai.db)
```

### Autopsy Agent (Stage 5)

CrewAI agent — receives AIVENTRA's structured extraction and enriches it with cautious investigative interpretation:
- `interpretive_summary` — what the findings suggest in context
- `medical_significance` — why this matters for the investigation
- `investigative_considerations` — follow-up questions the examiner should ask

**Important:** The agent does NOT override AIVENTRA's source-backed fields (cause of death, injuries, validation flags, image findings). It only adds interpretive context.

### Correlation Agent (Stage 6)

CrewAI agent — cross-references evidence from all sources (autopsy, CCTV, GPS, metadata) to identify anomalies and suspicious patterns:
- CCTV footage gaps or unusual timing
- GPS route inconsistencies (vehicle in two locations faster than physically possible)
- Witness statement discrepancies
- Timeline gaps in event records

### Time-of-Death Calculator

Deterministic Henssge nomogram — uses body temperature (algor mortis cooling rate) and rigor mortis staging to estimate the death window, returning confidence score and ±hour range.

### Risk Engine (Stage 7)

11 deterministic scoring rules, each contributing a weighted score:

| Rule | Score |
|---|---|
| CCTV blackout detected | +25 |
| Phone disconnect before death | +20 |
| Multiple injuries on body | +30 |
| Excessive sharp force trauma | +35 |
| Defensive wounds present | +20 |
| Vital organ damage | +25 |
| Toxic substances detected | +25 |
| Timeline gaps in evidence | +15 |
| Witness discrepancies | +20 |
| Recent conflict / altercation | +25 |
| Suspicious scene characteristics | +20 |

Risk level: **LOW** (0–25) / **MEDIUM** (26–50) / **HIGH** (51–75) / **CRITICAL** (76+).

### Summary Agent (Stage 8)

CrewAI agent — generates the final investigation report:
- `crime_story` — narrative of events based on all evidence
- `story_beats` — 4–8 chronological phases (normal → suspicious → critical)
- `recommendations` — actionable next steps for investigators

---

## Web Platform

A React single-page application with 7 tabs communicating with the FastAPI backend at `http://localhost:8000`.

| Tab | What it shows |
|---|---|
| **Dashboard** | Case metrics (total, active, high-risk), case list with risk badges and status |
| **Case Details** | Victim profile, case summary, timeline of events, report generation |
| **Evidence** | Upload autopsy PDFs, CCTV videos, GPS logs, mobile metadata, images |
| **AI Analysis** | Autopsy findings (cause/manner/confidence), correlation anomalies, investigation summary |
| **Risk Engine** | Circular gauge (0–100) with triggered risk flags and individual scores |
| **Narrative Graph** | Interactive React Flow graph — nodes for evidence, people, locations, AI flags, notes, hypotheses; edges for relationships (corroborates, contradicts, implicates) |
| **Q&A** | Chat interface — ask case questions, get AI answers with source citations |

**Case Creation Flow** — Multi-step wizard: victim info → evidence upload → processing progress → analysis complete.

---

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- [Featherless AI](https://featherless.ai) API key

> See [.md_files/SETUP.md](.md_files/SETUP.md) for step-by-step setup instructions.
> See [.md_files/API_KEY_SETUP.md](.md_files/API_KEY_SETUP.md) for detailed API key configuration.

### 1. Frontend (recommended first)

```bash
cd apps/forensi-frontend
npm install
npm run dev
# Opens at http://localhost:3000
```

### 2. Backend API

```bash
cd apps/forensi-api
pip install -r requirements.txt
cp .env.example .env
# Add FEATHERLESS_API_KEY to .env
python src/main.py
# Runs at http://localhost:8000
# API docs at http://localhost:8000/docs
```

### 3. AIVENTRA CLI (standalone forensic extraction)

```bash
pip install -r packages/aiventra/requirements.txt
pip install -e packages/aiventra
aiventra check                                    # Verify setup
aiventra analyze report.pdf                       # Autopsy PDF extraction
aiventra analyze-images report.pdf                # Track A: PDF images
aiventra analyze-video clip.mp4                   # Track B: CCTV video
```

### 4. Run Tests

```bash
PYTHONPATH=packages/aiventra pytest packages/aiventra/tests/ -v
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/cases` | Create investigation case |
| `GET` | `/cases` | List all cases |
| `GET` | `/cases/{id}` | Get case details |
| `PUT` | `/cases/{id}` | Update case notes |
| `POST` | `/cases/{id}/upload` | Upload evidence file |
| `GET` | `/cases/{id}/evidence` | List uploaded evidence |
| `POST` | `/cases/{id}/analyze` | Trigger 8-stage pipeline |
| `GET` | `/cases/{id}/results` | Poll analysis status & results |
| `GET` | `/cases/{id}/timeline` | Get reconstructed timeline |
| `GET` | `/cases/{id}/report` | Generate & retrieve full report |
| `GET` | `/cases/{id}/risk-flags` | Get triggered risk flags |

---

## Configuration

Two `.env` files, one per package. Both need the same `FEATHERLESS_API_KEY` but different model names:

```env
# packages/aiventra/.env (AIVENTRA uses DeepSeek-V4-Pro)
FEATHERLESS_API_KEY=your_key_here
AIVENTRA_MODEL=deepseek-ai/DeepSeek-V4-Pro
AIVENTRA_LLM_TEMPERATURE=0.0
AIVENTRA_LLM_MAX_TOKENS=4096

# apps/forensi-api/.env (ForensiAI agents use Qwen2.5-7B)
FEATHERLESS_API_KEY=your_key_here          # same key
MODEL_NAME=Qwen/Qwen2.5-7B-Instruct
DATABASE_URL=sqlite:///./forensiai.db
UPLOAD_DIR=uploads
MAX_UPLOAD_SIZE_MB=50
FRONTEND_URL=http://localhost:3000
```

> See [.md_files/INDEX.md](.md_files/INDEX.md) for the full project documentation index.

---

## Security & Data Protection

FORENSIAI implements a multi-layer security approach for sensitive forensic data:

| Mechanism | Protects |
|---|---|
| **PII Redaction** | Victim/subject identities — 10 patterns redacted before LLM call |
| **Hallucination Detection** | AI-fabricated findings — cross-reference validation flags suspicious outputs |
| **Source References** | Audit trail — every field links back to page/section in the original PDF |
| **File Validation** | Upload integrity — type allowlist, path traversal prevention |
| **Environment Secrets** | API keys never enter version control |
| **CORS Control** | Backend only accepts requests from configured frontend origin |
| **Deterministic Fallback** | Platform remains functional when AI is unavailable |

> See [.md_files/SECURITY.md](.md_files/SECURITY.md) for the full security documentation.
> See [.md_files/DEPLOYMENT_CHECKLIST.md](.md_files/DEPLOYMENT_CHECKLIST.md) for complete deployment guidance.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript 5.5, Vite 5, Tailwind CSS, Zustand, React Flow, Recharts |
| Backend | FastAPI 0.104, SQLAlchemy 2.0, Pydantic 2.5 |
| AI Orchestration | CrewAI 0.30, LiteLLM 1.35 |
| LLM Provider | Featherless AI (OpenAI-compatible API) |
| AIVENTRA Extraction | DeepSeek-V4-Pro |
| AIVENTRA VLM | Qwen3.5-397B-A17B |
| ForensiAI Agents | Qwen2.5-7B-Instruct |
| Database | SQLite |
| PDF Parsing | pdfplumber, PyMuPDF, pytesseract |
| Computer Vision | OpenCV, Ultralytics YOLOv11n |
| CLI | Typer |

---

## Warnings

- **All AI outputs are advisory, not conclusive.** Human expert review is required for all investigation decisions.
- **PII redaction is ON by default** in AIVENTRA CLI. Use `--no-redact` to disable.
- **Full pipeline (with AI inference) takes 30–120 seconds** depending on evidence complexity.
- **Two separate AI models** — AIVENTRA uses DeepSeek-V4-Pro; ForensiAI agents use Qwen2.5-7B. Both use the same Featherless API key but are configured independently.
- **`.env` files are gitignored.** Copy `.env.example` to `.env` in both packages before running anything.

---

## Troubleshooting

**Port 8000 already in use?**
```bash
cd apps/forensi-api && python -c "import uvicorn; uvicorn.run('main:app', host='0.0.0.0', port=8001)"
```

**Frontend port 3000 in use?**
Edit `apps/forensi-frontend/vite.config.js` — change `port: 3000` to your desired port.

**Featherless API failing?**
- Verify `FEATHERLESS_API_KEY` is set in both `.env` files
- The deterministic fallback activates automatically when the API is unavailable
- Check API status at https://featherless.ai

**CORS errors in browser?**
Ensure `FRONTEND_URL=http://localhost:3000` is set in `apps/forensi-api/.env`, then restart the backend.

**Tests failing with ModuleNotFoundError?**
```bash
PYTHONPATH=packages/aiventra pytest packages/aiventra/tests/ -v
```

**Database locked?**
Delete `apps/forensi-api/forensiai.db` and restart the backend — it recreates automatically.

---

## License

This project is licensed under the **Apache License, Version 2.0**.

See [LICENSE.txt](LICENSE.txt) for the full license text.

**Copyright 2026 ByteNinja**
