// /Users/jake/Desktop/identity-services/__mocks__/@bsv/sdk.ts
import { jest } from '@jest/globals'; // For jest.fn()

// --- Renaming original exports to avoid conflicts before default export ---

// PublicKey
const mockPublicKeyInstance_local = {
  toHex: jest.fn(() => '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'),
  toBytes: jest.fn(() => {
    const bytes = new Uint8Array(33);
    bytes[0] = 0x02;
    for (let i = 1; i < 33; i++) bytes[i] = (i * 5) % 256;
    return bytes;
  }),
  encode: jest.fn((_compressed?: boolean) => {
    const mockEncodedBytes = new Uint8Array(33);
    mockEncodedBytes[0] = _compressed ? 0x02 : 0x04;
    for (let i = 1; i < 33; i++) mockEncodedBytes[i] = (i * 7) % 256;
    return mockEncodedBytes;
  })
};
const PublicKey_local = {
  fromHex: jest.fn((_hex: string) => mockPublicKeyInstance_local),
};

// PrivateKey
const mockPrivateKeyInstance_local = {
  toHex: jest.fn(() => 'a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8'),
  toPublicKey: jest.fn(() => mockPublicKeyInstance_local),
};
const PrivateKey_local = {
  fromRandom: jest.fn(() => mockPrivateKeyInstance_local),
  fromHex: jest.fn((_hex: string) => mockPrivateKeyInstance_local),
};

// Transaction Parts
const mockUnlockingScript_local = { toHex: jest.fn(() => 'mockUnlockingScriptHex') };
const mockLockingScript_local = { toHex: jest.fn(() => 'mockLockingScriptHex') };

const mockTransactionInstance_local = {
  inputs: [
    { unlockingScript: mockUnlockingScript_local, sourceTXID: 'mockSourceTxidInput1', sourceOutputIndex: 0, sequence: 1 }
  ],
  outputs: [
    { lockingScript: mockLockingScript_local, satoshis: 1000 }
  ],
  toHex: jest.fn(() => 'mockTransactionHex12345'),
};
const Transaction_local = {
  fromHex: jest.fn((_hex: string) => mockTransactionInstance_local),
};

const mockDecryptedFields_local = { attribute1: 'value1', attribute2: 'value2' };

const mockCertificateInstance_local = {
  type: 'MockCertType',
  serialNumber: 'MockSN123',
  subject: 'mockSubjectXYZ',
  certifier: 'mockCertifierABC',
  revocationOutpoint: 'mockRevOutpoint0123',
  fields: { initialField: 'initialValue' },
  keyring: { someKey: 'someValue' },
  decryptFields: jest.fn<(keyRing?: any) => Promise<Record<string, string>>>(async (keyRing?: any) => mockDecryptedFields_local),
};

const mockVerify_local = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);

const VerifiableCertificate_local = jest.fn((_type, _serial, _subject, _certifier, _revocation, _fields, _keyring) => ({
  ...mockCertificateInstance_local,
  verify: mockVerify_local,
  type: _type || mockCertificateInstance_local.type,
  serialNumber: _serial || mockCertificateInstance_local.serialNumber,
  subject: _subject || mockCertificateInstance_local.subject,
  certifier: _certifier || mockCertificateInstance_local.certifier,
  revocationOutpoint: _revocation || mockCertificateInstance_local.revocationOutpoint,
  fields: _fields || mockCertificateInstance_local.fields,
  keyring: _keyring || mockCertificateInstance_local.keyring
}));

const Certificate_local = jest.fn().mockImplementation((payload, type, serialNumber, subject, certifier, revocationOutpoint, fields, signature) => {
  const instance = {
    ...mockCertificateInstance_local, 
    type: type !== undefined ? type : mockCertificateInstance_local.type,
    serialNumber: serialNumber !== undefined ? serialNumber : mockCertificateInstance_local.serialNumber,
    subject: subject !== undefined ? subject : mockCertificateInstance_local.subject,
    certifier: certifier !== undefined ? certifier : mockCertificateInstance_local.certifier,
    revocationOutpoint: revocationOutpoint !== undefined ? revocationOutpoint : mockCertificateInstance_local.revocationOutpoint,
    signature: signature,
    fields: fields !== undefined ? fields : mockCertificateInstance_local.fields,
    verify: mockVerify_local
  };
  return instance;
});

const PushDrop_local = {
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

const ProtoWallet_local = jest.fn((_seedOrKey: any) => ({
}));

const Utils_local = {
  toUTF8: jest.fn((bytes: Uint8Array | Buffer) => Buffer.from(bytes).toString('utf8')),
  toArray: jest.fn((data: any): Buffer => { 
    if (typeof data === 'string') {
      return Buffer.from(data); 
    }
    return Buffer.from(JSON.stringify(data));
  })
};

const Script_local = {
  fromHex: jest.fn((hex: string) => ({ 
    toHex: jest.fn(() => hex), 
  })),
};

// Default export containing all mocked entities
export default {
  PublicKey: PublicKey_local,
  PrivateKey: PrivateKey_local,
  Transaction: Transaction_local,
  mockCertificateInstance: mockCertificateInstance_local, 
  VerifiableCertificate: VerifiableCertificate_local,
  Certificate: Certificate_local,
  mockVerify: mockVerify_local, 
  PushDrop: PushDrop_local,
  ProtoWallet: ProtoWallet_local,
  Utils: Utils_local,
  Script: Script_local,
};

export const __esModule = true; // Crucial for ESM mocks
