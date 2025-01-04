import { DidResolver } from '@atproto/identity';

// Initialize a new DID resolver with an empty configuration.
const didResolver = new DidResolver({});

/**
 * Resolves a Decentralized Identifier (DID) to a handle.
 * 
 * This function takes a DID as input and attempts to resolve it using the configured DID resolver.
 * If the resolution is successful and the DID document contains an `alsoKnownAs` field with at least one entry,
 * the function extracts the handle from the first entry in the `alsoKnownAs` array. The handle is expected to be in the format "at://handle",
 * which is then converted to "@handle".
 * 
 * If the resolution fails or the `alsoKnownAs` field is empty or missing, the function returns the original DID.
 * 
 * @param {string} did - The Decentralized Identifier (DID) to resolve.
 * @returns {Promise<string>} A promise that resolves to the handle (in the format "@handle") or the original DID if resolution fails.
 */
export async function resolveDidToHandle(did: string): Promise<string> {
  try {
    // Attempt to resolve the DID to a DID document.
    const doc = await didResolver.resolve(did);
    if (doc && doc.alsoKnownAs && doc.alsoKnownAs.length > 0) {
      // Convert the first entry in the `alsoKnownAs` array from "at://handle" to "@handle".
      return doc.alsoKnownAs[0].replace('at://', '@');
    }
  } catch (err) {
    console.error(`Failed to resolve DID: ${did}`);
  }
  // Return the original DID if resolution fails or the `alsoKnownAs` field is empty or missing.
  return did;
}
