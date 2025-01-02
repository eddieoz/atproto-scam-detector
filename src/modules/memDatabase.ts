import dotenv from "dotenv";
dotenv.config();

// A map to store handles and their corresponding expiration times
const inMemoryIgnoreList = new Map<string, number>();

/**
 * Checks if a given handle is currently in the in-memory ignore list.
 *
 * This function retrieves the expiration time for the handle from the in-memory ignore list.
 * If the handle is not found in the list, it returns `false`. If the handle is found but the
 * current time has surpassed its expiration time, the handle is removed from the list and
 * the function returns `false`. Otherwise, the function returns `true`, indicating that the
 * handle is still in the ignore list.
 *
 * @param handle - The handle to check in the in-memory ignore list.
 * @returns `true` if the handle is in the ignore list and has not expired, `false` otherwise.
 */
export function isHandleInMemoryIgnored(handle: string): boolean {
  const expirationTime = inMemoryIgnoreList.get(handle);
  if (expirationTime === undefined) return false;

  // If the current time is past the expiration time, remove the handle from the list
  if (Date.now() > expirationTime) {
    inMemoryIgnoreList.delete(handle);
    return false;
  }
  return true;
}

/**
 * Adds a handle to the in-memory ignore list with a specified expiration period.
 *
 * This function calculates the expiration time based on the current time and the provided
 * period in days. The handle is then added to the in-memory ignore list with the calculated
 * expiration time. Once the expiration time is reached, the handle will no longer be considered
 * as ignored.
 *
 * @param did - The handle (DID) to add to the in-memory ignore list.
 * @param periodDays - The number of days from the current time until the handle should be ignored.
 */
export function addHandleToMemoryIgnoreList(
  did: string,
  periodDays: number
): void {
  const expirationTime = Date.now() + periodDays * 24 * 60 * 60 * 1000;
  inMemoryIgnoreList.set(did, expirationTime);
}
