import { DidDocument, VerificationMethod } from './types.js';
// We will likely need key generation utilities. 
// Assuming @bsv/sdk provides what we need, e.g., for generating secp256k1 keys.
import { PrivateKey, PublicKey } from '@bsv/sdk';
import { toBase58, fromBase58 } from '@bsv/sdk/primitives/utils';
// import bs58 from 'bs58'; // For Base58BTC encoding - Replaced by @bsv/sdk

// The multiformats/multicodec part is for did:key encoding of the public key
// We might need a library for this, or @bsv/sdk might handle it.
// For now, we'll represent the public key bytes as a Uint8Array conceptually.

const DID_KEY_PREFIX = 'did:key:';
// Multicodec prefix for secp256k1 public key (0xe7) followed by the identity/raw format (0x01)
const MULTICODEC_SECP256K1_PUB_HEADER = new Uint8Array([0xe7, 0x01]);

/**
 * A service for managing W3C DIDs, initially focusing on the 'did:key' method.
 */
export class DIDService {
  /**
   * Generates a new secp256k1 key pair and constructs a did:key identifier.
   * The public key is represented using publicKeyMultibase with a 'z' prefix,
   * indicating base58btc encoding of the multicodec-prefixed public key.
   *
   * @returns A promise that resolves to an object containing the DID, its corresponding
   *          DID Document (using Multikey type), and the private key (as hex).
   */
  /**
   * Constructs a did:key identifier and its DID Document from a given public key hex string.
   * The public key is represented using publicKeyMultibase with a 'z' prefix,
   * indicating base58btc encoding of the multicodec-prefixed public key.
   *
   * @param publicKeyHex - The public key in hexadecimal string format.
   * @returns A promise that resolves to an object containing the DID and its corresponding DID Document.
   */
  public async constructDidFromPublicKeyHex(publicKeyHex: string): Promise<{
    did: string;
    document: DidDocument;
  }> {
    const publicKeyInstance = PublicKey.fromString(publicKeyHex);
    // Ensure the public key is compressed (did:key typically uses compressed keys)
    const compressedPublicKeyBytes = publicKeyInstance.encode(true);

    const bufferToEncode = new Uint8Array(
      MULTICODEC_SECP256K1_PUB_HEADER.length + compressedPublicKeyBytes.length
    );
    bufferToEncode.set(MULTICODEC_SECP256K1_PUB_HEADER);
    bufferToEncode.set(compressedPublicKeyBytes as unknown as number[], MULTICODEC_SECP256K1_PUB_HEADER.length);

    const publicKeyMultibase = `z${toBase58(bufferToEncode as unknown as number[])}`; // Pass Uint8Array directly
    const did = `${DID_KEY_PREFIX}${publicKeyMultibase}`;
    const verificationMethodId = `${did}#${publicKeyMultibase}`; // For Multikey, fragment is the multibase key itself

    const document: DidDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/multikey/v1' // Context for Multikey
      ],
      id: did,
      verificationMethod: [
        {
          id: verificationMethodId,
          type: 'Multikey', // Use Multikey type
          controller: did,
          publicKeyMultibase: publicKeyMultibase
        },
      ],
      authentication: [verificationMethodId],
      assertionMethod: [verificationMethodId],
      capabilityInvocation: [verificationMethodId],
      capabilityDelegation: [verificationMethodId],
    };

    return {
      did,
      document,
    };
  }

  /**
   * Resolves a did:key identifier to its corresponding DID Document.
   *
   * @param did - The did:key string (e.g., "did:key:z...").
   * @returns A promise that resolves to the DID Document.
   * @throws If the DID is not a valid did:key format or the key data is invalid.
   */
  public async resolveDidKey(did: string): Promise<DidDocument> {
    if (!did.startsWith(DID_KEY_PREFIX)) {
      throw new Error('Invalid DID: Must start with did:key:');
    }

    const publicKeyMultibase = did.substring(DID_KEY_PREFIX.length);
    if (!publicKeyMultibase.startsWith('z')) {
      // This check is correct for base58btc multibase prefix
      throw new Error('Invalid did:key: Public key must be multibase base58btc encoded (start with z)');
    }

    let decodedBytes: Uint8Array;
    try {
      // Remove 'z' prefix for bs58 decoding
      decodedBytes = new Uint8Array(fromBase58(publicKeyMultibase.substring(1)));
    } catch (e) {
      throw new Error('Invalid did:key: Failed to decode base58btc public key.');
    }

    // Validate multicodec header for secp256k1 (0xe701)
    if (decodedBytes.length < MULTICODEC_SECP256K1_PUB_HEADER.length ||
        !MULTICODEC_SECP256K1_PUB_HEADER.every((val, index) => val === decodedBytes[index])) {
      throw new Error('Invalid did:key: Public key does not have a valid secp256k1 multicodec prefix.');
    }

    // Validate public key length (compressed secp256k1 is 33 bytes + 2 bytes for header = 35 total for decodedBytes)
    const expectedDecodedLength = MULTICODEC_SECP256K1_PUB_HEADER.length + 33; // 33 for compressed secp256k1
    if (decodedBytes.length !== expectedDecodedLength) {
      throw new Error(`Invalid did:key: Decoded public key length is incorrect for secp256k1. Expected ${expectedDecodedLength}, got ${decodedBytes.length}.`);
    }
    
    // Optional: Further validation of public key bytes (e.g., prefix 0x02 or 0x03 for compressed)
    const pubKeyBytesOnly = decodedBytes.slice(MULTICODEC_SECP256K1_PUB_HEADER.length);
    if (pubKeyBytesOnly[0] !== 0x02 && pubKeyBytesOnly[0] !== 0x03) {
        throw new Error('Invalid did:key: Compressed public key must start with 0x02 or 0x03.');
    }


    const verificationMethodId = `${did}#${publicKeyMultibase}`;
    const document: DidDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/multikey/v1' // Context for Multikey
      ],
      id: did,
      verificationMethod: [
        {
          id: verificationMethodId,
          type: 'Multikey', // Use Multikey type
          controller: did,
          publicKeyMultibase: publicKeyMultibase
        },
      ],
      authentication: [verificationMethodId],
      assertionMethod: [verificationMethodId],
      capabilityInvocation: [verificationMethodId],
      capabilityDelegation: [verificationMethodId],
    };

    return document;
  }
}
