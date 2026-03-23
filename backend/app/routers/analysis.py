from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import Optional
from app.middleware.auth_middleware import get_current_user
from app.services.supabase_client import get_supabase
from app.services.analysis_service import (
    generate_summary,
    generate_notes,
    extract_keywords,
    generate_questions,
    segment_topics,
    detect_highlights,
    translate_content,
)

router = APIRouter(prefix="/api/analysis", tags=["Analysis"])


class AnalysisRequest(BaseModel):
    lecture_id: str
    format_type: str = "detailed"


class TranslateRequest(BaseModel):
    lecture_id: str
    content: str
    target_language: str


class AnalysisResponse(BaseModel):
    content: str
    analysis_type: str
    cached: bool = False


async def _get_transcript(lecture_id: str, user_id: str) -> str:
    """Get transcript for a lecture, verify ownership."""
    supabase = get_supabase()
    result = (
        supabase.table("lectures")
        .select("transcript_text, user_id, status")
        .eq("id", lecture_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lecture not found")

    lecture = result.data[0]
    if lecture["user_id"] != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    if not lecture.get("transcript_text"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transcript not yet available.",
        )

    return lecture["transcript_text"]


def _get_cached(lecture_id: str, analysis_type: str) -> Optional[str]:
    """Check if analysis is already cached in the database."""
    supabase = get_supabase()
    result = (
        supabase.table("lecture_analysis")
        .select("content")
        .eq("lecture_id", lecture_id)
        .eq("analysis_type", analysis_type)
        .execute()
    )
    if result.data:
        return result.data[0]["content"]
    return None


def _save_cache(lecture_id: str, analysis_type: str, content: str):
    """Save analysis result to database cache."""
    supabase = get_supabase()
    try:
        supabase.table("lecture_analysis").upsert({
            "lecture_id": lecture_id,
            "analysis_type": analysis_type,
            "content": content,
        }, on_conflict="lecture_id,analysis_type").execute()
    except Exception:
        pass  # Non-critical, silently fail


@router.post("/summary", response_model=AnalysisResponse)
async def get_summary(req: AnalysisRequest, current_user: dict = Depends(get_current_user)):
    """Generate summary in specified format (cached)."""
    cache_key = f"summary_{req.format_type}"
    cached = _get_cached(req.lecture_id, cache_key)
    if cached:
        return AnalysisResponse(content=cached, analysis_type=cache_key, cached=True)

    transcript = await _get_transcript(req.lecture_id, current_user["user_id"])
    content = await generate_summary(transcript, req.format_type)
    _save_cache(req.lecture_id, cache_key, content)
    return AnalysisResponse(content=content, analysis_type=cache_key)


@router.post("/notes", response_model=AnalysisResponse)
async def get_notes(req: AnalysisRequest, current_user: dict = Depends(get_current_user)):
    """Generate structured auto-notes (cached)."""
    cached = _get_cached(req.lecture_id, "notes")
    if cached:
        return AnalysisResponse(content=cached, analysis_type="notes", cached=True)

    transcript = await _get_transcript(req.lecture_id, current_user["user_id"])
    content = await generate_notes(transcript)
    _save_cache(req.lecture_id, "notes", content)
    return AnalysisResponse(content=content, analysis_type="notes")


@router.post("/keywords", response_model=AnalysisResponse)
async def get_keywords(req: AnalysisRequest, current_user: dict = Depends(get_current_user)):
    """Extract keywords, technical terms, glossary (cached)."""
    cached = _get_cached(req.lecture_id, "keywords")
    if cached:
        return AnalysisResponse(content=cached, analysis_type="keywords", cached=True)

    transcript = await _get_transcript(req.lecture_id, current_user["user_id"])
    content = await extract_keywords(transcript)
    _save_cache(req.lecture_id, "keywords", content)
    return AnalysisResponse(content=content, analysis_type="keywords")


@router.post("/questions", response_model=AnalysisResponse)
async def get_questions(req: AnalysisRequest, current_user: dict = Depends(get_current_user)):
    """Generate questions (cached per type)."""
    cache_key = f"questions_{req.format_type}"
    cached = _get_cached(req.lecture_id, cache_key)
    if cached:
        return AnalysisResponse(content=cached, analysis_type=cache_key, cached=True)

    transcript = await _get_transcript(req.lecture_id, current_user["user_id"])
    content = await generate_questions(transcript, req.format_type)
    _save_cache(req.lecture_id, cache_key, content)
    return AnalysisResponse(content=content, analysis_type=cache_key)


@router.post("/topics", response_model=AnalysisResponse)
async def get_topics(req: AnalysisRequest, current_user: dict = Depends(get_current_user)):
    """Segment lecture into topics/chapters (cached)."""
    cached = _get_cached(req.lecture_id, "topics")
    if cached:
        return AnalysisResponse(content=cached, analysis_type="topics", cached=True)

    transcript = await _get_transcript(req.lecture_id, current_user["user_id"])
    content = await segment_topics(transcript)
    _save_cache(req.lecture_id, "topics", content)
    return AnalysisResponse(content=content, analysis_type="topics")


@router.post("/highlights", response_model=AnalysisResponse)
async def get_highlights(req: AnalysisRequest, current_user: dict = Depends(get_current_user)):
    """Detect important highlights (cached)."""
    cached = _get_cached(req.lecture_id, "highlights")
    if cached:
        return AnalysisResponse(content=cached, analysis_type="highlights", cached=True)

    transcript = await _get_transcript(req.lecture_id, current_user["user_id"])
    content = await detect_highlights(transcript)
    _save_cache(req.lecture_id, "highlights", content)
    return AnalysisResponse(content=content, analysis_type="highlights")


@router.post("/translate", response_model=AnalysisResponse)
async def translate(req: TranslateRequest, current_user: dict = Depends(get_current_user)):
    """Translate analysis content to another language (cached in DB)."""
    # Verify lecture ownership
    supabase = get_supabase()
    result = (
        supabase.table("lectures")
        .select("user_id")
        .eq("id", req.lecture_id)
        .execute()
    )
    if not result.data or result.data[0]["user_id"] != current_user["user_id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    # Build a stable cache key from content hash + language
    import hashlib
    content_hash = hashlib.md5(req.content.encode()).hexdigest()[:12]
    cache_key = f"translate_{req.target_language}_{content_hash}"

    # Check DB cache
    cached = _get_cached(req.lecture_id, cache_key)
    if cached:
        return AnalysisResponse(content=cached, analysis_type=cache_key, cached=True)

    # Generate translation
    content = await translate_content(req.content, req.target_language)

    # Save to DB
    _save_cache(req.lecture_id, cache_key, content)

    return AnalysisResponse(content=content, analysis_type=cache_key)


