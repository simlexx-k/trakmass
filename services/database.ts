import { Platform } from 'react-native';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const DB_NAME = 'trakmass.db';
const isWeb = Platform.OS === 'web';

type ResultRow = Record<string, unknown>;
type StatementParams = unknown[];

type SQLResultSet = {
  rows: {
    length: number;
    item: (index: number) => ResultRow;
  };
};

let databasePromise: Promise<SQLiteDatabase> | null = null;

const getDatabase = async () => {
  if (isWeb) {
    throw new Error('SQLite is not available on this platform.');
  }
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DB_NAME);
  }
  return databasePromise;
};

const createResultSet = (rows: ResultRow[]): SQLResultSet => ({
  rows: {
    length: rows.length,
    item: (index: number) => rows[index],
  },
});

export const executeSql = async (
  query: string,
  params: StatementParams = [],
): Promise<SQLResultSet> => {
  const database = await getDatabase();
  const statement = await database.prepareAsync(query);
  try {
    const result = await statement.executeAsync(...params);
    let rows: ResultRow[] = [];
    try {
      rows = await result.getAllAsync();
    } catch {
      rows = [];
    }
    return createResultSet(rows);
  } finally {
    await statement.finalizeAsync();
  }
};
