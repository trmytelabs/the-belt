# syntax=docker/dockerfile:1
# Production image for https://thebelt.patchnotes.ca, built and shipped by .github/workflows/deploy.yml.
# Stage 1 builds the game for the root of a domain; stage 2 serves dist/ with Caddy as an unprivileged user on :8080.
# The server's own Caddy terminates HTTPS in front of it and only accepts Cloudflare (docs/deploying.md).

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# No dependency runs an install script; --ignore-scripts keeps it that way (and skips Playwright's browser download).
RUN npm ci --ignore-scripts
COPY . .
# tsc, then vite build for the root (/): the site lives at its own domain, not in a folder.
RUN npm run build
# /version.txt lets the pipeline confirm which commit is live
ARG GIT_SHA=dev
RUN printf '%s\n' "$GIT_SHA" > dist/version.txt

FROM caddy:2.11.7
# The image's caddy binary carries a file capability (cap_net_bind_service, for ports below 1024). Under
# --cap-drop ALL the kernel refuses to exec it ("operation not permitted"). This server listens on 8080 and needs
# no capability, so re-copy the binary: cp does not carry the capability over.
RUN cp /usr/bin/caddy /tmp/caddy && mv /tmp/caddy /usr/bin/caddy
COPY deploy/container.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
# Caddy keeps its state under XDG dirs; point them at /tmp so the root filesystem can stay read-only
ENV XDG_DATA_HOME=/tmp/caddy-data XDG_CONFIG_HOME=/tmp/caddy-config
USER 65534:65534
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=6 CMD wget -qO /dev/null http://127.0.0.1:8080/health || exit 1
