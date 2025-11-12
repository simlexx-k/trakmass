import { create } from 'zustand';

import { DEFAULT_SETTINGS, getAppSettings, saveAppSettings } from '@/services/storage';
import type { AppSettings } from '@/services/storage';

export type NormalizedSettings = AppSettings;

interface SettingsState {
  settings: NormalizedSettings;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  update: (patch: Partial<NormalizedSettings>) => Promise<NormalizedSettings>;
  setLastSync: (timestamp: string) => Promise<NormalizedSettings>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isHydrated: false,
  hydrate: async () => {
    if (get().isHydrated) return get().settings;
    const loaded = await getAppSettings();
    set({ settings: loaded, isHydrated: true });
    return loaded;
  },
  update: async (patch) => {
    const current = get().settings;
    const updated = await saveAppSettings({ ...current, ...patch });
    set({ settings: updated, isHydrated: true });
    return updated;
  },
  setLastSync: async (timestamp) => {
    const current = get().settings;
    const updated = await saveAppSettings({ ...current, lastSync: timestamp });
    set({ settings: updated, isHydrated: true });
    return updated;
  },
}));
