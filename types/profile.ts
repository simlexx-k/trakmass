import type { MassUnit } from './mass';

export interface UserProfile {
  id: string;
  fullName: string;
  email?: string | null;
  bio?: string | null;
  unitPreference: MassUnit;
  goalMass?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfileInput {
  fullName: string;
  email?: string;
  bio?: string;
  unitPreference?: MassUnit;
  goalMass?: number;
}
