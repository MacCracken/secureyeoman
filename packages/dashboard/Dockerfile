# Stage 1: Build the dashboard SPA
# Pin: update digest with: docker manifest inspect node:22-alpine | jq -r '.manifests[0].digest'
# Last verified: 2026-03-12
ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE} AS builder

WORKDIR /app

# Copy workspace package manifests for layer caching
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/dashboard/package.json packages/dashboard/

# Install dependencies
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY packages/shared/ packages/shared/
COPY packages/dashboard/ packages/dashboard/

# Build shared first, then dashboard
RUN npm run build --workspace=@secureyeoman/shared && \
    npm run build --workspace=@secureyeoman/dashboard

# Stage 2: Serve with nginx
# Pin: update digest with: docker manifest inspect nginx:1.27-alpine | jq -r '.manifests[0].digest'
# Last verified: 2026-03-12
ARG NGINX_IMAGE=nginx:1.27-alpine
FROM ${NGINX_IMAGE}

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY packages/dashboard/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static assets
COPY --from=builder /app/packages/dashboard/dist/ /usr/share/nginx/html/

# nginx runs as uid 101 (nginx user) by default on alpine
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:80/ || exit 1
