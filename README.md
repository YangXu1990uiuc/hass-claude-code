# Claude Code for Home Assistant

A Home Assistant add-on that runs [Claude Code](https://docs.anthropic.com/en/docs/claude-code) inside your HA instance with a web terminal, full API access, and a built-in MCP server providing structured tools for interacting with your smart home.

## Features

- **Web terminal** via Home Assistant Ingress (no port forwarding needed)
- **Full HA API access** — search entities, call services, query devices/areas
- **Built-in documentation search** — HA developer and user docs indexed and searchable
- **Session persistence** — tmux keeps your Claude session alive across browser tab closes
- **MCP server** with 11 tools for Home Assistant interaction
- **Optional semantic search** — enable embeddings for AI-powered doc search

## Installation

### 1. Add the repository

[![Open your Home Assistant instance and show the add add-on repository dialog.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FYangXu1990uiuc%2Fhass-claude-code)

Or manually:

1. Go to **Settings** > **Add-ons** > **Add-on Store**
2. Click the **three-dot menu** (top right) > **Repositories**
3. Add: `https://github.com/YangXu1990uiuc/hass-claude-code`
4. Click **Save**, then refresh

### 2. Install the add-on

1. Find **Claude Code** in the add-on store
2. Click **Install**. This downloads a prebuilt image for your architecture.
3. Optional: on the **Configuration** tab, set an **Anthropic API key**. Leave it empty to sign in with your Claude subscription (`/login` in the terminal) instead.
4. Click **Start**. On first start, the add-on downloads Claude Code from Anthropic, which takes a minute.
5. Open the **Claude Code** panel in the sidebar

### How it works

- **The image** is built by GitHub Actions (`.github/workflows/addon-image.yml`) for amd64 and aarch64 and published to GHCR. It contains the MCP server, the pre-indexed documentation, ttyd, tmux and the startup scripts. It does **not** contain Claude Code.
- **Claude Code** is installed on first start by the official installer into the add-on's persistent storage, and then updates itself in the background. The `claude_version` option selects the release channel or pins a version.
- **Your data** lives in `/data/home`, which is the home directory (`/root` points to it). Claude Code sessions, memory, login, MCP servers you add, git/gh/ssh config and shell history all survive restarts and add-on updates.

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `api_key` | password | *(empty)* | Anthropic API key. Leave empty to use `/login` with a Claude subscription. |
| `model` | list | `default` | `default`, `sonnet`, `opus` or `haiku` |
| `claude_version` | string | `stable` | `stable`, `latest`, or an exact version such as `2.1.326` to pin it |
| `yolo_mode` | bool | `false` | Skip permission prompts (use with caution) |
| `enable_embeddings` | bool | `false` | Download AI model for semantic doc search (~87MB) |
| `additional_packages` | list | `[]` | Extra Alpine packages to install (e.g. `python3`, `vim`) |

### Claude Code updates

- `stable` is typically about a week behind `latest` and skips releases with major regressions.
- On `stable` or `latest`, Claude Code updates itself in the background. An update takes effect the next time Claude Code starts.
- To roll back, set `claude_version` to an earlier version number and restart the add-on. A pinned version never updates itself.
- The downloaded binaries are excluded from add-on backups. After a restore, the add-on downloads Claude Code again on start.

### Upgrading from 0.1.x

On first start, 0.2.0 moves `/data/.claude`, `/data/.claude.json` and `/data/.bash_history` into `/data/home`. Sessions, memory and your login are kept. Home Assistant offers to back up the add-on before updating; keep that checked so you can roll back.

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `api_key` | password | *required* | Your Anthropic API key |
| `model` | string | *(empty)* | Claude model to use (leave empty for default) |
| `yolo_mode` | bool | `false` | Skip permission prompts (use with caution) |
| `enable_embeddings` | bool | `false` | Download AI model for semantic doc search (~87MB) |
| `additional_packages` | list | `[]` | Extra Alpine packages to install (e.g. `python3`, `vim`) |

## MCP Tools

The built-in MCP server (`home-assistant`) provides these tools to Claude:

| Tool | Description |
|------|-------------|
| `search_entities` | Search entities by name, domain, or area |
| `get_entity_state` | Get state and attributes of a specific entity |
| `call_service` | Call any HA service (turn on lights, run automations, etc.) |
| `search_automations` | Search automation entities |
| `get_ha_config` | Get Home Assistant core configuration |
| `list_areas` | List all defined areas |
| `search_devices` | Search the device registry |
| `get_config_entries` | List integration config entries |
| `search_docs` | Search HA developer and user documentation |
| `read_doc` | Read a specific documentation file |
| `get_doc_stats` | Get documentation index statistics |

## File Access

The add-on has access to:

| Path | Description | Access |
|------|-------------|--------|
| `/homeassistant/` | HA configuration directory (including `.storage/`) | Read/Write |
| `/config/` | Add-on configuration | Read/Write |
| `/share/` | Shared storage between add-ons | Read/Write |
| `/ssl/` | SSL certificates | Read-only |
| `/media/` | Media files | Read-only |

## Architecture

```
addon/
  config.yaml              # HA add-on manifest
  Dockerfile               # Multi-stage build
  build.yaml               # Base images per architecture
  rootfs/                  # Container filesystem overlay
    etc/s6-overlay/        # s6 service definitions
    usr/bin/               # Claude entrypoint script
  mcp-server/              # Node.js MCP server
    src/
      index.ts             # MCP entry point (stdio transport)
      ha-api.ts            # HA REST API tools
      ha-websocket.ts      # HA WebSocket API tools
      docs-search.ts       # Documentation search tools
      db.ts, search.ts, embeddings.ts, indexer.ts  # Search engine
```

The MCP server runs as a stdio child process of Claude Code. It is registered as a user-scope server in `~/.claude.json`, so `claude mcp add` still works for your own servers. It reaches Home Assistant through the Supervisor proxy: REST at `http://supervisor/core/api` and WebSocket at `ws://supervisor/core/websocket`. No separate network port is needed.

## Development

Build the image locally. The docs are copied into the build context, as CI does:

```bash
rm -rf addon/docs && cp -r docs addon/docs
docker build -t claude-code-addon addon/
```

The add-on's services need the Supervisor API, but the home setup, Claude Code install and MCP registration live in a plain bash script you can run on its own against a scratch data directory:

```bash
mkdir -p /tmp/addon-data
docker run --rm -v /tmp/addon-data:/data --entrypoint claude-addon claude-code-addon setup stable false
docker run --rm -it -v /tmp/addon-data:/data --entrypoint bash claude-code-addon -l   # then run: claude
```

## Publishing

1. Bump `version` in `addon/config.yaml` and add a `CHANGELOG.md` entry.
2. Push to `main`. The **Add-on image** workflow builds both architectures and pushes `ghcr.io/<owner>/{arch}-addon-claude-code:<version>`.
3. **First release only:** check that both packages (`amd64-addon-claude-code` and `aarch64-addon-claude-code`) are public, because the Supervisor can't pull private images. In a public repository, the packages normally inherit its visibility through the `org.opencontainers.image.source` label the workflow sets. If one shows as private under your GitHub profile's **Packages**, open **Package settings** > **Change visibility** > **Public**.
4. In Home Assistant, **Check for updates** in the add-on store and update.

Wait until the workflow has finished before you update in Home Assistant. Until then, the Supervisor can't find the image for the new version and the update fails, while the installed version keeps running.

## Supported Architectures

- `amd64` (x86_64)
- `aarch64` (ARM64, e.g. Raspberry Pi 4/5)
