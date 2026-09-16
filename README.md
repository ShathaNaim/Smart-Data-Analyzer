# Smart Data Analyzer

A full-stack data analysis web application for uploading datasets, exploring data, creating charts, and building dashboards. The application combines AI-assisted analysis with manual chart creation, data cleaning tools, and shareable dashboards to help users turn CSV and Excel files into useful insights.

## Features

- CSV and Excel (.xlsx) uploads with dataset previews and column summaries
- Dataset profiling with missing-value information and data-quality warnings
- Natural-language questions with AI-assisted analysis and clarification when needed
- Suggested charts, key performance indicators (KPIs), and written insights
- Manual chart creation with aggregation, sorting, date grouping, and previews
- Bar, horizontal bar, line, area, pie, doughnut, scatter, and histogram charts
- Data filtering and cleaning, including column renaming and duplicate removal
- Dashboard creation with charts and KPI cards
- Dashboard editing with chart types, colors, titles, labels, sizing, and ordering
- Shareable read-only dashboards with revocable sharing links
- Account registration and sign-in with private datasets and dashboards

## What It Demonstrates

- Connecting a Next.js frontend to a FastAPI backend
- Processing and summarizing tabular data with pandas
- Turning natural-language requests into validated analysis plans
- Separating AI-generated plans from backend data calculations
- Building reusable chart components and interactive dashboard tools
- Managing authenticated access and ownership of datasets and dashboards
- Storing uploaded files in object storage and application records in a database
- Applying database migrations, request rate limits, and AI response caching

## Tech Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Charts: Recharts
- Backend: FastAPI, Python, Pydantic
- Data Processing: pandas, NumPy, openpyxl
- AI: OpenAI models through LangChain
- Authentication: Server-side sessions with HTTP-only cookies
- Database: PostgreSQL with SQLAlchemy and Alembic migrations
- File Storage: Cloudflare R2 through the S3-compatible boto3 client

## Project Structure

```text
backend/app/        FastAPI application and API routes
backend/services/   Data processing, AI analysis, and application services
backend/schemas/    Request and response validation
backend/models/     Database models
backend/tests/      Backend tests
forntend/           Next.js frontend application
migrations/         Alembic database migrations
```
