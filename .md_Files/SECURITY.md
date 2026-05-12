# FORENSIAI — Security & Data Protection

> An overview of the security mechanisms implemented in FORENSIAI: PII redaction, hallucination detection, data isolation, file validation, and access controls.

---

## Overview

FORENSIAI handles sensitive forensic data including autopsy reports, victim identities, crime scene details, and investigative records. The security layer operates at three levels:

| Layer | Mechanism | Protects |
|---|---|---|
| **Data Sanitization** | PII redaction before LLM call | Victim/subject identities |
| **Output Integrity** | Cross-reference validation | AI hallucination and false findings |
| **System Integrity** | File validation + path isolation | Arbitrary file upload and path traversal |
| **Access Control** | Environment-based secrets + CORS | API key exposure and unauthorized access |

---

## 1. PII Redaction — Data Sanitization Before LLM Call

**File:** `backend/aiventra/core/rule_preprocessor.py`

PII is redacted from raw PDF text **before** the LLM sees it. This ensures sensitive data never reaches the API provider.

### 10 Redaction Patterns

| Field | Pattern | Example |
|---|---|---|
| `social_security` | `\d{3}-\d{2}-\d{4}` | `123-45-6789` → `[REDACTED_SOCIAL_SECURITY]` |
| `hkid` | HK ID regex | `A1234567(X)` → `[REDACTED_HKID]` |
| `phone` | 10-digit phone | `(555) 123-4567` → `[REDACTED_PHONE]` |
| `email` | Email regex | `victim@example.com` → `[REDACTED_EMAIL]` |
| `date_of_birth` | DOB keywords | `DOB: 03/15/1980` → `[REDACTED_DATE_OF_BIRTH]` |
| `address` | Street address | `123 Main St, Los Angeles, CA 90001` → `[REDACTED_ADDRESS]` |
| `mrn` | MRN keywords | `MRN: ABC-12345` → `[REDACTED_MRN]` |
| `case_number` | Case keywords | `Case No.: XYZ-001` → `[REDACTED_CASE_NUMBER]` |
| `officer_id` | P/D + digits | `P12345678` → `[REDACTED_OFFICER_ID]` |
| `person_name_title` | Title + name | `Dr. John Smith`, `Mr. Jones` → `[REDACTED_PERSON_NAME]` |

All patterns fire in a single pass. The list of redacted field names is tracked in `PreprocessedDocument.redacted_fields` so downstream logic knows what was sanitized without needing to re-examine the text.

**Important:** Redaction is ON by default in the AIVENTRA CLI. Use `aiventra analyze --no-redact` only in controlled environments.

---

## 2. Hallucination Detection — Cross-Reference Validation

**File:** `backend/aiventra/core/validator.py`

After the LLM extracts findings, the validator cross-references every field against the raw source document to detect AI hallucinations — findings that the model fabricated and cannot be back-sourced to the original text.

### How It Works

1. **Critical Field Check** — flags empty required fields (cause of death, manner of death, date of death)
2. **Cause of Death Cross-Reference** — searches for the extracted cause verbatim or by keyword overlap
3. **Manner of Death Cross-Reference** — verifies manner keyword appears in source text
4. **Injury Cross-Reference** — spot-checks each injury description against source tokens

### Confidence Adjustments

| Flag | Meaning | Adjustment |
|---|---|---|
| `MISSING_CRITICAL` | Required field empty | −0.15 |
| `HALLUCINATION_SUSPECT` | Extracted finding not found in source | −0.10 |
| `LOW_CONFIDENCE` | Finding present but unverifiable | −0.10 |
| `POSSIBLE_PARAPHRASE` | Partial keyword match (paraphrased) | −0.05 |
| `MISSING` | Optional field empty | −0.05 |

Extraction confidence is clamped to [0.0, 1.0] after all adjustments. Fields with `MISSING_CRITICAL`, `LOW_CONFIDENCE`, or `HALLUCINATION_SUSPECT` flags are marked `is_valid=False`.

### Advisory Notes

Every AI-generated output — autopsy extraction, forensic image captions, CCTV event descriptions — carries the field:

```
advisory_note: "Advisory output only - not conclusive evidence."
```

---

## 3. Source References — Audit Trail

**File:** `backend/aiventra/core/schemas.py`

Every extracted field includes a `source_location` that maps it back to the original PDF:

```python
InjuryObservation:
  source_location: "page 3, External Examination"

ToxicologyFinding:
  source_location: "page 5, Toxicology"

AutopsyExtraction:
  source_references: {"cause_of_death": "page 2", ...}
```

This means any output can be traced back to the exact page and section of the source document — essential for forensic admissibility and human review.

---

## 4. File Upload Validation

**File:** `backend/routes/upload.py`

Uploaded evidence files are validated at multiple points:

### File Type Allowlist

Only whitelisted `file_type` values are accepted:
```python
valid_types = ["autopsy", "cctv", "gps", "metadata", "image"]
```

Any other value returns `400 Bad Request`.

### Case Isolation

Files are stored in case-specific subdirectories:
```python
case_upload_dir = settings.upload_dir / case_id
```

### Path Traversal Prevention

File paths are resolved and validated before deletion:
```python
file_path = Path(evidence.file_path).resolve()
upload_root = Path(settings.upload_dir).resolve()
if upload_root in file_path.parents and file_path.exists():
    file_path.unlink()
```

If the resolved path escapes the upload root, the operation is silently skipped and the database record is still deleted. This prevents deletion of arbitrary system files.

---

## 5. Environment-Based Secrets

**Files:** `backend/aiventra/core/config.py`, `backend/config.py`

API keys and credentials are loaded from `.env` files via `python-dotenv`. The `.env` file is gitignored — secrets never enter version control.

### AIVENTRA Config

```python
class Config:
    API_KEY: str = os.getenv("FEATHERLESS_API_KEY", "")

    @classmethod
    def validate(cls) -> None:
        if not cls.API_KEY:
            raise EnvironmentError("FEATHERLESS_API_KEY not set")
```

If the API key is missing, the application raises an `EnvironmentError` at startup — it fails loudly, not silently.

### ForensiAI Config

Uses Pydantic Settings with environment variable validation. Default mock key ensures the app can start but clearly indicates configuration is needed:
```python
featherless_api_key: str = "mock_key_replace_with_yours"
```

---

## 6. CORS Control

**File:** `backend/main.py`

CORS is restricted to explicitly configured origins:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

In production, `FRONTEND_URL` in `.env` should be set to the actual deployed frontend URL.

---

## 7. Deterministic Fallback

**File:** `backend/aiventra/core/llm_extractor.py`

When the Featherless API is unavailable or returns an error, a deterministic regex-based fallback extraction activates:

- Cause of death → keyword search in "cause of death" section
- Manner of death → keyword matching
- Injuries → section scan + severity patterns
- Toxicology → substance + concentration regex

This ensures the platform remains functional without AI access and never silently returns fabricated data. Confidence drops to 0.2–0.45 in fallback mode.

---

## 8. Advisory Output Policy

All AI-generated outputs across all pipeline stages carry an explicit advisory notice:

> **"Advisory output only — not conclusive evidence."**

This applies to:
- Autopsy extractions (AutopsyExtraction)
- Forensic image captions (ForensicImageResult)
- CCTV event descriptions (VideoEvent)
- CrewAI agent enrichment (autopsy_agent, correlation_agent, summary_agent)

Human expert review is required before any output is used in an actual investigation.

---

## 9. Data Isolation — SQLite per Installation

The SQLite database (`forensiai.db`) and all uploaded files (`uploads/`) are stored locally and gitignored. There is no shared hosting of case data — each deployment is isolated.

---

## Security Checklist

- [ ] `.env` configured with real `FEATHERLESS_API_KEY` (not mock key)
- [ ] `FEATHERLESS_API_KEY` in both packages set to the same key
- [ ] `FRONTEND_URL` in ForensiAI `.env` matches actual frontend deployment URL
- [ ] `uploads/` directory is NOT committed to version control (gitignored)
- [ ] `forensiai.db` is NOT committed to version control (gitignored)
- [ ] PII redaction is ON for all production CLI usage
- [ ] All AI outputs reviewed by a qualified forensic expert before use

See [README.md](../README.md) for the full project overview and [AIVENTRA_PHASE1.md](AIVENTRA_PHASE1.md) for the Phase 1 pipeline details.
