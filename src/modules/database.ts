import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

const DATABASE_FILE = './ignoreHandles.db';

let db: Database | null = null;


/**
 * Initializes the SQLite database by opening a connection to the specified database file
 * and creating the `ignore_handles` table if it does not already exist. The table is designed
 * to store handles (as primary keys) and their corresponding expiration times in milliseconds.
 * 
 * The database connection is stored in the global `db` variable for use in other functions.
 * 
 * @returns {Promise<void>} A promise that resolves when the database is successfully initialized.
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
 * Adds a handle to the ignore list with a specified expiration period in days.
 * If the handle already exists in the ignore list, it will be updated with the new expiration time.
 * The expiration time is calculated by adding the specified number of days to the current time.
 * 
 * @param {string} handle - The handle to be added to the ignore list.
 * @param {number} periodDays - The number of days after which the handle should be removed from the ignore list.
 * @returns {Promise<void>} A promise that resolves when the handle has been successfully added or updated in the ignore list.
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
 * Checks if a given handle is currently in the ignore list and not expired.
 * If the handle is found in the ignore list but its expiration time has passed,
 * the handle is removed from the ignore list.
 * 
 * @param {string} handle - The handle to check in the ignore list.
 * @returns {Promise<boolean>} A promise that resolves to `true` if the handle is in the ignore list and not expired,
 *                             otherwise resolves to `false`.
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
