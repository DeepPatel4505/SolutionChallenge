from fastapi import APIRouter, Depends, HTTPException, status
from app.models.schemas import ChatRequest, ChatResponse
from app.middleware.auth_middleware import get_current_user
from app.services.supabase_client import get_supabase
from app.services.rag_service import answer_question

router = APIRouter(prefix="/api/lectures", tags=["Chat"])


@router.post("/{lecture_id}/chat", response_model=ChatResponse)
async def chat_with_lecture(
    lecture_id: str,
    data: ChatRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    RAG-based Q&A endpoint.
    Takes a question about a lecture and returns a contextual answer.
    """
    supabase = get_supabase()

    # Verify lecture exists and belongs to user
    result = (
        supabase.table("lectures")
        .select("id, status")
        .eq("id", lecture_id)
        .eq("user_id", current_user["user_id"])
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lecture not found",
        )

    lecture = result.data[0]
    if lecture["status"] != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Lecture is still being processed (status: {lecture['status']}). Please wait until processing is complete.",
        )

    if not data.question.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question cannot be empty",
        )

    try:
        answer, sources = await answer_question(lecture_id, data.question)
        return ChatResponse(answer=answer, sources=sources)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate answer: {str(e)}",
        )
