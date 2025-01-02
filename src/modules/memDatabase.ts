import dotenv from 'dotenv';
dotenv.config();

const inMemoryIgnoreList = new Map<string, number>();
export function isHandleInMemoryIgnored(handle: string): boolean {
  const expirationTime = inMemoryIgnoreList.get(handle);
  if (expirationTime === undefined) return false;

  if (Date.now() > expirationTime) {
    // Expired, remove from the list
    inMemoryIgnoreList.delete(handle);
    return false;
  }
  return true;
}

export function addHandleToMemoryIgnoreList(did: string, periodDays: number): void {
  const expirationTime = Date.now() + periodDays * 24 * 60 * 60 * 1000;
  inMemoryIgnoreList.set(did, expirationTime);
}
