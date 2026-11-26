import type { HAArea, HADevice, HAConfigEntry, HAEntityRegistryEntry } from './types.js';
import { HA_WS_URL, supervisorToken } from './supervisor.js';

// Registries (areas, devices, config entries) are only reachable through the
// WebSocket API — the REST API has no endpoint for them. The Supervisor proxies
// the Core WebSocket API at ws://supervisor/core/websocket and accepts the
// SUPERVISOR_TOKEN as the access token.

const CONNECT_TIMEOUT_MS = 10_000;
const COMMAND_TIMEOUT_MS = 30_000;
const REGISTRY_CACHE_MS = 30_000;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface HAMessage {
  id?: number;
  type: string;
  success?: boolean;
  result?: unknown;
  error?: { code?: string; message?: string };
  message?: string;
}

class HAWebSocket {
  private ws: WebSocket | undefined;
  private ready: Promise<void> | undefined;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  async command<T>(type: string, extra: Record<string, unknown> = {}): Promise<T> {
    await this.connect();
    const ws = this.ws;
    if (!ws) throw new Error('Home Assistant WebSocket connection was lost');

    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Home Assistant WebSocket command ${type} timed out`));
      }, COMMAND_TIMEOUT_MS);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      ws.send(JSON.stringify({ id, type, ...extra }));
    });
  }

  private connect(): Promise<void> {
    if (this.ready) return this.ready;

    this.ready = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(HA_WS_URL);
      this.ws = ws;

      const fail = (error: Error) => {
        clearTimeout(timer);
        reject(error);
        this.reset(ws, error);
        ws.close();
      };
      const timer = setTimeout(
        () => fail(new Error(`Timed out connecting to Home Assistant at ${HA_WS_URL}`)),
        CONNECT_TIMEOUT_MS,
      );

      ws.addEventListener('message', (event) => {
        let msg: HAMessage;
        try {
          msg = JSON.parse(String(event.data)) as HAMessage;
        } catch {
          return;
        }

        switch (msg.type) {
          case 'auth_required':
            try {
              ws.send(JSON.stringify({ type: 'auth', access_token: supervisorToken() }));
            } catch (error) {
              fail(error as Error);
            }
            break;
          case 'auth_ok':
            clearTimeout(timer);
            resolve();
            break;
          case 'auth_invalid':
            fail(new Error(`Home Assistant rejected the Supervisor token: ${msg.message ?? 'auth_invalid'}`));
            break;
          case 'result':
            this.settle(msg);
            break;
        }
      });
      ws.addEventListener('error', () => {
        fail(new Error(`Cannot connect to Home Assistant at ${HA_WS_URL}`));
      });
      ws.addEventListener('close', () => {
        fail(new Error('Home Assistant WebSocket connection closed'));
      });
    });

    return this.ready;
  }

  private settle(msg: HAMessage): void {
    if (msg.id === undefined) return;
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    clearTimeout(pending.timer);

    if (msg.success) {
      pending.resolve(msg.result);
    } else {
      const code = msg.error?.code ?? 'unknown_error';
      pending.reject(new Error(`Home Assistant returned ${code}: ${msg.error?.message ?? 'no message'}`));
    }
  }

  /** Drop a dead connection so the next command reconnects. */
  private reset(ws: WebSocket, error: Error): void {
    if (this.ws !== ws) return; // already replaced by a newer connection
    this.ws = undefined;
    this.ready = undefined;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

const connection = new HAWebSocket();

/** Memoize a registry fetch for a short time; failures are not cached. */
function cached<T>(fetch: () => Promise<T>): () => Promise<T> {
  let entry: { at: number; value: Promise<T> } | undefined;
  return () => {
    if (!entry || Date.now() - entry.at > REGISTRY_CACHE_MS) {
      const value = fetch();
      entry = { at: Date.now(), value };
      value.catch(() => {
        entry = undefined;
      });
    }
    return entry.value;
  };
}

export const listAreas = cached(() => connection.command<HAArea[]>('config/area_registry/list'));
const listDevices = cached(() => connection.command<HADevice[]>('config/device_registry/list'));
const listEntityRegistry = cached(() =>
  connection.command<HAEntityRegistryEntry[]>('config/entity_registry/list'),
);

export async function searchDevices(query?: string): Promise<HADevice[]> {
  const devices = await listDevices();
  if (!query) return devices;

  const q = query.toLowerCase();
  return devices.filter(d =>
    (d.name || '').toLowerCase().includes(q) ||
    (d.name_by_user || '').toLowerCase().includes(q) ||
    (d.manufacturer || '').toLowerCase().includes(q) ||
    (d.model || '').toLowerCase().includes(q)
  );
}

export async function getConfigEntries(): Promise<HAConfigEntry[]> {
  return connection.command<HAConfigEntry[]>('config_entries/get');
}

/**
 * Map entity_id → area_id. Entity states carry no area; the area comes from the
 * entity registry, falling back to the area of the entity's device.
 */
export async function getEntityAreas(): Promise<Map<string, string>> {
  const [entities, devices] = await Promise.all([listEntityRegistry(), listDevices()]);
  const deviceArea = new Map(devices.filter(d => d.area_id).map(d => [d.id, d.area_id as string]));

  const areas = new Map<string, string>();
  for (const entity of entities) {
    const area = entity.area_id ?? (entity.device_id ? deviceArea.get(entity.device_id) : undefined);
    if (area) areas.set(entity.entity_id, area);
  }
  return areas;
}
