from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, PlainTextResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import Case, AIResult, RiskFlag
from schemas.result_schema import ReportResponse
from services.report_document import render_report_html, render_report_markdown
from services.report_generator import ReportGenerator
from utils.logger import log_info

router = APIRouter(prefix="/cases", tags=["results"])


class QuestionRequest(BaseModel):
    question: str


@router.get("/{case_id}/results")
async def get_analysis_results(case_id: str, db: Session = Depends(get_db)):
    """
    Get analysis results for a case
    
    Returns:
    - processing: If analysis is still running
    - complete: If analysis is done with full results
    """
    
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    if case.status == "processing":
        return {
            "status": "processing",
            "case_id": case_id,
            "message": "Analysis pipeline is still running. Please check back soon."
        }
    
    if case.status == "failed":
        return {
            "status": "failed",
            "case_id": case_id,
            "message": "Analysis pipeline encountered an error."
        }
    
    if case.status == "completed":
        # Check if AI results exist
        ai_results = db.query(AIResult).filter(
            AIResult.case_id == case_id
        ).all()
        
        if not ai_results:
            return {
                "status": "processing",
                "case_id": case_id,
                "message": "Analysis pipeline is still processing results..."
            }
        
        return {
            "status": "complete",
            "case_id": case_id,
            "results_ready": True
        }
    
    return {
        "status": case.status,
        "case_id": case_id
    }


@router.get("/{case_id}/report", response_model=dict)
async def get_case_report(case_id: str, db: Session = Depends(get_db)):
    """
    Generate and return final investigation report
    
    Combines:
    - Case information
    - AI analysis results
    - Timeline reconstruction
    - Risk assessment
    """
    
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    if case.status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Case analysis not completed. Current status: {case.status}"
        )
    
    report = ReportGenerator.generate_report(case_id, db)
    
    log_info(f"[OK] Report generated for {case_id}")
    
    return report


@router.get("/{case_id}/report/document", response_class=HTMLResponse)
async def get_case_report_document(case_id: str, db: Session = Depends(get_db)):
    """Generate a printable documented HTML investigation report."""
    report = _get_completed_report(case_id, db)
    return HTMLResponse(render_report_html(report))


@router.get("/{case_id}/report/markdown", response_class=PlainTextResponse)
async def get_case_report_markdown(case_id: str, db: Session = Depends(get_db)):
    """Generate a documented Markdown investigation report."""
    report = _get_completed_report(case_id, db)
    return PlainTextResponse(
        render_report_markdown(report),
        headers={"Content-Disposition": f'attachment; filename="{case_id}-forensiai-report.md"'}
    )


def _get_completed_report(case_id: str, db: Session):
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if case.status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Case analysis not completed. Current status: {case.status}"
        )

    report = ReportGenerator.generate_report(case_id, db)
    log_info(f"[OK] Documented report generated for {case_id}")
    return report


@router.get("/{case_id}/risk-flags", response_model=list[dict])
async def list_risk_flags(case_id: str, db: Session = Depends(get_db)):
    """Return the risk flags triggered for a case."""
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    flags = db.query(RiskFlag).filter(
        RiskFlag.case_id == case_id
    ).order_by(RiskFlag.score.desc()).all()

    return [
        {
            "id": flag.id,
            "case_id": flag.case_id,
            "flag_name": flag.flag_name,
            "description": flag.description,
            "score": flag.score,
            "created_at": str(flag.created_at)
        }
        for flag in flags
    ]


@router.post("/{case_id}/qa", response_model=dict)
async def ask_case_question(case_id: str, payload: QuestionRequest, db: Session = Depends(get_db)):
    """Answer investigator questions from structured case data only."""
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")

    report = ReportGenerator.generate_report(case_id, db) if case.status == "completed" else {
        "case_id": case.case_id,
        "victim_name": case.victim_name,
        "incident_location": case.incident_location,
        "incident_date": case.incident_date,
        "status": case.status,
        "case_notes": case.notes,
        "risk_level": case.risk_level,
        "risk_score": case.risk_score,
        "timeline": [],
        "flags": [],
        "recommendations": []
    }

    answer, sources = _answer_from_report(question, report)
    return {
        "answer": answer,
        "sources": sources,
        "case_id": case_id,
        "advisory": "AI-assisted response for triage only. Verify against original evidence and expert review."
    }


def _answer_from_report(question: str, report: dict) -> tuple[str, list[str]]:
    """Small deterministic Q&A layer grounded in the generated report."""
    q = question.lower()
    structured = report.get("structured_report", {})
    autopsy = structured.get("autopsy_findings", {})
    correlation = structured.get("correlation_analysis", {})
    summary = structured.get("investigation_summary", {})
    intelligence = structured.get("investigative_intelligence") or report.get("investigative_intelligence", {})
    risk = structured.get("risk_assessment", {})
    timeline = structured.get("timeline_analysis", {}).get("events") or report.get("timeline", [])
    flags = risk.get("flags") or report.get("flags", [])
    recommendations = summary.get("recommendations") or report.get("recommendations", [])

    sources: list[str] = []
    parts: list[str] = []

    if any(term in q for term in ["autopsy", "cause", "manner", "injur", "toxicology"]):
        injuries = autopsy.get("injuries") or report.get("injuries") or []
        toxicology = autopsy.get("toxicology") or report.get("toxicology") or []
        parts.append(
            "Autopsy summary: cause of death is "
            f"{autopsy.get('cause_of_death') or report.get('cause_of_death', 'under investigation')}; "
            f"manner is {autopsy.get('manner_of_death') or report.get('manner_of_death', 'not determined')}."
        )
        if injuries:
            parts.append("Key injuries: " + "; ".join(map(str, injuries[:6])) + ".")
        if toxicology:
            parts.append("Toxicology notes: " + "; ".join(map(str, toxicology[:4])) + ".")
        sources.append("structured_report.autopsy_findings")

    if any(term in q for term in ["timeline", "time", "when", "event"]):
        if timeline:
            parts.append(
                f"Timeline contains {len(timeline)} event(s). First event: "
                f"{timeline[0].get('timestamp')} - {timeline[0].get('event')}. "
                f"Last event: {timeline[-1].get('timestamp')} - {timeline[-1].get('event')}."
            )
        else:
            parts.append("No timeline events are available for this case yet.")
        sources.append("structured_report.timeline_analysis")

    if any(term in q for term in ["risk", "flag", "score", "critical", "recommend"]):
        parts.append(
            f"Risk assessment: {risk.get('risk_level') or report.get('risk_level', 'LOW')} "
            f"with score {risk.get('risk_score') or report.get('risk_score', 0)}/100."
        )
        if flags:
            parts.append("Triggered flags: " + "; ".join(f"{item.get('name', item.get('flag_name', 'flag'))}: {item.get('description', '')}" for item in flags[:5]) + ".")
        if recommendations:
            parts.append("Recommended actions: " + "; ".join(map(str, recommendations[:5])) + ".")
        sources.extend(["structured_report.risk_assessment", "structured_report.investigation_summary"])

    if any(term in q for term in ["correlation", "anomaly", "pattern", "contradiction", "gap"]):
        anomalies = correlation.get("anomalies") or report.get("anomalies", [])
        patterns = correlation.get("suspicious_patterns") or report.get("suspicious_patterns", [])
        gaps = intelligence.get("contradictions_and_gaps", [])
        if anomalies:
            parts.append("Anomalies: " + "; ".join(map(str, anomalies[:5])) + ".")
        if patterns:
            parts.append("Suspicious patterns: " + "; ".join(map(str, patterns[:5])) + ".")
        if gaps:
            parts.append("Contradictions or gaps: " + "; ".join(map(str, gaps[:5])) + ".")
        if not anomalies and not patterns and not gaps:
            parts.append("No structured anomalies or contradictions are recorded yet.")
        sources.extend(["structured_report.correlation_analysis", "structured_report.investigative_intelligence"])

    if not parts:
        summary_text = summary.get("summary") or report.get("summary") or intelligence.get("crime_story")
        if summary_text:
            parts.append(str(summary_text))
            sources.append("structured_report.investigation_summary")
        else:
            parts.append(
                f"Case {report.get('case_id')} concerns {report.get('victim_name')} at "
                f"{report.get('incident_location')} on {report.get('incident_date')}. "
                "No completed structured analysis is available yet."
            )
            sources.append("case_details")

    parts.append("This answer is advisory and should be checked against the source evidence.")
    return " ".join(parts), list(dict.fromkeys(sources))
