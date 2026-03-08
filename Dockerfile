# Dockerfile — Binary-based image on AGNOS base
#
# Uses ghcr.io/maccracken/agnosticos:latest as the base, giving SecureYeoman
# built-in LLM Gateway (port 8088) and Agent Runtime (port 8090).
#
# Build the binary first with:
#   npm run build:binary
#
# Then build this image:
#   docker build -t secureyeoman .

FROM ghcr.io/maccracken/agnosticos:latest

LABEL org.opencontainers.image.source="https://github.com/MacCracken/secureyeoman"
LABEL org.opencontainers.image.description="SecureYeoman — Secure, local-first AI assistant (on AGNOS)"
LABEL org.opencontainers.image.licenses="MIT"

USER root

RUN apt-get update && apt-get install -y --no-install-recommends git wget \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -r secureyeoman && useradd -r -g secureyeoman -G agnos -d /home/secureyeoman -m secureyeoman \
 && mkdir -p /home/secureyeoman/.secureyeoman/data /home/secureyeoman/.secureyeoman/workspace \
 && chown -R secureyeoman:secureyeoman /home/secureyeoman \
 && mkdir -p /usr/share/secureyeoman/community-repo \
 && chown -R secureyeoman:secureyeoman /usr/share/secureyeoman \
 && chown -R secureyeoman:agnos /run/agnos /var/lib/agnos /var/log/agnos /etc/agnos

ENV COMMUNITY_REPO_PATH=/usr/share/secureyeoman/community-repo

# Copy the pre-built binary (built via npm run build:binary)
COPY dist/secureyeoman-linux-x64 /usr/local/bin/secureyeoman
RUN chmod +x /usr/local/bin/secureyeoman

# SQL migration files
COPY dist/migrations/ /usr/local/bin/migrations/

# Combined entrypoint: starts AGNOS services then SecureYeoman
COPY docker/entrypoint-combined.sh /usr/local/bin/entrypoint-combined.sh
RUN chmod +x /usr/local/bin/entrypoint-combined.sh

# Use JSON log format (pino-pretty not bundled in standalone binary)
ENV SECUREYEOMAN_LOG_FORMAT=json

EXPOSE 18789 8088 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD secureyeoman health --json || exit 1

USER secureyeoman

ENTRYPOINT ["tini", "--", "/usr/local/bin/entrypoint-combined.sh"]
CMD ["secureyeoman", "start"]
