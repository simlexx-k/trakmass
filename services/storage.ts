import { Platform } from 'react-native';

import { executeSql } from '@/services/database';
import type {
  MassEntry,
  MassEntryInput,
  SyncMutation,
  SyncOperation,
  SyncStatus,
} from '@/types/mass';
import type { UserProfile, UserProfileInput } from '@/types/profile';

const MASS_TABLE = 'mass_entries';
const QUEUE_TABLE = 'sync_queue';
const PROFILE_TABLE = 'profiles';
const PROFILE_ID = 'primary_profile';
const SETTINGS_TABLE = 'app_settings';
const SETTINGS_KEY = 'app.settings';

const isWeb = Platform.OS === 'web';
const WEB_STORAGE_KEY = 'trakmass.offline.db';

export interface AppSettings {
  autoSync: boolean;
  remindersEnabled: boolean;
  reminderHour: number;
  lastSync?: string | null;
  reminderNotificationId?: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoSync: true,
  remindersEnabled: true,
  reminderHour: 7,
  lastSync: null,
  reminderNotificationId: null,
};

type WebState = {
  massEntries: MassEntry[];
  syncQueue: SyncMutation[];
  profile: UserProfile | null;
  settings: AppSettings;
};

const getWebStorage = (): Storage | null => {
  if (typeof window === 'undefined' || !('localStorage' in window)) return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const readWebState = (): WebState => {
  const storage = getWebStorage();
  const base = {
    massEntries: [],
    syncQueue: [],
    profile: null,
    settings: DEFAULT_SETTINGS,
  };
  if (!storage) {
    return base;
  }
  try {
    const raw = storage.getItem(WEB_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<WebState>;
    return {
      massEntries: parsed.massEntries ?? [],
      syncQueue: parsed.syncQueue ?? [],
      profile: parsed.profile ?? null,
      settings: parsed.settings ?? DEFAULT_SETTINGS,
    };
  } catch {
    return base;
  }
};

let webState: WebState | null = isWeb ? readWebState() : null;

const ensureWebState = (): WebState | null => {
  if (!isWeb) return null;
  if (!webState) {
    webState = readWebState();
  }
  return webState;
};

const persistWebState = () => {
  if (!isWeb || !webState) return;
  const storage = getWebStorage();
  storage?.setItem(WEB_STORAGE_KEY, JSON.stringify(webState));
};

const serializeTags = (tags?: string[]) =>
  tags && tags.length > 0 ? JSON.stringify(tags) : null;

const deserializeTags = (raw?: string | null) => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const mapRowToEntry = (row: Record<string, unknown>): MassEntry => ({
  id: String(row.id),
  profileId: String(row.profile_id),
  mass: Number(row.mass),
  unit: row.unit === 'lb' ? 'lb' : 'kg',
  note: row.note ? String(row.note) : null,
  tags: deserializeTags(row.tags as string | null | undefined),
  loggedAt: String(row.logged_at),
  status: (row.status as SyncStatus) ?? 'pending',
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const mapRowToMutation = (row: Record<string, unknown>): SyncMutation => ({
  id: String(row.id),
  entityType: row.entity_type === 'mass_entry' ? 'mass_entry' : 'mass_entry',
  entityId: String(row.entity_id),
  operation: (row.operation as SyncOperation) ?? 'create',
  payload: JSON.parse(String(row.payload)),
  attempts: Number(row.attempts ?? 0),
  lastError: row.last_error ? String(row.last_error) : null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const mapRowToProfile = (row: Record<string, unknown>): UserProfile => ({
  id: String(row.id),
  fullName: row.full_name ? String(row.full_name) : '',
  email: row.email ? String(row.email) : null,
  bio: row.bio ? String(row.bio) : null,
  unitPreference: row.unit_preference === 'lb' ? 'lb' : 'kg',
  goalMass:
    row.goal_mass === null || row.goal_mass === undefined
      ? null
      : Number(row.goal_mass),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const sortEntriesDesc = (entries: MassEntry[]) =>
  [...entries].sort(
    (a, b) =>
      new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime(),
  );

const sortMutationsAsc = (mutations: SyncMutation[]) =>
  [...mutations].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

export const initializeDatabase = async () => {
  if (isWeb) {
    ensureWebState();
    return;
  }

  const schemaStatements = [
    `CREATE TABLE IF NOT EXISTS ${MASS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      profile_id TEXT NOT NULL,
      mass REAL NOT NULL,
      unit TEXT NOT NULL,
      note TEXT,
      tags TEXT,
      logged_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS ${QUEUE_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS ${SETTINGS_TABLE} (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS ${PROFILE_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT,
      bio TEXT,
      unit_preference TEXT NOT NULL DEFAULT 'kg',
      goal_mass REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_mass_entries_status
      ON ${MASS_TABLE} (status);`,
    `CREATE INDEX IF NOT EXISTS idx_sync_queue_entity
      ON ${QUEUE_TABLE} (entity_type, entity_id);`,
  ];

  for (const statement of schemaStatements) {
    await executeSql(statement);
  }
};

export const createMassEntry = async (input: MassEntryInput): Promise<MassEntry> => {
  const now = new Date().toISOString();
  const entry: MassEntry = {
    id: createId(),
    profileId: input.profileId,
    mass: input.mass,
    unit: input.unit,
    note: input.note ?? null,
    tags: input.tags ?? [],
    loggedAt: input.loggedAt ?? now,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  if (isWeb) {
    const state = ensureWebState();
    if (state) {
      state.massEntries = [entry, ...state.massEntries];
      persistWebState();
    }
    return entry;
  }

  await executeSql(
    `INSERT INTO ${MASS_TABLE}
      (id, profile_id, mass, unit, note, tags, logged_at, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      entry.id,
      entry.profileId,
      entry.mass,
      entry.unit,
      entry.note,
      serializeTags(entry.tags),
      entry.loggedAt,
      entry.status,
      entry.createdAt,
      entry.updatedAt,
    ],
  );

  return entry;
};

export const listMassEntries = async (profileId?: string, limit = 200) => {
  if (isWeb) {
    const state = ensureWebState();
    if (!state) return [];
    const filtered = state.massEntries.filter((entry) =>
      profileId ? entry.profileId === profileId : true,
    );
    return sortEntriesDesc(filtered).slice(0, limit);
  }

  const rows = await executeSql(
    `SELECT * FROM ${MASS_TABLE}
      ${profileId ? 'WHERE profile_id = ?' : ''}
      ORDER BY datetime(logged_at) DESC
      LIMIT ?;`,
    profileId ? [profileId, limit] : [limit],
  );

  const items: MassEntry[] = [];
  for (let i = 0; i < rows.rows.length; i += 1) {
    items.push(mapRowToEntry(rows.rows.item(i)));
  }

  return items;
};

export const updateMassEntryStatus = async (id: string, status: SyncStatus) => {
  const now = new Date().toISOString();

  if (isWeb) {
    const state = ensureWebState();
    if (state) {
      state.massEntries = state.massEntries.map((entry) =>
        entry.id === id ? { ...entry, status, updatedAt: now } : entry,
      );
      persistWebState();
    }
    return;
  }

  await executeSql(
    `UPDATE ${MASS_TABLE} SET status = ?, updated_at = ? WHERE id = ?;`,
    [status, now, id],
  );
};

export const enqueueMutation = async (
  entityId: string,
  operation: SyncOperation,
  payload: Record<string, unknown>,
) => {
  const now = new Date().toISOString();
  const mutationId = createId();

  if (isWeb) {
    const state = ensureWebState();
    if (state) {
      const mutation: SyncMutation = {
        id: mutationId,
        entityType: 'mass_entry',
        entityId,
        operation,
        payload,
        attempts: 0,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      };
      state.syncQueue = [...state.syncQueue, mutation];
      persistWebState();
    }
    return mutationId;
  }

  await executeSql(
    `INSERT INTO ${QUEUE_TABLE}
      (id, entity_type, entity_id, operation, payload, attempts, last_error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      mutationId,
      'mass_entry',
      entityId,
      operation,
      JSON.stringify(payload),
      0,
      null,
      now,
      now,
    ],
  );

  return mutationId;
};

export const listPendingMutations = async (limit = 25) => {
  if (isWeb) {
    const state = ensureWebState();
    if (!state) return [];
    return sortMutationsAsc(state.syncQueue).slice(0, limit);
  }

  const result = await executeSql(
    `SELECT * FROM ${QUEUE_TABLE}
      ORDER BY datetime(created_at) ASC
      LIMIT ?;`,
    [limit],
  );
  const items: SyncMutation[] = [];
  for (let i = 0; i < result.rows.length; i += 1) {
    items.push(mapRowToMutation(result.rows.item(i)));
  }
  return items;
};

export const deleteMutation = async (id: string) => {
  if (isWeb) {
    const state = ensureWebState();
    if (state) {
      state.syncQueue = state.syncQueue.filter((mutation) => mutation.id !== id);
      persistWebState();
    }
    return;
  }
  await executeSql(`DELETE FROM ${QUEUE_TABLE} WHERE id = ?;`, [id]);
};

export const recordMutationError = async (id: string, errorMessage: string) => {
  const now = new Date().toISOString();

  if (isWeb) {
    const state = ensureWebState();
    if (state) {
      state.syncQueue = state.syncQueue.map((mutation) =>
        mutation.id === id
          ? {
              ...mutation,
              attempts: mutation.attempts + 1,
              lastError: errorMessage,
              updatedAt: now,
            }
          : mutation,
      );
      persistWebState();
    }
    return;
  }

  await executeSql(
    `UPDATE ${QUEUE_TABLE}
      SET attempts = attempts + 1,
          last_error = ?,
          updated_at = ?
      WHERE id = ?;`,
    [errorMessage, now, id],
  );
};

export const getUserProfile = async (): Promise<UserProfile | null> => {
  if (isWeb) {
    const state = ensureWebState();
    return state?.profile ?? null;
  }

  const result = await executeSql(
    `SELECT * FROM ${PROFILE_TABLE} WHERE id = ? LIMIT 1;`,
    [PROFILE_ID],
  );
  if (result.rows.length === 0) return null;
  return mapRowToProfile(result.rows.item(0));
};

export const saveUserProfile = async (
  input: UserProfileInput,
): Promise<UserProfile> => {
  const now = new Date().toISOString();
  const profile: UserProfile = {
    id: PROFILE_ID,
    fullName: input.fullName.trim(),
    email: input.email?.trim() ?? null,
    bio: input.bio?.trim() ?? null,
    unitPreference: input.unitPreference ?? 'kg',
    goalMass:
      input.goalMass === undefined || Number.isNaN(input.goalMass)
        ? null
        : input.goalMass,
    createdAt: now,
    updatedAt: now,
  };

  if (isWeb) {
    const state = ensureWebState();
    if (state) {
      const existing = state.profile;
      state.profile = existing
        ? { ...profile, createdAt: existing.createdAt, updatedAt: now }
        : profile;
      persistWebState();
      return state.profile;
    }
    return profile;
  }

  const existing = await executeSql(
    `SELECT id, created_at FROM ${PROFILE_TABLE} WHERE id = ? LIMIT 1;`,
    [PROFILE_ID],
  );

  if (existing.rows.length > 0) {
    const persistedCreatedAt = String(existing.rows.item(0).created_at);
    await executeSql(
      `UPDATE ${PROFILE_TABLE}
        SET full_name = ?, email = ?, bio = ?, unit_preference = ?, goal_mass = ?, updated_at = ?
        WHERE id = ?;`,
      [
        profile.fullName,
        profile.email,
        profile.bio,
        profile.unitPreference,
        profile.goalMass,
        now,
        PROFILE_ID,
      ],
    );
    return {
      ...profile,
      createdAt: persistedCreatedAt,
      updatedAt: now,
    };
  }

  await executeSql(
    `INSERT INTO ${PROFILE_TABLE}
      (id, full_name, email, bio, unit_preference, goal_mass, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      PROFILE_ID,
      profile.fullName,
      profile.email,
      profile.bio,
      profile.unitPreference,
      profile.goalMass,
      now,
      now,
    ],
  );

  return profile;
};

const mergeSettings = (value?: Partial<AppSettings>): AppSettings => {
  const raw = { ...DEFAULT_SETTINGS, ...value };
  const reminderHour = Number.isFinite(Number(raw.reminderHour))
    ? Number(raw.reminderHour)
    : DEFAULT_SETTINGS.reminderHour;
  return {
    ...raw,
    reminderHour,
  };
};

const applyWebSettings = (settings: AppSettings) => {
  const state = ensureWebState();
  if (!state) return;
  state.settings = mergeSettings(settings);
  persistWebState();
};

export const getAppSettings = async (): Promise<AppSettings> => {
  if (isWeb) {
    const state = ensureWebState();
    return state?.settings ?? DEFAULT_SETTINGS;
  }
  const result = await executeSql(
    `SELECT value FROM ${SETTINGS_TABLE} WHERE key = ? LIMIT 1;`,
    [SETTINGS_KEY],
  );
  if (result.rows.length === 0) {
    return DEFAULT_SETTINGS;
  }
  try {
    const value = String(result.rows.item(0).value);
    return mergeSettings(JSON.parse(value));
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveAppSettings = async (settings: AppSettings): Promise<AppSettings> => {
  const normalized = mergeSettings(settings);
  if (isWeb) {
    applyWebSettings(normalized);
    return normalized;
  }

  const payload = JSON.stringify(normalized);
  await executeSql(
    `INSERT INTO ${SETTINGS_TABLE}
      (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
    [SETTINGS_KEY, payload, new Date().toISOString()],
  );

  return normalized;
};
