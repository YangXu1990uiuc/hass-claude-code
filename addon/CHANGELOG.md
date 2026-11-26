## 0.2.0

Reworks how the add-on stores state and installs Claude Code. Existing data is
migrated automatically on first start: `/data/.claude`, `/data/.claude.json` and
`/data/.bash_history` move into `/data/home`. Sessions, memory and your login are
kept. If you roll back to 0.1.x after that, the old version won't find them.

### Persistence

- The whole home directory is now persistent: `/root` is a symlink to `/data/home`.
  Everything written under `~` survives restarts and updates, including Claude Code
  state, git/gh/ssh config and shell history. This replaces the per-file symlink
  list that lost anything not on it.

### Claude Code install and updates

- Claude Code is no longer built into the image. It is installed on first start
  into `/data/home` by the official installer, and then updates itself in the
  background.
- New option `claude_version`: `stable` (default, about a week behind, skips
  releases with major regressions), `latest`, or an exact version to pin or roll
  back. A pinned version disables background updates.
- If the Claude Code binary is missing (for example after restoring a backup), it
  is reinstalled on start.
- Downloaded binaries (`home/.local/share/claude/versions`) and `home/.cache` are
  excluded from add-on backups.

### Claude Code configuration

- The MCP server is registered at user scope in `~/.claude.json` instead of
  `/etc/claude-code/managed-mcp.json`. The managed file took exclusive control,
  which blocked `claude mcp add`, plugin MCP servers and claude.ai connectors. The
  Supervisor token is no longer written into any config file.
- Fix yolo mode: start Claude Code with `--dangerously-skip-permissions` and
  `IS_SANDBOX=1`. Root is otherwise refused that flag. The previous managed-settings
  approach used an invalid `"permissions.defaultMode"` key and a hard-coded tool
  list that went stale.
- `claude` is on `PATH` in login shells too (new tmux windows, `bash -l`).
- If installing Claude Code fails (for example with no network), the terminal
  retries the install and falls back to a shell instead of exiting.

### MCP server fixes

- `list_areas`, `search_devices` and `get_config_entries` now work. They posted
  WebSocket commands to the REST API, which always failed, and the error was
  swallowed into an empty list. They now use the Home Assistant WebSocket API
  (`ws://supervisor/core/websocket`) over a single reused connection.
- The `search_entities` area filter and `area` field now work. Areas come from the
  entity and device registries; entity state attributes have no area.
- Tool errors are returned to Claude instead of being hidden as empty results.
- The MCP server exits when Claude Code closes it.

### Build and distribution

- Images are built by GitHub Actions for amd64 and aarch64 and pulled from GHCR.
  The Supervisor no longer builds them on your device. The image does not contain
  Claude Code.
- The pnpm lockfile is committed, and the build installs with `--frozen-lockfile`.
- Documentation is taken from this repository instead of cloned from upstream at
  build time.

## 0.1.13

### Bug fixes

- Persist Claude Code state (login credentials, session history, memory) across
  add-on restarts and host reboots: the installer pre-creates `/root/.claude`, so the
  `ln -sf` symlink into `/data` was landing inside it instead of replacing it

## 0.1.12

### Bug fixes

- Fix Docker build failure with pnpm 11 (`ERR_PNPM_IGNORED_BUILDS`, #4): move the
  dependency build-script allowlist from the no-longer-read `pnpm` field in
  package.json to `allowBuilds` in `pnpm-workspace.yaml`
- Pin pnpm to major version 11 so future pnpm releases can't silently break the build
- Stop hiding pnpm install errors behind `2>/dev/null`; pick frozen vs regular
  install based on whether a lockfile is present

## 0.1.11

### Improvements

- Trim MCP tool responses to return only essential fields instead of full objects
  - `search_entities`: returns entity_id, state, name, area (use `get_entity_state` for full attributes)
  - `search_automations`: returns entity_id, state, name, last_triggered
  - `search_devices`: returns id, name, area_id, manufacturer, model
  - `list_areas`: returns area_id, name, floor_id
  - `get_config_entries`: returns entry_id, domain, title, state
  - `call_service`: returns success message instead of full response objects
  - `get_ha_config`: returns only useful config fields instead of entire object
- Add all MCP tools to yolo mode allow list

## 0.1.10

### Bug fixes

- Revert non-root user approach (would break HA file permissions)
- Yolo mode now uses managed-settings.json to allow all tools instead of `--dangerously-skip-permissions` (which is blocked as root)
- No chown/chmod on HA-mounted directories — permissions are untouched

## 0.1.9

### Bug fixes

- Fix yolo mode: run Claude Code as non-root `claude` user (required for `--dangerously-skip-permissions`)
- Grant claude user write access to HA config, share, and addon config directories
- Persistent data (`.claude/`, `.claude.json`, history) now owned by claude user

## 0.1.8

### Improvements

- Make API key optional — leave blank and use `/login` in Claude Code to authenticate via subscription (Pro/Max)

## 0.1.7

### Bug fixes

- Fix better-sqlite3 native module crash: use Alpine 3.23 with Node 24 in builder to match runtime environment
- Fix yolo mode not working: write config to env vars in `/etc/profile.d/` instead of relying on bashio in tmux context
- Simplify entrypoint to use env vars (`CLAUDE_MODEL`, `CLAUDE_YOLO`) instead of bashio calls

## 0.1.6

### Bug fixes

- Compile MCP server TypeScript to JavaScript at build time instead of running via tsx at runtime
- Fix corrupt `.claude.json` on first start (initialize with `{}` instead of empty file)
- Remove npm from final image (no longer needed with binary installer)
- Prune dev dependencies from final image for smaller size

## 0.1.5

### Bug fixes

- Persist `~/.claude.json` across restarts (symlinked to `/data/.claude.json`)

## 0.1.4

### Bug fixes

- Fix MCP server not loading: use `/etc/claude-code/managed-mcp.json` (system-wide) instead of `.mcp.json` in home dir which Claude Code doesn't find when working dir differs
- Switch to official Claude Code binary installer (`curl -fsSL https://claude.ai/install.sh | bash`) instead of npm

## 0.1.3

### Improvements

- Model config is now a dropdown: default, sonnet, opus, haiku
- Uses Claude Code short aliases that auto-resolve to latest model versions

## 0.1.2

### Bug fixes

- Fix 502 Bad Gateway on Ingress: bind ttyd to 0.0.0.0 instead of `hassio` interface (which only exists with `host_network: true`)

## 0.1.1

### Bug fixes

- Fix Docker build failures with native module loading
- Make sqlite-vec loading conditional on ENABLE_EMBEDDINGS to avoid .so errors at build time
- Use lazy dynamic import for @huggingface/transformers to prevent onnxruntime-node load at import time
- Allow pnpm to build better-sqlite3 native bindings via onlyBuiltDependencies config

## 0.1.0

### Initial release

- Web terminal via Home Assistant Ingress (ttyd + tmux)
- Built-in MCP server with 11 tools:
  - `search_entities`, `get_entity_state`, `call_service`
  - `search_automations`, `get_ha_config`
  - `list_areas`, `search_devices`, `get_config_entries`
  - `search_docs`, `read_doc`, `get_doc_stats`
- Pre-indexed HA developer and user documentation (FTS5 keyword search)
- Optional semantic search with embeddings (~87MB model, opt-in)
- Session persistence across browser tab closes
- Configurable model, yolo mode, and additional Alpine packages
- Full access to HA config, shared storage, SSL, and media directories
