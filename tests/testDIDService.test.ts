jest.mock('@bsv/sdk', () => {
  const mockPublicKeyInstance = {
    toHex: jest.fn(() => '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'),
    toBytes: jest.fn(() => {
      const bytes = new Uint8Array(33);
      bytes[0] = 0x02;
      for (let i = 1; i < 33; i++) bytes[i] = (i * 5) % 256;
      return bytes;
    }),
    // Add encode if needed by DIDService, e.g. encode: jest.fn((compressed: boolean) => bytes_or_string)
  };

  const mockPrivateKeyInstance = {
    toHex: jest.fn(() => 'mockPrivateKeyHex1234567890abcdef1234567890abcdef1234567890abcdef'),
    toPublicKey: jest.fn(() => mockPublicKeyInstance),
  };

  return {
    PrivateKey: {
      fromRandom: jest.fn(() => mockPrivateKeyInstance),
      fromHex: jest.fn((_hex /*: string */) => mockPrivateKeyInstance),
    },
    PublicKey: {
      fromHex: jest.fn((_hex /*: string */) => mockPublicKeyInstance),
    },
    // Add other @bsv/sdk exports if DIDService uses them
    __esModule: true, // Important for ESM modules
  };
});

import { DIDService } from '../backend/src/DIDService.ts';
import { DidDocument } from '../backend/src/types.ts'; // Corrected casing and extension
import bs58 from 'bs58'; // For Base58BTC encoding in test data construction
import { jest } from '@jest/globals';

describe('DIDService', () => {
  let didService: DIDService;

  beforeAll(() => {
    didService = new DIDService();
  });

  it('should create a did:key and its corresponding DID Document', async () => {
    const { did, document, privateKeyHex } = await didService.createDidKey();

    // Check DID format (basic check for did:key method)
    expect(did).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/);
    
    // Check DID Document structure
    expect(document).toBeDefined();
    expect(document.id).toEqual(did);
    expect(document['@context']).toEqual([
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/multikey/v1' // Now expects Multikey context
    ]);
    expect(document.verificationMethod).toBeDefined(); // Assert it's defined
    expect(document.verificationMethod).toBeInstanceOf(Array);
    expect(document.verificationMethod!.length).toBe(1); // Use non-null assertion after check
    
    const vm = document.verificationMethod![0]; // Use non-null assertion
    expect(vm.id).toEqual(`${did}#${vm.publicKeyMultibase}`); 
    expect(vm.type).toEqual('Multikey'); // Now expects Multikey type
    expect(vm.controller).toEqual(did);
    expect(vm.publicKeyMultibase).toMatch(/^z[1-9A-HJ-NP-Za-km-z]+$/); // Base58btc encoded public key

    expect(document.authentication).toEqual([vm.id]);
    expect(document.assertionMethod).toEqual([vm.id]);
    expect(document.capabilityDelegation).toEqual([vm.id]);
    expect(document.capabilityInvocation).toEqual([vm.id]);

    // Check private key format (basic hex check)
    expect(privateKeyHex).toMatch(/^[0-9a-fA-F]{64}$/); 
  });

  it('should resolve a did:key to its DID Document', async () => {
    const { did, document: createdDocument } = await didService.createDidKey();
    const resolvedDocument = await didService.resolveDidKey(did);

    // The resolved document should be identical to the created one
    expect(resolvedDocument).toEqual(createdDocument);
  });

  it('should throw an error if trying to resolve an invalid did:key format (not starting with z)', async () => {
    const invalidDid = 'did:key:abc'; // 'abc' is not a valid multibase prefix for Ed25519
    await expect(didService.resolveDidKey(invalidDid)).rejects.toThrow('Invalid did:key: Public key must be multibase base58btc encoded (start with z)');
  });
  
  it('should throw an error if trying to resolve a did:key with an invalid public key encoding (e.g. wrong characters)', async () => {
    const invalidDidPublicKey = 'did:key:zInvalidKey!'; // '!' is not a valid base58btc char
    await expect(didService.resolveDidKey(invalidDidPublicKey)).rejects.toThrow('Invalid did:key: Failed to decode base58btc public key.');
  });

  it('should throw an error if trying to resolve a did:key with an incorrect multicodec prefix (e.g., valid base58 but not secp256k1)', async () => {
    // This key z6MkhaXgBZDvotDkL5257faizRxWRgSSzGvY is a valid Ed25519 did:key representation.
    // It will fail our secp256k1 multicodec check.
    const ed25519Key = 'did:key:z6MkhaXgBZDvotDkL5257faizRxWRgSSzGvY'; 
    await expect(didService.resolveDidKey(ed25519Key)).rejects.toThrow('Invalid did:key: Public key does not have a valid secp256k1 multicodec prefix.');
  });

  it('should throw an error if trying to resolve a did:key with a secp256k1 key of incorrect length (after multicodec)', async () => {
    // Construct a key that has the secp256k1 multicodec but wrong data length
    const correctHeader = new Uint8Array([0xe7, 0x01]);
    const shortKeyBytes = new Uint8Array(30); // Too short for a 33-byte compressed key
    const combined = new Uint8Array(correctHeader.length + shortKeyBytes.length);
    combined.set(correctHeader);
    combined.set(shortKeyBytes, correctHeader.length);
    const invalidLengthKey = `did:key:z${bs58.encode(combined)}`;
    await expect(didService.resolveDidKey(invalidLengthKey)).rejects.toThrow(/^Invalid did:key: Decoded public key length is incorrect for secp256k1/);
  });

  it('should throw an error if trying to resolve a did:key with a secp256k1 key with invalid compressed key prefix (0x04 etc.)', async () => {
    const correctHeader = new Uint8Array([0xe7, 0x01]);
    const invalidPrefixKeyBytes = new Uint8Array(33);
    invalidPrefixKeyBytes[0] = 0x04; // Invalid prefix for compressed key
    const combined = new Uint8Array(correctHeader.length + invalidPrefixKeyBytes.length);
    combined.set(correctHeader);
    combined.set(invalidPrefixKeyBytes, correctHeader.length);
    const invalidCompressedPrefixKey = `did:key:z${bs58.encode(combined)}`;
    await expect(didService.resolveDidKey(invalidCompressedPrefixKey)).rejects.toThrow('Invalid did:key: Compressed public key must start with 0x02 or 0x03.');
  });
});
