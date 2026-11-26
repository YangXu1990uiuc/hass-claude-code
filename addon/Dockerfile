# Build context: addon/ directory
# Images are built in CI (.github/workflows/addon-image.yml) and pulled by the
# Supervisor. CI copies the repository's docs/ into addon/docs/ first; for a
# local build do the same:
#   rm -rf addon/docs && cp -r docs addon/docs && docker build addon/

# Global ARG — must be before any FROM to be visible across stages
ARG BUILD_FROM=ghcr.io/hassio-addons/base:20.0.1

# Stage 1: Build MCP server and pre-index docs
# Use same Alpine version as the HA base image so native modules (better-sqlite3)
# compile against the same Node.js version and musl libc.
FROM alpine:3.23 AS mcp-builder

# Pin the pnpm major version — pnpm 11 removed support for the "pnpm" field in
# package.json and renamed the build-script allowlist to allowBuilds in
# pnpm-workspace.yaml. An unpinned install broke this build once already (#4).
RUN apk add --no-cache nodejs npm build-base python3 && \
    npm install -g pnpm@11

WORKDIR /build

# Install MCP server dependencies from the committed lockfile.
# pnpm-workspace.yaml carries the allowBuilds allowlist and must be present
# before install, or pnpm refuses to run dependency build scripts.
COPY mcp-server/package.json mcp-server/pnpm-workspace.yaml mcp-server/pnpm-lock.yaml ./mcp-server/
RUN cd mcp-server && pnpm install --frozen-lockfile

# Copy MCP server source
COPY mcp-server/ ./mcp-server/

# Docs from this repository (copied into the build context, see top of file)
COPY docs/ /build/docs/

# Build keyword-only index (needs tsx for TypeScript source)
RUN cd mcp-server && \
    DOCS_DB_PATH=/build/mcp-server/data/docs-search.db \
    DOCS_PATH=/build/docs \
    ENABLE_EMBEDDINGS=false \
    node --import tsx src/build-index.ts

# Compile TypeScript to JavaScript
RUN cd mcp-server && pnpm run build

# Prune dev dependencies (tsx, typescript, @types/*) from final output
RUN cd mcp-server && pnpm prune --prod

# Stage 2: Final add-on image
# hadolint ignore=DL3006
FROM ${BUILD_FROM}

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ENV TERM="xterm-256color"

# Install system packages
# (zstd lets the Claude Code installer fetch the smaller compressed binary)
# hadolint ignore=DL3018
RUN apk add --no-cache \
    bash \
    ca-certificates \
    curl \
    git \
    jq \
    libgcc \
    libstdc++ \
    nodejs \
    ripgrep \
    tmux \
    ttyd \
    zstd

# Claude Code is deliberately NOT part of the image. It is installed on first
# start into the persistent home by the official installer, then keeps itself
# up to date (see /usr/bin/claude-addon). The image never contains or
# redistributes the Claude Code binary.
#
# /root is a symlink to the persistent home in /data, so everything written
# under ~ (Claude Code state, git/gh/ssh config, shell history) survives
# restarts and add-on updates without a per-file symlink list.
RUN rm -rf /root && ln -s /data/home /root
ENV PATH="/root/.local/bin:${PATH}"

# Copy MCP server from builder (compiled JS + prod deps + pre-built DB)
COPY --from=mcp-builder /build/mcp-server/dist /opt/mcp-server/dist
COPY --from=mcp-builder /build/mcp-server/node_modules /opt/mcp-server/node_modules
COPY --from=mcp-builder /build/mcp-server/data /opt/mcp-server/data
COPY --from=mcp-builder /build/mcp-server/package.json /opt/mcp-server/package.json

# Copy docs
COPY --from=mcp-builder /build/docs /opt/docs

# Copy rootfs overlay
COPY rootfs /

# Ensure scripts are executable
RUN chmod a+x /usr/bin/claude-entrypoint.sh /usr/bin/claude-addon \
    && find /etc/s6-overlay/s6-rc.d -name 'run' -exec chmod a+x {} \; \
    && find /etc/s6-overlay/s6-rc.d -name 'finish' -exec chmod a+x {} \;

# Build arguments for labels
ARG BUILD_ARCH
ARG BUILD_DATE
ARG BUILD_DESCRIPTION
ARG BUILD_NAME
ARG BUILD_REF
ARG BUILD_REPOSITORY
ARG BUILD_VERSION

# Labels
LABEL \
    io.hass.name="${BUILD_NAME}" \
    io.hass.description="${BUILD_DESCRIPTION}" \
    io.hass.arch="${BUILD_ARCH}" \
    io.hass.type="addon" \
    io.hass.version=${BUILD_VERSION}
