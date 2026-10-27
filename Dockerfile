# syntax=docker/dockerfile:1
# Production image for https://thebelt.fun: Caddy serving an already-built dist/ on :8080 as an
# unprivileged user. The server's own Caddy terminates HTTPS in front of it and only accepts Cloudflare.
#
# The deploy workflow builds this image, pushes it to ghcr.io/trmytelabs/the-belt:<sha> and the server pulls it
# (docs/deploying.md). The same works locally after a build:
#   npm run build && docker build --build-arg GIT_SHA=$(git rev-parse HEAD) -t the-belt .
FROM caddy:2.11.7
# The image's caddy binary carries a file capability (cap_net_bind_service, for ports below 1024). Under
# --cap-drop ALL the kernel refuses to exec it ("operation not permitted"). This server listens on 8080 and needs
# no capability, so re-copy the binary: cp does not carry the capability over.
RUN cp /usr/bin/caddy /tmp/caddy && mv /tmp/caddy /usr/bin/caddy
COPY deploy/container.Caddyfile /etc/caddy/Caddyfile
COPY dist /srv
# /version.txt lets the pipeline confirm which commit is live
ARG GIT_SHA=dev
RUN printf '%s\n' "$GIT_SHA" > /srv/version.txt
# Caddy keeps its state under XDG dirs; point them at /tmp so the root filesystem can stay read-only
ENV XDG_DATA_HOME=/tmp/caddy-data XDG_CONFIG_HOME=/tmp/caddy-config
USER 65534:65534
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=6 CMD wget -qO /dev/null http://127.0.0.1:8080/health || exit 1
