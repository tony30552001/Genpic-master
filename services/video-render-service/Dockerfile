# syntax=docker/dockerfile:1

FROM python:3.12-slim

RUN apt-get update \
    && apt-get install --no-install-recommends -y ffmpeg \
    && rm -rf /var/lib/apt/lists/*

ENV VIDEO_RENDER_WORKDIR=/var/tmp/video-render \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv/video-render-service
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY smoke.py ./

RUN python smoke.py

RUN useradd --system --create-home --uid 10001 pixora \
    && mkdir -p /var/tmp/video-render \
    && chown -R pixora:pixora /var/tmp/video-render /srv/video-render-service
USER pixora

EXPOSE 8080
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
