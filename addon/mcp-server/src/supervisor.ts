import { readFileSync } from 'node:fs';

// Overridable for local testing against a mock Home Assistant.
export const HA_API_URL = process.env.HA_API_URL || 'http://supervisor/core/api';
export const HA_WS_URL = process.env.HA_WS_URL || 'ws://supervisor/core/websocket';

// s6-overlay keeps a copy of the container environment here.
const S6_TOKEN_FILE = '/run/s6/container_environment/SUPERVISOR_TOKEN';

let cachedToken: string | undefined;

/**
 * The Supervisor API token.
 *
 * The add-on registers this MCP server in ~/.claude.json without the token,
 * because that file lives in /data and ends up in backups. Claude Code passes
 * its own environment (which has the token) to MCP servers; when it doesn't,
 * fall back to the copy s6 keeps of the container environment.
 */
export function supervisorToken(): string {
  if (cachedToken) return cachedToken;

  let token = process.env.SUPERVISOR_TOKEN;
  if (!token) {
    try {
      token = readFileSync(S6_TOKEN_FILE, 'utf8').trim();
    } catch {
      // Not running under s6 (e.g. local development).
    }
  }
  if (!token) {
    throw new Error('SUPERVISOR_TOKEN is not available. This MCP server must run inside the add-on.');
  }

  cachedToken = token;
  return token;
}
