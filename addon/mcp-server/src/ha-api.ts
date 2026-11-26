import type { HAEntityState, HAServiceCallResponse } from './types.js';
import { HA_API_URL, supervisorToken } from './supervisor.js';
import { getEntityAreas, listAreas } from './ha-websocket.js';

async function haFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${HA_API_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${supervisorToken()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HA API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

export interface EntitySearchResult {
  state: HAEntityState;
  area_id: string | null;
}

export async function searchEntities(args: {
  query?: string;
  domain?: string;
  area?: string;
  limit?: number;
}): Promise<EntitySearchResult[]> {
  const states = await haFetch<HAEntityState[]>('/states');

  let filtered = states;

  if (args.domain) {
    filtered = filtered.filter(s => s.entity_id.startsWith(args.domain + '.'));
  }

  if (args.query) {
    const q = args.query.toLowerCase();
    filtered = filtered.filter(s =>
      s.entity_id.toLowerCase().includes(q) ||
      (s.attributes.friendly_name as string || '').toLowerCase().includes(q)
    );
  }

  // Areas live in the registries, not in entity state attributes.
  let entityAreas: Map<string, string>;
  if (args.area) {
    // The caller asked to filter by area, so a registry failure is an error.
    const [areaMap, areas] = await Promise.all([getEntityAreas(), listAreas()]);
    entityAreas = areaMap;

    const a = args.area.toLowerCase();
    const matching = new Set(
      areas
        .filter(area => area.area_id.toLowerCase().includes(a) || area.name.toLowerCase().includes(a))
        .map(area => area.area_id),
    );
    filtered = filtered.filter(s => matching.has(entityAreas.get(s.entity_id) ?? ''));
  } else {
    // Area is only informational here; don't fail the search without it.
    entityAreas = await getEntityAreas().catch(() => new Map<string, string>());
  }

  const limit = args.limit || 50;
  return filtered.slice(0, limit).map(state => ({
    state,
    area_id: entityAreas.get(state.entity_id) ?? null,
  }));
}

export async function getEntityState(entityId: string): Promise<HAEntityState> {
  return haFetch<HAEntityState>(`/states/${encodeURIComponent(entityId)}`);
}

export async function callService(
  domain: string,
  service: string,
  data?: Record<string, unknown>,
): Promise<HAServiceCallResponse[]> {
  return haFetch<HAServiceCallResponse[]>(`/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`, {
    method: 'POST',
    body: JSON.stringify(data || {}),
  });
}

export async function searchAutomations(query?: string): Promise<HAEntityState[]> {
  const states = await haFetch<HAEntityState[]>('/states');
  let automations = states.filter(s => s.entity_id.startsWith('automation.'));

  if (query) {
    const q = query.toLowerCase();
    automations = automations.filter(s =>
      s.entity_id.toLowerCase().includes(q) ||
      (s.attributes.friendly_name as string || '').toLowerCase().includes(q)
    );
  }

  return automations;
}

export async function getConfig(): Promise<Record<string, unknown>> {
  return haFetch<Record<string, unknown>>('/config');
}
