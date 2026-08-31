# syntax=docker/dockerfile:1

FROM python:3.12-slim

# ppt-master renders text with the fonts actually installed here, so the font
# set is part of the output contract. Noto CJK keeps Chinese decks readable.
RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        curl \
        unzip \
        fontconfig \
        fonts-dejavu-core \
        fonts-liberation2 \
        fonts-noto-core \
        fonts-noto-cjk \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

# Pinned upstream release. The skill-only archive avoids the ~780MB main repo.
ARG PPT_MASTER_VERSION=v5.1.0
ARG PPT_MASTER_SHA256=b3400c08ad969bdc114e44db0ea44806ab2a1e518b74b72534b1f587c0c1501a

# The skill must stay byte-identical: attribution_guard.py AST-checks 13 gate
# files, SHA-256 checks LICENSE and regex-checks SKILL.md frontmatter, exiting
# 78 on any modification. Never patch anything under /opt/ppt-master.
RUN curl -fsSL -o /tmp/ppt-master-skill.zip \
        "https://github.com/hugohe3/ppt-master/releases/download/${PPT_MASTER_VERSION}/ppt-master-skill-${PPT_MASTER_VERSION}.zip" \
    && echo "${PPT_MASTER_SHA256}  /tmp/ppt-master-skill.zip" | sha256sum -c - \
    && unzip -q /tmp/ppt-master-skill.zip -d /tmp/ppt-master-skill \
    && mkdir -p /opt/ppt-master \
    && mv /tmp/ppt-master-skill/ppt-master/skills /opt/ppt-master/skills \
    && rm -rf /tmp/ppt-master-skill.zip /tmp/ppt-master-skill

ENV PPT_MASTER_SKILL_DIR=/opt/ppt-master/skills/ppt-master \
    PPT_MASTER_WORKDIR=/var/tmp/ppt-master \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

RUN pip install --no-cache-dir -r "${PPT_MASTER_SKILL_DIR}/requirements.txt"

WORKDIR /srv/ppt-master-service
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY smoke.py ./

# Fail the build if the vendored skill cannot pass its own integrity gate.
RUN python "${PPT_MASTER_SKILL_DIR}/scripts/attribution_guard.py"

RUN python smoke.py

RUN useradd --system --create-home --uid 10001 pixora \
    && mkdir -p /var/tmp/ppt-master \
    && chown -R pixora:pixora /var/tmp/ppt-master /srv/ppt-master-service
USER pixora

EXPOSE 8080
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
