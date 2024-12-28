import fs from 'fs';
import path from 'path';

let handleIgnore: string[] = [];
const ignoreArray = "../lists/handle_ignore_array.js"
const watchFile = "./src/lists/handle_ignore_array.js" // workaround paths issue

/**
 * Dynamically import an array from a file, bypassing import caching.
 */
async function importArray(filePath: string): Promise<string[]> {
  const { default: array } = await import(`${filePath}?cacheBuster=${Date.now()}`);
  return array;
}

/**
 * Load (and watch) the ignore array from file.
 */
export async function loadIgnoreArray(): Promise<string[]> {
  handleIgnore = await importArray(ignoreArray);
  console.log('Ignore Array loaded:', handleIgnore.toString());

  fs.watch(watchFile, async (eventType) => {
    if (eventType === 'change') {
      try {
        handleIgnore = await importArray(ignoreArray);
        console.log('Ignore Array reloaded:', handleIgnore.toString());
      } catch (error) {
        console.error('Error reloading handleIgnore array:', error);
      }
    }
  });

  return handleIgnore;
}

/**
 * Expose the current (in-memory) ignore array.
 */
export function getIgnoreArray(): string[] {
  return handleIgnore;
}
