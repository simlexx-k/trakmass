import {
  deleteMutation,
  enqueueMutation,
  listPendingMutations,
  recordMutationError,
  updateMassEntryStatus,
} from '@/services/storage';
import type { MassEntry, SyncMutation } from '@/types/mass';

const SYNC_ENDPOINT = process.env.EXPO_PUBLIC_SYNC_ENDPOINT;

type SyncStats = {
  attempted: number;
  synced: number;
  skipped: boolean;
  reason?: string;
  errors: string[];
};

const buildMassUrl = (mutation: SyncMutation) => {
  if (!SYNC_ENDPOINT) return '';

  const base = `${SYNC_ENDPOINT.replace(/\/$/, '')}/v1/mass`;
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

const sendMutation = async (mutation: SyncMutation) => {
  const url = buildMassUrl(mutation);
  if (!url) {
    throw new Error('SYNC_ENDPOINT is not configured');
  }

  const method = requestMethodForOperation(mutation.operation);
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
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

export const syncPendingEntries = async (): Promise<SyncStats> => {
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
      await sendMutation(mutation);
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
