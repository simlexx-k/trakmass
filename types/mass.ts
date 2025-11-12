export type MassUnit = 'kg' | 'lb';

export type SyncStatus = 'pending' | 'synced' | 'failed';

export interface MassEntry {
  id: string;
  profileId: string;
  mass: number;
  unit: MassUnit;
  note?: string | null;
  tags?: string[];
  loggedAt: string; // ISO string
  status: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MassEntryInput {
  profileId: string;
  mass: number;
  unit: MassUnit;
  note?: string;
  tags?: string[];
  loggedAt?: string;
}

export type SyncOperation = 'create' | 'update' | 'delete';

export interface SyncMutation {
  id: string;
  entityType: 'mass_entry';
  entityId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  attempts: number;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}
