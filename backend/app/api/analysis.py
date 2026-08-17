import os
import uuid

import pandas as pd
from fastapi import APIRouter, HTTPException

from backend.schemas.question import (
    ClarificationResponse,
    CompletedAnalysisResponse,
    QuestionRequest,
)
from backend.services.analysis_executor import (
    AnalysisExecutionError,
    execute_analysis_plan,
)
from backend.services.analysis_planner import create_analysis_plan


router = APIRouter()

UPLOAD_FOLDER = "backend/uploads"


@router.post(
    "/dataset/{file_id}/ask",
    response_model=ClarificationResponse | CompletedAnalysisResponse,
)
def ask_dataset(
    file_id: str,
    request: QuestionRequest,
):
    files = os.listdir(UPLOAD_FOLDER)

    matched_file = next(
        (
            filename
            for filename in files
            if filename.startswith(file_id)
        ),
        None,
    )

    if not matched_file:
        raise HTTPException(
            status_code=404,
            detail="File not found",
        )

    file_path = os.path.join(
        UPLOAD_FOLDER,
        matched_file,
    )

    if matched_file.endswith(".csv"):
        df = pd.read_csv(file_path)
    else:
        df = pd.read_excel(file_path)

    conversation_id = (
        request.conversation_id
        or str(uuid.uuid4())
    )

    # 1. Ask the AI whether it needs clarification or has a plan.
    decision = create_analysis_plan(
        df=df,
        question=request.question,
        history=request.history,
    )

    # 2. Return the AI's clarification question without running pandas.
    if decision.status == "needs_clarification":
        return ClarificationResponse(
            conversation_id=conversation_id,
            message=decision.question,
            options=decision.options,
            allow_free_text=True,
        )

    # 3. The request is clear, so execute the validated plan.
    try:
        chart = execute_analysis_plan(
            df=df,
            plan=decision.plan,
        )
    except AnalysisExecutionError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error

    # 4. Return the calculated chart specification to Next.js.
    return CompletedAnalysisResponse(
        conversation_id=conversation_id,
        answer=decision.plan.intent,
        charts=[chart],
        assumptions=[],
        warnings=[],
    )