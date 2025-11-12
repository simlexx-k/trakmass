import { create } from 'zustand';

import {
  createMassEntry,
  initializeDatabase,
  listMassEntries,
  updateMassEntryStatus,
} from '@/services/storage';
import { queueMassEntryCreate } from '@/services/sync';
import type { MassEntry, MassEntryInput, SyncStatus } from '@/types/mass';

interface MassState {
  entries: MassEntry[];
  isHydrated: boolean;
  hydrate: (profileId?: string) => Promise<void>;
  addEntry: (input: MassEntryInput) => Promise<MassEntry>;
  markEntryStatus: (id: string, status: SyncStatus) => Promise<void>;
}

export const useMassStore = create<MassState>((set, get) => ({
  entries: [],
  isHydrated: false,
  hydrate: async (profileId) => {
    await initializeDatabase();
    const items = await listMassEntries(profileId);
    set({ entries: items, isHydrated: true });
  },
  addEntry: async (input) => {
    await initializeDatabase();
    const entry = await createMassEntry(input);
    set((state) => ({ entries: [entry, ...state.entries] }));
    await queueMassEntryCreate(entry);
    return entry;
  },
  markEntryStatus: async (id, status) => {
    await updateMassEntryStatus(id, status);
    set((state) => ({
      entries: state.entries.map((entry) =>
        entry.id === id ? { ...entry, status } : entry,
      ),
    }));
  },
}));
