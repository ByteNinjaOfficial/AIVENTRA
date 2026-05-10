from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime


class EvidenceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    case_id: str
    file_type: str
    file_name: str
    file_path: str
    processed: bool
    uploaded_at: datetime

class RiskFlagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    case_id: str
    flag_name: str
    description: str
    score: float
    created_at: datetime


class QARequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)


class QAResponse(BaseModel):
    answer: str
    sources: list[str] = Field(default_factory=list)
