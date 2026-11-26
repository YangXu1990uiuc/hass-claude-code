#!/usr/bin/env bash
# ==============================================================================
# Claude Code Add-on: Claude entrypoint
# Launches Claude Code with flags based on add-on configuration.
# This runs inside tmux, spawned by ttyd.
# ==============================================================================
set -e

# Source environment (written by init-claude)
if [[ -f /etc/profile.d/claude.sh ]]; then
    # shellcheck source=/dev/null
    source /etc/profile.d/claude.sh
fi

# Claude Code is installed at startup; if that failed (e.g. no network), retry
# here and fall back to a shell rather than leaving a dead terminal.
if ! command -v claude >/dev/null 2>&1; then
    echo "Claude Code is not installed yet — installing now..."
    if ! claude-addon install "${CLAUDE_VERSION_SPEC:-stable}"; then
        echo ""
        echo "Installation failed. Starting a shell instead."
        echo "Run 'claude-addon install ${CLAUDE_VERSION_SPEC:-stable}' to retry, then 'claude'."
        exec bash -l
    fi
fi

# Build claude args
declare -a CLAUDE_ARGS=()

# Model selection
if [[ -n "${CLAUDE_MODEL:-}" && "${CLAUDE_MODEL}" != "default" ]]; then
    CLAUDE_ARGS+=(--model "${CLAUDE_MODEL}")
fi

# Yolo mode (IS_SANDBOX=1 is exported alongside it so this works as root)
if [[ "${CLAUDE_YOLO:-false}" == "true" ]]; then
    CLAUDE_ARGS+=(--dangerously-skip-permissions)
fi

echo "Starting Claude Code..."
echo "Working directory: $(pwd)"
echo ""

# Launch Claude Code
exec claude "${CLAUDE_ARGS[@]}"
