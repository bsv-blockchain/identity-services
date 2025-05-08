// /Users/jake/Desktop/identity-services/__mocks__/@bsv/sdk.ts
import { jest } from '@jest/globals'; // For jest.fn()

// --- Mocked instances and classes ---

// PublicKey
const mockPublicKeyInstance = {
  toHex: jest.fn(() => '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'), // A valid compressed pubkey hex
  toBytes: jest.fn(() => {
    const bytes = new Uint8Array(33);
    bytes[0] = 0x02; // Valid prefix for compressed keys
    for (let i = 1; i < 33; i++) bytes[i] = (i * 5) % 256; // Fill with some deterministic data
    return bytes;
  }),
  encode: jest.fn((_compressed?: boolean) => { // Added for DIDService
    // Return a Uint8Array or number[] as publicKeyInstance.encode(true) is used with Uint8Array.from()
    const mockEncodedBytes = new Uint8Array(33);
    mockEncodedBytes[0] = _compressed ? 0x02 : 0x04; // Example prefix
    for (let i = 1; i < 33; i++) mockEncodedBytes[i] = (i * 7) % 256; // Fill with some deterministic data
    return mockEncodedBytes;
  })
};
export const PublicKey = {
  fromHex: jest.fn((_hex: string) => mockPublicKeyInstance),
};

// PrivateKey
const mockPrivateKeyInstance = {
  toHex: jest.fn(() => 'a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8'), // Valid 64-char hex
  toPublicKey: jest.fn(() => mockPublicKeyInstance),
};
export const PrivateKey = {
  fromRandom: jest.fn(() => mockPrivateKeyInstance),
  fromHex: jest.fn((_hex: string) => mockPrivateKeyInstance),
};

// Transaction Parts
const mockUnlockingScript = { toHex: jest.fn(() => 'mockUnlockingScriptHex') };
const mockLockingScript = { toHex: jest.fn(() => 'mockLockingScriptHex') };

const mockTransactionInstance = {
  inputs: [
    { unlockingScript: mockUnlockingScript, sourceTXID: 'mockSourceTxidInput1', sourceOutputIndex: 0, sequence: 1 }
  ],
  outputs: [
    { lockingScript: mockLockingScript, satoshis: 1000 }
  ],
  toHex: jest.fn(() => 'mockTransactionHex12345'),
};
export const Transaction = {
  fromHex: jest.fn((_hex: string) => mockTransactionInstance),
};

// VerifiableCertificate (for IdentityLookupService)
const mockDecryptedFields = { attribute1: 'value1', attribute2: 'value2' };

// Export this instance so tests can directly manipulate its jest.fn() methods
export const mockCertificateInstance = {
  type: 'MockCertType',
  serialNumber: 'MockSN123',
  subject: 'mockSubjectXYZ',
  certifier: 'mockCertifierABC',
  revocationOutpoint: 'mockRevOutpoint0123',
  fields: { initialField: 'initialValue' },
  keyring: { someKey: 'someValue' },
  decryptFields: jest.fn<(keyRing?: any) => Promise<Record<string, string>>>(async (keyRing?: any) => mockDecryptedFields),
  verify: jest.fn().mockResolvedValue(true) // Added verify mock
};
// This mocks the VerifiableCertificate constructor
export const VerifiableCertificate = jest.fn((_type, _serial, _subject, _certifier, _revocation, _fields, _keyring) => mockCertificateInstance);

// Alias Certificate to VerifiableCertificate for IdentityStorageManager compatibility
export const Certificate = jest.fn().mockImplementation((payload, type, serialNumber, subject, certifier, revocationOutpoint, fields, signature) => {
  // Return a new object that merges mockCertificateInstance with any provided fields,
  // ensuring the fields passed to the constructor override the defaults.
  const instance = {
    ...mockCertificateInstance, // Spread default values first
    // Use provided values, falling back to defaults from mockCertificateInstance if necessary.
    // The 'payload' is part of the SDKCertificate constructor but not typically stored as a top-level property named 'payload' on the instance itself in the same way.
    // It's used internally or to derive other properties. We won't explicitly store 'payload' here unless the actual SDK does.
    type: type !== undefined ? type : mockCertificateInstance.type,
    serialNumber: serialNumber !== undefined ? serialNumber : mockCertificateInstance.serialNumber,
    subject: subject !== undefined ? subject : mockCertificateInstance.subject,
    certifier: certifier !== undefined ? certifier : mockCertificateInstance.certifier,
    revocationOutpoint: revocationOutpoint !== undefined ? revocationOutpoint : mockCertificateInstance.revocationOutpoint,
    // Use the provided signature directly
    signature: signature,
    // Explicitly handle fields: use provided `fields` if they exist, otherwise default.
    fields: fields !== undefined ? fields : mockCertificateInstance.fields
  };
  return instance;
});

// PushDrop (for IdentityLookupService)
export const PushDrop = {
  decode: jest.fn((_script: any) => ({
    fields: [ Buffer.from(JSON.stringify({
      type: 'PushDropCertType',
      serialNumber: 'PD_SN789',
      subject: 'pdSubject456',
      certifier: 'pdCertifier789',
      revocationOutpoint: 'pdRevOut456',
      fields: { pdField1: 'pdValue1' },
      keyring: { pdKey: 'pdVal'}
    })) ]
  })),
};

// ProtoWallet (for IdentityLookupService)
export const ProtoWallet = jest.fn((_seedOrKey: any) => ({
  // Mock any instance methods if used, for now constructor is enough
}));

// Utils (for IdentityLookupService - toUTF8)
export const Utils = {
  toUTF8: jest.fn((bytes: Uint8Array | Buffer) => Buffer.from(bytes).toString('utf8')),
  toArray: jest.fn((data: any): Buffer => { 
    if (typeof data === 'string') {
      return Buffer.from(data); 
    }
    return Buffer.from(JSON.stringify(data));
  })
};

// Script
export const Script = {
  fromHex: jest.fn((hex: string) => ({ 
    toHex: jest.fn(() => hex), 
    // Add other Script instance methods if used
  })),
};

export const __esModule = true; // Crucial for ESM mocks
