import fs from 'fs';
import { Bot } from '@skyware/bot';

const SESSION_FILE = '../session.json';
const bot = new Bot();

/**
 * Load a session from disk if it exists.
 */
function loadSession(): Record<string, unknown> | null {
  if (!fs.existsSync(SESSION_FILE)) return null;

  try {
    const sessionData = fs.readFileSync(SESSION_FILE, 'utf-8');
    return JSON.parse(sessionData);
  } catch (error) {
    console.error('Failed to load session:', error);
    return null;
  }
}

/**
 * Save the current session to disk.
 */
function saveSession(session: Record<string, unknown>): void {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(session), 'utf-8');
    console.log('Session saved successfully.');
  } catch (error) {
    console.error('Failed to save session:', error);
  }
}

/**
 * Initialize the bot: either resume an existing session or log in anew.
 */
export async function initializeBotSession(): Promise<Bot> {
  let session = loadSession();
  if (session) {
    try {
      await bot.resumeSession(session);
      console.log('Session resumed successfully.');
      return bot;
    } catch (error) {
      console.warn('Failed to resume session; logging in again:', error);
    }
  }

  // If we couldn't resume, login fresh
  session = await bot.login({
    identifier: process.env.LABELER_DID,
    password: process.env.LABELER_PASSWORD,
  });
  saveSession(session);

  return bot;
}

export function getBotInstance(): Bot {
  return bot;
}
