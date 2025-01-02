import fs from "fs";
import path from "path";

let handleIgnore: string[] = [];
const ignoreArray = "../lists/handle_ignore_array.js";
const watchFile = "./src/lists/handle_ignore_array.js"; // workaround paths issue

/**
 * Asynchronously imports an array from a specified file path.
 *
 * This function dynamically imports a module from the given file path, appending a cache-busting query parameter
 * to ensure the module is always freshly loaded. It then extracts and returns the default export from the module,
 * which is expected to be an array of strings.
 *
 * @param {string} filePath - The path to the file from which to import the array. This path should be relative
 *                            to the current module or an absolute path.
 * @returns {Promise<string[]>} A promise that resolves to the array of strings imported from the specified file.
 */
async function importArray(filePath: string): Promise<string[]> {
  const { default: array } = await import(
    `${filePath}?cacheBuster=${Date.now()}`
  );
  return array;
}

/**
 * Asynchronously loads the ignore array from the specified file and sets up a file watcher to reload the array
 * whenever the file changes. This function ensures that the `handleIgnore` array is always up-to-date with the
 * contents of the file.
 *
 * The function first imports the ignore array from the file specified by `ignoreArray` and logs the loaded array
 * to the console. It then sets up a file watcher on the file specified by `watchFile`. If the file changes, the
 * function will attempt to reload the ignore array and log the updated array to the console. If an error occurs
 * during the reload, it will be logged to the console as an error.
 *
 * @returns {Promise<string[]>} A promise that resolves to the loaded ignore array.
 */
export async function loadIgnoreArray(): Promise<string[]> {
  handleIgnore = await importArray(ignoreArray);
  console.log("Ignore Array loaded:", handleIgnore.toString());

  fs.watch(watchFile, async (eventType) => {
    if (eventType === "change") {
      try {
        handleIgnore = await importArray(ignoreArray);
        console.log("Ignore Array reloaded:", handleIgnore.toString());
      } catch (error) {
        console.error("Error reloading handleIgnore array:", error);
      }
    }
  });

  return handleIgnore;
}

/**
 * Retrieves the current ignore array.
 *
 * This function returns the `handleIgnore` array, which contains a list of strings that are used to ignore certain
 * handles or identifiers. The array is initially loaded and can be updated dynamically by the `loadIgnoreArray` function
 * when the corresponding file changes.
 *
 * @returns {string[]} The current `handleIgnore` array, which is a list of strings representing the handles or identifiers to be ignored.
 */
export function getIgnoreArray(): string[] {
  return handleIgnore;
}
