# syntax=docker/dockerfile:1.6

FROM python:3.12-slim-bookworm AS ai-service
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
    && apt-get upgrade -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY ai_server/Bird-Detection-main/requirements.txt ./ai_server/Bird-Detection-main/requirements.txt

WORKDIR /app/ai_server/Bird-Detection-main

RUN pip install --no-cache-dir --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r requirements.txt

COPY ai_server/Bird-Detection-main/ .

RUN mkdir -p /app/uploads

ENV LOCAL_IMAGE_ROOT=/app/uploads \
    PYTHONPATH=/app/ai_server/Bird-Detection-main

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "7"]


FROM node:22-alpine AS server
WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

# Expose the Nest port (compose maps 8080:8080)
EXPOSE 8080

# `pnpm run start:dev` for testing
CMD ["pnpm", "run", "start:dev"]

# for production
# CMD ["pnpm", "run", "start:prod"]
