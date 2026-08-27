from __future__ import annotations

import json

import dotenv
import pandas as pd
from langchain_openai import ChatOpenAI

from backend.schemas.semantic_profile import SemanticDatasetProfile
from backend.services.dataset_profiler import build_dataset_profile


dotenv.load_dotenv()


SYSTEM_PROMPT = """
You are a semantic dataset profiler.

Your job is to interpret the likely meaning and analytical role of every
dataset column using only the supplied metadata.

You do not calculate analysis results.
You do not suggest charts or KPIs.
You do not generate Python, JavaScript, SQL, or other executable code.
You must return exactly one semantic profile for every supplied column.
Preserve every column name exactly.
Never invent columns, dataset values, business definitions, or currency codes.

Semantic-type rules:
- Use identifier for columns that likely identify entities or records.
- Use category for repeated labels that are useful for grouping.
- Use numeric_measure for numeric quantities that can be aggregated.
- Use count for numeric columns representing quantities or frequencies.
- Use currency only when the column meaning clearly represents money.
- Use percentage only when the name and values support that interpretation.
- Use date or datetime only when date_parse_ratio supports the interpretation.
- Use boolean for true/false columns.
- Use status for repeated workflow, employment, or operational states.
- Use text for descriptive free-text columns.
- Use unknown when the meaning cannot be inferred safely.

Analytical-role rules:
- Identifiers should not be treated as ordinary numeric measures.
- Categories, dates, datetimes, booleans, and statuses may be dimensions.
- Numeric measures, currency values, percentages, and counts may be measures.
- Use nunique as the default aggregation for identifiers.
- Use mean for measurements where summing would not be meaningful.
- Use sum for additive amounts and counts.
- Use integer format for counts and distinct counts.
- Use percent format only when values represent ratios from 0 to 1.
- Use currency format only when an ISO currency code is reliably known.
- Never invent an ISO currency code.
- When money is detected but its currency is unknown, use number format,
  set currency to null, and add an assumption.
- Use confidence below 0.7 when the interpretation depends mostly on the
  column name or limited sample values.
- Record uncertain interpretations in the assumptions list.

Dataset-level rules:
- Provide a short summary of what the dataset likely represents.
- Set likely_domain to null when the domain cannot be inferred reliably.
- Add warnings for important semantic uncertainties.
"""


class SemanticProfileError(ValueError):
    """Raised when the semantic profile is incomplete or invalid."""


def create_semantic_profile(
    df: pd.DataFrame,
) -> SemanticDatasetProfile:
    """
    Ask the AI to interpret deterministic dataset metadata.

    The full dataset is never sent to the model.
    """

    metadata = build_dataset_profile(df)

    llm = ChatOpenAI(
        model="gpt-4o-mini",
        temperature=0,
    )

    structured_llm = llm.with_structured_output(
        SemanticDatasetProfile,
    )

    messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT,
        },
        {
            "role": "user",
            "content": (
                "Create a semantic profile for this dataset metadata:\n"
                + json.dumps(metadata, ensure_ascii=False)
            ),
        },
    ]

    result = structured_llm.invoke(messages)

    if isinstance(result, SemanticDatasetProfile):
        profile = result
    else:
        profile = SemanticDatasetProfile.model_validate(result)

    validate_semantic_profile(
        df=df,
        profile=profile,
    )

    return profile


def validate_semantic_profile(
    df: pd.DataFrame,
    profile: SemanticDatasetProfile,
) -> None:
    """
    Ensure the AI returned every real column exactly once.

    This prevents missing, duplicated, renamed, or invented columns.
    """

    dataset_columns = [
        str(column)
        for column in df.columns
    ]

    profile_columns = [
        column.name
        for column in profile.columns
    ]

    if len(profile_columns) != len(set(profile_columns)):
        raise SemanticProfileError(
            "The semantic profile contains duplicate columns."
        )

    missing_columns = set(dataset_columns) - set(profile_columns)
    invented_columns = set(profile_columns) - set(dataset_columns)

    if missing_columns:
        missing = ", ".join(sorted(missing_columns))

        raise SemanticProfileError(
            f"The semantic profile is missing columns: {missing}"
        )

    if invented_columns:
        invented = ", ".join(sorted(invented_columns))

        raise SemanticProfileError(
            f"The semantic profile invented columns: {invented}"
        )

    if len(profile_columns) != len(dataset_columns):
        raise SemanticProfileError(
            "The semantic profile must contain exactly one entry "
            "for every dataset column."
        )