"""Pydantic schemas for autopsy report extraction.

These models define the structured output contract used across all pipeline stages.
Every field in AutopsyExtraction links back to its source location for auditability.
"""

from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class Certainty(str, Enum):
    CONFIRMED = "confirmed"
    PROBABLE = "probable"
    POSSIBLE = "possible"
    UNDETERMINED = "undetermined"


class MannerOfDeath(str, Enum):
    NATURAL = "natural"
    ACCIDENT = "accident"
    HOMICIDE = "homicide"
    SUICIDE = "suicide"
    UNDETERMINED = "undetermined"
    PENDING = "pending"


class InjuryObservation(BaseModel):
    description: str
    body_region: str
    injury_type: str
    severity: Optional[str] = None
    source_location: str = Field(
        description="Page and paragraph in original document for audit trail"
    )


class ToxicologyFinding(BaseModel):
    substance: str
    concentration: Optional[str] = None
    unit: Optional[str] = None
    significance: Optional[str] = None
    source_location: str = Field(
        description="Page and paragraph in original document for audit trail"
    )


class AutopsyExtraction(BaseModel):
    case_identifier: Optional[str] = None
    date_of_exam: Optional[str] = None
    date_of_death: Optional[str] = None
    cause_of_death: Optional[str] = None
    manner_of_death: Optional[MannerOfDeath] = None
    certainty: Certainty = Certainty.UNDETERMINED
    contributing_factors: List[str] = Field(default_factory=list)
    injury_patterns: List[InjuryObservation] = Field(default_factory=list)
    medical_observations: List[str] = Field(default_factory=list)
    toxicology_findings: List[ToxicologyFinding] = Field(default_factory=list)
    postmortem_interval_estimate: Optional[str] = None
    extraction_confidence: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Overall confidence in extraction accuracy (0.0-1.0)",
    )
    validation_flags: List[str] = Field(
        default_factory=list,
        description="Anomalies, hallucination suspects, missing critical fields",
    )
    source_references: dict = Field(
        default_factory=dict,
        description="Maps extracted field name to source location (page/paragraph)",
    )


class SectionContent(BaseModel):
    name: str
    content: str
    page_number: int
    start_paragraph: Optional[int] = None


class PreprocessedDocument(BaseModel):
    raw_text: str
    sections: List[SectionContent] = Field(default_factory=list)
    page_count: int
    tables: List[dict] = Field(
        default_factory=list,
        description="Extracted table data as list of dicts",
    )
    redacted_fields: List[str] = Field(
        default_factory=list,
        description="PII fields that were redacted before LLM call",
    )
    document_type: Optional[str] = Field(
        default=None,
        description="Detected document type: autopsy, crime_scene, or unknown",
    )


class ValidationResult(BaseModel):
    is_valid: bool = True
    confidence_adjustment: float = 0.0
    flags: List[str] = Field(default_factory=list)
    cross_references: dict = Field(
        default_factory=dict,
        description="Maps extracted field to raw text snippet for verification",
    )


class ExtractionResult(BaseModel):
    extraction: AutopsyExtraction
    validation: ValidationResult
    preprocessed: PreprocessedDocument
    model_used: Optional[str] = None
    processing_time_seconds: Optional[float] = None


# ── Phase 2: Forensic Image & Video Analysis ──────────────────────────────────

class DetectedObject(BaseModel):
    """YOLO detection result."""

    class_name: str = Field(description="YOLO class label, e.g. person, knife, blood")
    confidence: float = Field(ge=0.0, le=1.0)
    bounding_box: Optional[List[float]] = Field(
        default=None,
        description="Bounding box [x_min, y_min, x_max, y_max] in normalised coords",
    )


class ForensicImageResult(BaseModel):
    """Structured forensic analysis of a single image."""

    image_id: str
    source_type: str = Field(description="Source type, e.g. pdf_image, cctv_frame")
    source_location: str = Field(
        description="Page xref or video timestamp/frame for audit trail"
    )
    detected_objects: List[DetectedObject] = Field(default_factory=list)
    forensic_description: str = Field(description="Qwen3.5-397B forensic caption")
    confidence: float = Field(ge=0.0, le=1.0)
    flags: List[str] = Field(default_factory=list)
    advisory_note: str = Field(
        default="Advisory output only — not conclusive evidence.",
        description="All AI image outputs are advisory-only per forensic policy.",
    )


class ImageAnalysisResult(BaseModel):
    """Aggregate result for Track A (PDF images) or bulk image analyse."""

    images: List[ForensicImageResult] = Field(default_factory=list)
    total_images_extracted: int = Field(default=0)
    relevant_images: int = Field(default=0)
    processing_time_seconds: float = Field(default=0.0)
    model_used: Optional[str] = None


class VideoEvent(BaseModel):
    """A single event detected inside a CCTV clip."""

    event_type: str = Field(description="Classified event, e.g. person_entry, weapon_visible, suspicious_carry")
    timestamp_seconds: float = Field(description="Video timestamp in seconds")
    frame_number: int
    detected_objects: List[DetectedObject] = Field(default_factory=list)
    event_description: str = Field(description="Qwen3.5-397B forensic caption")
    confidence: float = Field(ge=0.0, le=1.0)
    motion_score: float = Field(default=0.0, ge=0.0, le=1.0)
    flags: List[str] = Field(default_factory=list)
    advisory_note: str = Field(
        default="Advisory output only — not conclusive evidence.",
        description="All AI video outputs are advisory-only per forensic policy.",
    )


class VideoAnalysisResult(BaseModel):
    """Track B: full CCTV clip analysis result."""

    video_path: str
    events: List[VideoEvent] = Field(default_factory=list)
    total_events: int = Field(default=0)
    frames_sampled: int = Field(default=0)
    motion_frames: int = Field(default=0)
    yolo_relevant_frames: int = Field(default=0)
    frame_sample_rate_fps: int = Field(default=1)
    processing_time_seconds: float = Field(default=0.0)
    model_used: Optional[str] = None