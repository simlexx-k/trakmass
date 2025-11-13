import {
  deleteMutation,
  enqueueMutation,
  listPendingMutations,
  recordMutationError,
  updateMassEntryStatus,
} from '@/services/storage';
import type { MassEntry, SyncMutation } from '@/types/mass';

const normalizeEndpoint = (endpoint: string) => endpoint.replace(/\/$/, '');
const rawSyncEndpoint = process.env.EXPO_PUBLIC_SYNC_ENDPOINT;
const SYNC_ENDPOINT =
  rawSyncEndpoint?.endsWith('/v1/mass')
    ? normalizeEndpoint(rawSyncEndpoint)
    : rawSyncEndpoint
    ? `${normalizeEndpoint(rawSyncEndpoint)}/v1/mass`
    : undefined;
type SyncStats = {
  attempted: number;
  synced: number;
  skipped: boolean;
  reason?: string;
  errors: string[];
};

const buildHeaders = (token?: string) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

const getMutationUrl = (mutation: SyncMutation) => {
  const base = SYNC_ENDPOINT?.replace(/\/$/, '');
  if (!base) return '';
  if (mutation.operation === 'update' || mutation.operation === 'delete') {
    return `${base}/${mutation.entityId}`;
  }
  return base;
};

const requestMethodForOperation = (operation: SyncMutation['operation']) => {
  switch (operation) {
    case 'update':
      return 'PATCH';
    case 'delete':
      return 'DELETE';
    default:
      return 'POST';
  }
};

const sendMutation = async (mutation: SyncMutation, token?: string) => {
  const url = getMutationUrl(mutation);
  if (!url) {
    throw new Error('SYNC_ENDPOINT is not configured');
  }

  const method = requestMethodForOperation(mutation.operation);
  const response = await fetch(url, {
    method,
    headers: buildHeaders(token),
    body: method === 'DELETE' ? undefined : JSON.stringify(mutation.payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Failed with status ${response.status}`);
  }
};

export const queueMassEntryCreate = async (entry: MassEntry) =>
  enqueueMutation(entry.id, 'create', {
    ...entry,
  });

export const syncPendingEntries = async (token?: string): Promise<SyncStats> => {
  if (!SYNC_ENDPOINT) {
    return {
      attempted: 0,
      synced: 0,
      skipped: true,
      reason: 'SYNC_ENDPOINT not configured',
      errors: [],
    };
  }

  const mutations = await listPendingMutations();
  if (mutations.length === 0) {
    return { attempted: 0, synced: 0, skipped: false, errors: [] };
  }

  let synced = 0;
  const errors: string[] = [];

  for (const mutation of mutations) {
    try {
      await sendMutation(mutation, token);
      synced += 1;
      await deleteMutation(mutation.id);
      await updateMassEntryStatus(mutation.entityId, 'synced');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown sync error';
      errors.push(message);
      await recordMutationError(mutation.id, message);
    }
  }

  return {
    attempted: mutations.length,
    synced,
    skipped: false,
    errors,
  };
};

const normalizePayload = (entry: MassEntry) => ({
  id: entry.id,
  profileId: entry.profileId,
  mass: entry.mass,
  unit: entry.unit,
  note: entry.note ?? undefined,
  tags: entry.tags ?? undefined,
  loggedAt: entry.loggedAt,
  status: entry.status,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
});

export const seedEntries = async (entries: MassEntry[], token?: string) => {
  if (!SYNC_ENDPOINT) {
    throw new Error('SYNC_ENDPOINT is not configured');
  }
  if (!token) {
    throw new Error('Authentication token missing for seeding');
  }
  const base = SYNC_ENDPOINT?.replace(/\/$/, '');
  if (!base) {
    throw new Error('SYNC_ENDPOINT is not configured');
  }
  const headers = buildHeaders(token);
  for (const entry of entries) {
    const payload = normalizePayload(entry);
    try {
      const response = await fetch(base, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (!response.ok && response.status !== 409) {
        const message = await response.text();
        throw new Error(message || `Failed to seed entry ${entry.id}`);
      }
    } catch (error) {
      console.warn('Seed entry failed', error);
    }
  }
};
