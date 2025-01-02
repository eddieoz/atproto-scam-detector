import fs from 'fs';
import { Bot } from '@skyware/bot';

const SESSION_FILE = '../session.json';
const bot = new Bot();


/**
 * Loads a bot session from a file.
 * 
 * This function checks if the session file exists and attempts to read and parse its contents.
 * If the file does not exist or an error occurs during reading or parsing, the function logs
 * the error and returns `null`. Otherwise, it returns the parsed session data.
 * 
 * @returns {Record<string, unknown> | null} The parsed session data if successful, otherwise `null`.
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
 * Saves the bot session to a file.
 * 
 * This function takes a session object, converts it to a JSON string, and writes it to the session file.
 * If the write operation is successful, a success message is logged. If an error occurs during the write
 * operation, the error is logged to the console.
 * 
 * @param {Record<string, unknown>} session - The session data to be saved.
 * @returns {void}
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
 * Initializes or resumes a bot session. 
 * 
 * This function attempts to load an existing session from a file. If a session is found and valid,
 * it resumes the session using the bot instance. If the session cannot be resumed (e.g., due to
 * invalidity or an error), the function logs in with fresh credentials and saves the new session.
 * 
 * @returns {Promise<Bot>} A promise that resolves to the initialized or resumed bot instance.
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

/**
 * Retrieves the singleton instance of the bot.
 * 
 * This function returns the globally initialized bot instance, which can be used to interact
 * with the bot's functionalities. The bot instance is created and managed internally, and this
 * function provides access to it without requiring re-initialization.
 * 
 * @returns {Bot} The singleton instance of the bot.
 */
export function getBotInstance(): Bot {
  return bot;
}
