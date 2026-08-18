import json
from typing import Any

import dotenv
import pandas as pd
from langchain_openai import ChatOpenAI

from backend.schemas.question import (
    AnalysisDecision,
    ConversationMessage,
)

dotenv.load_dotenv()

SYSTEM_PROMPT = """
You are a data-analysis planner.

Your job is to understand the user's request and produce one of two results:

1. Ask one focused clarification question when essential information is missing.
2. Return a declarative analysis plan when the request is sufficiently clear.

You do not calculate results.
You do not generate Python, JavaScript, SQL, or chart-library code.
You may only reference columns included in the dataset metadata.

Clarification rules:
- Ask only when ambiguity could materially change the analysis.
- Do not ask about details that can be reasonably inferred.
- Ask only one question at a time.
- Provide short predefined options when useful.
- Never invent column names.

Chart-selection rules:
- You may only select line, bar, area, or pie.
- Use line charts for values grouped by a real date or time period.
- Use bar charts for comparisons across discrete categories or numeric groups,
  including employee tenure in years.
- Use area charts for volume trends over time when appropriate.
- Use pie charts only for one measure across a small number of categories.
- Do not select scatter or table because they are not supported yet.

Analysis rules:
- Use aliases that are short and safe.
- Every analysis plan must contain exactly one dimension.
- The dimension is the column used to group values on the X-axis.
- When the user asks for "X vs Y", use X as the dimension and Y as the measure.
- When Y is numeric, use mean unless the user requests another aggregation.
- Do not request more than five measures.
- Keep row_limit at or below 1000.
- Mention important assumptions in the plan's intent.

Response rules:
- Your response must have a status of either "needs_clarification" or "ready".
- When status is "needs_clarification", set question to one focused question
  and set plan to null.
- When status is "ready", set question to null, set options to an empty list,
  and provide a complete plan.
"""


def build_dataset_metadata(df: pd.DataFrame) -> dict[str, Any]:
    """
    Build a small description of the dataset for the planner.

    The full dataset is not sent to the model.
    """

    columns: list[dict[str, Any]] = []

    for column_name in df.columns:
        series = df[column_name]

        sample_values = (
            series.dropna()
            .astype(str)
            .drop_duplicates()
            .head(5)
            .tolist()
        )

        columns.append(
            {
                "name": str(column_name),
                "data_type": str(series.dtype),
                "missing_values": int(series.isna().sum()),
                "unique_values": int(series.nunique(dropna=True)),
                "sample_values": sample_values,
            }
        )

    return {
        "row_count": len(df),
        "column_count": len(df.columns),
        "columns": columns,
    }


def format_conversation(
    history: list[ConversationMessage],
) -> list[dict[str, str]]:
    """
    Convert validated conversation history into model messages.
    """

    return [
        {
            "role": message.role,
            "content": message.content,
        }
        for message in history
    ]


def create_analysis_plan(
    df: pd.DataFrame,
    question: str,
    history: list[ConversationMessage] | None = None,
) -> AnalysisDecision:
    """
    Ask the model to return either a clarification decision
    or a validated analysis plan.
    """

    llm = ChatOpenAI(
        model="gpt-4o-mini",
        temperature=0,
    )

    structured_llm = llm.with_structured_output(
        AnalysisDecision
    )

    metadata = build_dataset_metadata(df)

    messages: list[dict[str, str]] = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT,
        },
        {
            "role": "system",
            "content": (
                "Dataset metadata:\n"
                + json.dumps(metadata, ensure_ascii=False)
            ),
        },
    ]

    if history:
        messages.extend(format_conversation(history))

    messages.append(
        {
            "role": "user",
            "content": question,
        }
    )

    decision = structured_llm.invoke(messages)

    if isinstance(decision, AnalysisDecision):
        return decision

    return AnalysisDecision.model_validate(decision)
