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

## Workspace ownership

Signed-in users own their datasets and dashboards through their account. Signing in on another browser opens the same saved workspace. Guests have a separate workspace tied to a signed, HTTP-only browser cookie.

- Signing in does not automatically claim guest data. On the home page, use **Move guest workspace to my account** to explicitly move this browser's guest datasets and their dashboards together.
- Only move guest data that belongs to you, especially on a shared computer. Transfer removes those records from the guest workspace. Existing dashboard share links continue working until revoked.
- Sign-out revokes the account session. Guest browsing remains available, but account data is inaccessible without signing in again.
- Private pages verify workspace identity before restoring cached analysis. Sign-in, sign-out, and transfer clear the analysis cache and notify other open tabs. Invalid or expired sessions prompt sign-in instead of silently switching to guest data.
- Existing browser-owned records remain guest records until explicitly transferred. Records with no owner are not automatically assigned. The ownership update reuses existing columns and requires no new migration.

## Local setup

Use Python with the dependencies in `requirements.txt`, Node.js 24 (also used by the frontend tests), PostgreSQL, and an R2 bucket.

1. Create a Python virtual environment and install dependencies: `python -m venv venv`, then `venv\Scripts\python.exe -m pip install -r requirements.txt` on Windows.
2. Copy `.env.example` to `.env` and supply database, storage, and AI credentials. Set `ANONYMOUS_COOKIE_SECRET` to a stable random secret of at least 32 characters.
3. Set both `CORS_ORIGINS` and `AUTH_ALLOWED_ORIGINS` to `["http://localhost:3000"]` for local development.
4. Apply existing migrations with `venv\Scripts\alembic.exe upgrade head`.
5. Start the API with `venv\Scripts\uvicorn.exe backend.app.main:app --reload`.
6. In `forntend`, run `npm ci`. Create `.env.local` containing `NEXT_PUBLIC_API_URL=http://localhost:8000`, then run `npm run dev`.

For deployment, configure `NEXT_PUBLIC_API_URL` before building the frontend. Set `CORS_ORIGINS` and `AUTH_ALLOWED_ORIGINS` to the exact HTTPS frontend origin, and set `COOKIE_SECURE=true`. The deployment template's empty CORS list must be replaced. Cookies use `SameSite=Lax`: host the frontend and API on the same site (for example, `app.example.com` and `api.example.com`), or use a same-site proxy. Separate unrelated hosting domains will not reliably carry these cookies on frontend API requests.

## Verification

From the project root:

```powershell
venv\Scripts\python.exe -m unittest discover -s backend/tests
```

From `forntend`:

```text
npm test
npx tsc --noEmit
npm run lint
npm run build
```

The ownership tests cover account separation, session revocation and expiry, guest isolation, transfer rollback, and replaying a guest cookie after transfer. Database-backed tests use SQLite; PostgreSQL locking behavior and real browser interactions still need deployment-environment verification.

Browser acceptance flow:

1. As a guest, upload a dataset and create a dashboard.
2. Sign in as Account A. Guest records should stay separate until you choose to move them.
3. Move the guest workspace and confirm its dataset and dashboard appear in Account A.
4. Sign out and sign in as Account B. Account A's records must be absent, including when opening their URLs directly.
5. Sign in as Account A in another browser and verify its records are available.
6. Keep two tabs open while signing out or switching accounts; previous analysis should disappear from both.
7. Verify a shared dashboard remains viewable without signing in, and revoking its link removes public access.
