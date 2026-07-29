FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./

RUN npm run build

FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN pip install uv

COPY pyproject.toml uv.lock ./

RUN uv pip install --system -r pyproject.toml

ARG SPACY_MODEL=en_core_web_sm
ENV SPACY_MODEL=$SPACY_MODEL
RUN python -m spacy download $SPACY_MODEL


ARG LLM_BASE_URL
ENV LLM_BASE_URL=$LLM_BASE_URL

ARG LLM_MODEL_NAME
ENV LLM_MODEL_NAME=$LLM_MODEL_NAME

ARG RATE_LIMIT_RPM
ENV RATE_LIMIT_RPM=$RATE_LIMIT_RPM

ARG RATE_LIMIT_TPM
ENV RATE_LIMIT_TPM=$RATE_LIMIT_TPM

COPY app/ app/
COPY src/ src/
COPY input_data/ input_data/

COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
