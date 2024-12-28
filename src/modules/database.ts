import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

const DATABASE_FILE = './ignoreHandles.db';

let db: Database | null = null;

/**
 * Initializes the SQLite database and creates the ignore_handles table if needed.
 */
export async function initializeDatabase(): Promise<void> {
  db = await open({
    filename: DATABASE_FILE,
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS ignore_handles (
      handle TEXT PRIMARY KEY,
      expiration_time INTEGER
    );
  `);
}

/**
 * Adds a handle to the ignore list with an expiration time in days.
 */
export async function addHandleToIgnoreList(
  handle: string,
  periodDays: number,
): Promise<void> {
  if (!db) return;
  const expirationTime = Date.now() + periodDays * 24 * 60 * 60 * 1000;
  await db.run(
    `
    INSERT OR REPLACE INTO ignore_handles (handle, expiration_time)
    VALUES (?, ?);
    `,
    [handle, expirationTime],
  );
}

/**
 * Checks if a handle is in the ignore list; removes it if expired.
 */
export async function isHandleIgnored(handle: string): Promise<boolean> {
  if (!db) return false;
  const row = await db.get(
    `SELECT expiration_time FROM ignore_handles WHERE handle = ?;`,
    [handle],
  );

  if (!row || typeof row !== 'object') return false;

  const { expiration_time } = row;
  if (Date.now() > expiration_time) {
    // Expired
    await db.run(`DELETE FROM ignore_handles WHERE handle = ?;`, [handle]);
    return false;
  }
  return true;
}
