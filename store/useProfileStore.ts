import { create } from 'zustand';

import { initializeDatabase, getUserProfile, saveUserProfile } from '@/services/storage';
import type { UserProfile, UserProfileInput } from '@/types/profile';

interface ProfileState {
  profile: UserProfile | null;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  save: (input: UserProfileInput) => Promise<UserProfile>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  isHydrated: false,
  hydrate: async () => {
    if (get().isHydrated) return;
    await initializeDatabase();
    const data = await getUserProfile();
    set({ profile: data, isHydrated: true });
  },
  save: async (input) => {
    await initializeDatabase();
    const updated = await saveUserProfile(input);
    set({ profile: updated, isHydrated: true });
    return updated;
  },
}));
