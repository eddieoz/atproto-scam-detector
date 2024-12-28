import { DidResolver } from '@atproto/identity';

const didResolver = new DidResolver({});

/**
 * Resolve a DID to a handle, if possible; otherwise return the DID itself.
 */
export async function resolveDidToHandle(did: string): Promise<string> {
  try {
    const doc = await didResolver.resolve(did);
    if (doc && doc.alsoKnownAs && doc.alsoKnownAs.length > 0) {
      // "at://handle" => "@handle"
      return doc.alsoKnownAs[0].replace('at://', '@');
    }
  } catch (err) {
    console.error(`Failed to resolve DID: ${did}`);
  }
  return did;
}
