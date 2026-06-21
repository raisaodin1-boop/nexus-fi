# DEPRECATED — Legacy FastAPI backend archived in archive/backend-legacy/
# Active backend: Supabase (Postgres + Edge Functions)
# This Dockerfile is kept for historical reference only.

FROM python:3.11-slim
WORKDIR /app
COPY archive/backend-legacy/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY archive/backend-legacy/ ./backend/
ENV PYTHONPATH=/app
CMD uvicorn backend.server:app --host 0.0.0.0 --port ${PORT:-8000}
