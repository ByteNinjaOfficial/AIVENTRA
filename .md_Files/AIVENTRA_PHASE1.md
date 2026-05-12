# AIVENTRA Phase 1 — Autopsy PDF Text Extraction

> A deep-dive into AIVENTRA's core forensic extraction pipeline: how it parses autopsy PDFs, redacts PII, extracts structured findings via DeepSeek-V4-Pro, and validates outputs against source documents.

![Pipeline Architecture](frontend/src/screenshots/flow.jpeg)

---

## Pipeline Overview

```
PDF → extract_text → preprocess → extract_findings → validate → ExtractionResult
```

The pipeline has four stages, each producing an audit trail. Every extracted field links back to its source page and section in the original document.

---

## Stage 1 — Parse

pdfplumber extracts:
- **Raw text** — full document text per page
- **Tables** — structured dicts (flattened for LLM consumption)
- **Page count** — total pages for `source_location` references

pytesseract is used as OCR fallback when `pytesseract>=0.3.10` is installed and `AIVENTRA_OCR_FALLBACK=true`.

---

## Stage 2 — Preprocess

### Measurements Normalization

Standardizes units to reduce token usage and improve LLM consistency:

| Unit | Pattern | Output |
|---|---|---|
| Length | `170cm`, `5cm` | `170 cm`, `5 cm` |
| Weight | `72.5kg`, `1850g` | `72.5 kg`, `1850 g` |
| Mass | `10mg`, `5mcg` | `10 mg`, `5 µg` |
| Volume | `10ml`, `5dl` | `10 mL`, `5 dL` |
| Other | `lbs`, `ng` | normalized |

### Date Normalization

Converts non-ISO dates to ISO 8601 (YYYY-MM-DD):
- `03/15/2024` → `2024-03-15`
- `15-03-2024` → `2024-03-15`
- `3/5/2024` → `2024-03-05`

### PII Redaction

9 patterns redacted by default (`--no-redact` to disable):

| Field | Pattern | Replacement |
|---|---|---|
| `social_security` | `\d{3}-\d{2}-\d{4}` | `[REDACTED_SOCIAL_SECURITY]` |
| `hkid` | Hong Kong ID format | `[REDACTED_HKID]` |
| `phone` | 10-digit phone numbers | `[REDACTED_PHONE]` |
| `email` | Email addresses | `[REDACTED_EMAIL]` |
| `date_of_birth` | DOB with labels | `[REDACTED_DATE_OF_BIRTH]` |
| `address` | Street addresses | `[REDACTED_ADDRESS]` |
| `mrn` | Medical record numbers | `[REDACTED_MRN]` |
| `case_number` | Case/file numbers | `[REDACTED_CASE_NUMBER]` |
| `officer_id` | P/D + 5-8 digits | `[REDACTED_OFFICER_ID]` |
| `person_name_title` | Dr./Mr./Mrs./Ms. + name | `[REDACTED_PERSON_NAME]` |

All 10 patterns fire simultaneously. The list of redacted field names is returned in `PreprocessedDocument.redacted_fields` so downstream logic knows what was sanitized.

### Section Detection

25+ section headers detected across two document types:

**Autopsy sections** — external examination, internal examination, cardiovascular, respiratory, CNS, GI, hepatobiliary, genitourinary, endocrine, musculoskeletal, toxicology, histopathology, microscopic examination, cause of death, manner of death, opinion, summary, diagnosis, findings, clinical summary, circumstances of death, identification, demographics, evidence of injury, medical history

**Crime scene sections** — incident report, crime scene report, primary body examination, evidence collected on body, opinions, apparent manner of death, apparent cause of death, narrative, inventory of evidence, reporting officers' narrative

Page headers (`--- Page X ---`) are recognized to assign the correct `page_number` to each section. This feeds `source_location` in the final extraction.

### Document Type Detection

Keyword frequency scoring across `autopsy` and `crime_scene` vocabularies. Returns `autopsy`, `crime_scene`, or `unknown`.

---

## Stage 3 — LLM Extract

DeepSeek-V4-Pro (via Featherless API, temperature=0.0, max_tokens=4096) extracts structured JSON from the preprocessed document.

### Output Schema

```python
AutopsyExtraction:
  case_identifier         # Case number
  date_of_exam          # YYYY-MM-DD
  date_of_death         # YYYY-MM-DD
  cause_of_death        # Primary cause
  manner_of_death       # natural / accident / homicide / suicide / undetermined / pending
  certainty             # confirmed / probable / possible / undetermined
  contributing_factors  # List[str]
  injury_patterns        # List[InjuryObservation]
  medical_observations  # List[str]
  toxicology_findings   # List[ToxicologyFinding]
  extraction_confidence # float (0.0–1.0)
  source_references     # dict — maps field → page/section location
  validation_flags     # List[str]
```

### InjuryObservation

```python
description:      str
body_region:      str   # head, chest, abdomen, etc.
injury_type:      str   # fracture, laceration, gunshot, etc.
severity:         str   # severe, moderate, minor
source_location:  str   # "page 3, External Examination"
```

### ToxicologyFinding

```python
substance:        str
concentration:    str
unit:             str   # g/dL, mg/dL, ng/mL, etc.
significance:     str   # elevated, therapeutic, fatal
source_location:  str
```

### Fallback Extraction

If the LLM API is unavailable, `_fallback_extract_findings()` performs deterministic regex-based keyword extraction:
- Cause of death → keyword search in "cause of death" section
- Manner of death → keyword matching against manner list
- Injuries → section scan + severity keywords
- Toxicology → substance + concentration patterns

Confidence drops to 0.2–0.45 in fallback mode. The pipeline never silently fails.

---

## Stage 4 — Validate

Cross-references every extracted field against the raw document to detect hallucinations and inconsistencies.

### Critical Field Check

Flags required fields that are empty:
- `MISSING_CRITICAL: cause_of_death is empty` → −0.15
- `MISSING_CRITICAL: manner_of_death is empty` → −0.15
- `MISSING: date_of_death is empty` → −0.05
- `MISSING: date_of_exam is empty` → −0.05

### Cause of Death Cross-Reference

| Condition | Result |
|---|---|
| Exact match in source text | High confidence, `source_references` populated |
| 40%+ keyword overlap | Partial match, `POSSIBLE_PARAPHRASE` flag → −0.05 |
| 20–40% overlap | `POSSIBLE_PARAPHRASE` flag → −0.05 |
| Keywords present but no match | `HALLUCINATION_SUSPECT` flag → −0.10 |
| No match, no keywords | `LOW_CONFIDENCE` flag → −0.10 |

### Manner of Death Cross-Reference

| Expected Manner | Keywords Searched |
|---|---|
| NATURAL | natural, natural causes, disease |
| ACCIDENT | accident, accidental, unintentional |
| HOMICIDE | homicide, homicidal, killed by, murder |
| SUICIDE | suicide, suicidal, self-inflicted, took own life |
| UNDETERMINED | undetermined, could not be determined, inconclusive |

### Injury Cross-Reference

Each `InjuryObservation.description` is tokenized and spot-checked against the raw text. Keywords < 4 characters are ignored. Unmatched injuries are flagged `HALLUCINATION_SUSPECT` → −0.10 per injury.

### Confidence Adjustment Summary

| Flag Prefix | Adjustment |
|---|---|
| `MISSING_CRITICAL` | −0.15 |
| `HALLUCINATION_SUSPECT` | −0.10 |
| `LOW_CONFIDENCE` | −0.10 |
| `POSSIBLE_PARAPHRASE` | −0.05 |
| `MISSING` | −0.05 |

---

## CLI Commands

```bash
aiventra analyze report.pdf                    # Full pipeline
aiventra analyze report.pdf -o result.json    # Save JSON output
aiventra analyze report.pdf --no-redact       # Disable PII redaction
aiventra analyze report.pdf -m gpt-4o         # Override model
aiventra analyze report.pdf -t 0.1            # Override temperature
aiventra check                                # Verify config + deps
```

---

## Configuration

```env
FEATHERLESS_API_KEY=your_key_here
FEATHERLESS_BASE_URL=https://api.featherless.ai/v1
AIVENTRA_MODEL=deepseek-ai/DeepSeek-V4-Pro
AIVENTRA_LLM_TEMPERATURE=0.0
AIVENTRA_LLM_MAX_TOKENS=4096
AIVENTRA_OCR_FALLBACK=true
# Optional: TESSERACT_CMD=/usr/bin/tesseract
```

---

## Architecture Diagram

![FORENSIAI Pipeline Flow](frontend/src/screenshots/flow.jpeg)

The diagram shows the complete ForensiAI pipeline from evidence upload through 8-stage analysis to final report generation.

---

See [README.md](../README.md) for the full project overview, Track A/B details, and web platform documentation.
