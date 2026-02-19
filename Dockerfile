# Dockerfile — Binary-based image (Phase 22)
#
# Uses a pre-compiled Bun binary (~80 MB) instead of the multi-stage
# Node.js build (~600 MB). Build the binary first with:
#   npm run build:binary
#
# Then build this image:
#   docker build -t secureyeoman .

FROM debian:bookworm-slim

LABEL org.opencontainers.image.source="https://github.com/MacCracken/secureyeoman"
LABEL org.opencontainers.image.description="SecureYeoman — Secure, local-first AI assistant"
LABEL org.opencontainers.image.licenses="MIT"

RUN groupadd -r secureyeoman && useradd -r -g secureyeoman -d /home/secureyeoman -m secureyeoman \
 && mkdir -p /home/secureyeoman/.secureyeoman/data /home/secureyeoman/.secureyeoman/workspace \
 && chown -R secureyeoman:secureyeoman /home/secureyeoman

# Copy the pre-built binary (built via npm run build:binary)
COPY dist/secureyeoman-linux-x64 /usr/local/bin/secureyeoman
RUN chmod +x /usr/local/bin/secureyeoman

# Optional: bundled community skills
COPY community-skills/ /usr/share/secureyeoman/community-skills/

# Dashboard dist is embedded inside the binary as assets (via --assets flag in build-binary.sh)
# If a separate dist is preferred, mount it at /usr/share/secureyeoman/dashboard or
# pass --dashboard-dist <path> on startup.

EXPOSE 18789

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD secureyeoman health --json || exit 1

USER secureyeoman

ENTRYPOINT ["secureyeoman"]
CMD ["start"]
