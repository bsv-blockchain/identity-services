// /Users/jake/Desktop/quarkID/identity-services/__mocks__/@bsv/sdk.ts
import { jest } from '@jest/globals'; // Import the full 'jest' object

const mockPublicKeyInstance = {
  toHex: jest.fn(() => '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'),
  encode: jest.fn((compressed?: boolean) => {
    const bytes = new Uint8Array(compressed ?? true ? 33 : 65);
    bytes[0] = compressed ?? true ? 0x02 : 0x04;
    for (let i = 1; i < bytes.length; i++) bytes[i] = (i * 7) % 256;
    return bytes;
  }),
  toBytes: jest.fn(() => {
    const bytes = new Uint8Array(33);
    bytes[0] = 0x02;
    for (let i = 1; i < 33; i++) bytes[i] = (i * 5) % 256;
    return bytes;
  }),
};

const mockPrivateKeyInstance = {
  toHex: jest.fn(() => 'mockPrivateKeyHex1234567890abcdef1234567890abcdef1234567890abcdef'),
  toPublicKey: jest.fn(() => mockPublicKeyInstance),
};

export const PublicKey = {
  fromString: jest.fn((_str: string) => mockPublicKeyInstance),
  fromHex: jest.fn((_hex: string) => mockPublicKeyInstance),
};

export const PrivateKey = {
  fromRandom: jest.fn((_hex: string) => mockPrivateKeyInstance), 
  fromHex: jest.fn((_hex: string) => mockPrivateKeyInstance),
};

const certificateStaticVerifyMock = jest.fn((/* params certificate.verify might take */) => true); 

export const Certificate = jest.fn().mockImplementation(
  (type?: string[] | string, serialNumber?: string, subject?: any, issuer?: any, validFrom?: string, validUntil?: string, keyring?: any, signature?: string) => {
    let actualType: string[];
    if (Array.isArray(type)) {
      actualType = type;
    } else if (typeof type === 'string') {
      actualType = [type];
    } else {
      actualType = ['VerifiableCredential']; // Default type
    }

    return {
      type: actualType,
      serialNumber: serialNumber || 'mockCertSerialDefaultWhenArgUndefined', // More specific default
      subject: subject || { commonName: 'mockCertSubjectDefault' },
      issuer: issuer || { commonName: 'mockCertIssuerDefault' },
      validFrom: validFrom || '2024-01-01T00:00:00Z',
      validUntil: validUntil || '2025-01-01T00:00:00Z',
      keyring: keyring || { getSigningPublicKey: () => 'mockSigningPublicKey' },
      signature: signature || 'mockDigitalSignature123',
      verify: jest.fn(() => true),
      decryptFields: jest.fn(async (_key?: any) => ({ mockFieldFromCert: 'mockValueFromCert' })),
      getField: jest.fn((fieldName: string) => `mockFieldValue_${fieldName}_FromCert`),
      encode: jest.fn(() => 'encodedMockCertData')
    };
  }
);

(Certificate as any).verify = certificateStaticVerifyMock; // Static verify method
export const mockVerify = certificateStaticVerifyMock; // Export the static verify mock

export const PushDrop = {
  decode: jest.fn((script: any) => {
    if (script && typeof script.toString === 'function' && script.toString('hex') === 'INVALID_EMPTY_SCRIPT_HEX_FOR_TEST') {
      return { fields: []  };
    }
    return {
      fields: [Buffer.from(JSON.stringify({ 
        type: ['VerifiableCredential', 'BirthCertificate'],
        serialNumber: 'SERIAL12345',
        subject: { name: 'Mock Subject' },
        issuer: { name: 'Mock Issuer' },
        validFrom: '2023-01-01',
        validUntil: '2028-01-01',
        customField: 'CustomValue123'
      }))]
    };
  })
};

// Define the shape of the instance Script creates
type MockScriptInstance = {
  toHex: jest.Mock<() => "INVALID_EMPTY_SCRIPT_HEX_FOR_TEST" | "mockScriptHex">;
  toString: jest.Mock<(format?: "hex" | "asm") => string>;
};

// Define the type of the Script constructor
type ScriptConstructorMock = new (asm?: string) => MockScriptInstance;

// Define the actual implementation for the constructor logic
const scriptConstructorLogic = (asm?: string): MockScriptInstance => {
  return {
    toHex: jest.fn(() => asm === '' ? 'INVALID_EMPTY_SCRIPT_HEX_FOR_TEST' : 'mockScriptHex'),
    toString: jest.fn((format?: 'hex' | 'asm') => {
      if (format === 'hex') {
        return asm === '' ? 'INVALID_EMPTY_SCRIPT_HEX_FOR_TEST' : 'mockScriptHex';
      }
      return asm || 'MOCK_ASM_SCRIPT';
    }),
  };
};

export const Script = jest.fn(scriptConstructorLogic) as unknown as ScriptConstructorMock;

export const Signature = {
  fromDER: jest.fn(() => ({ toDER: () => 'mockDERString' })),
  fromRS: jest.fn(() => ({ toDER: () => 'mockDERString' }))
};

// Mock for Transaction instance methods
const mockTransactionInstance = {
  sign: jest.fn(() => Promise.resolve(mockTransactionInstance)), // Often returns itself or void
  toHex: jest.fn(() => 'mockTransactionHex_010203abcdef'),
  broadcast: jest.fn(() => Promise.resolve({ txid: 'mocktxid123abc', status: 'success' })),
  // Add other instance methods if needed, e.g.:
  // addInput: jest.fn(() => mockTransactionInstance),
  // addOutput: jest.fn(() => mockTransactionInstance),
  // verify: jest.fn(() => true),
  // fee: jest.fn(() => 1000),
  // id: 'mockTxIdInstance',
};

// An instance of a mock certificate, for tests that need to import a ready-made instance
export const mockCertificateInstance = {
  type: ['VerifiableCredential', 'MockInstanceCredential'],
  serialNumber: 'mockInstanceSerial123',
  subject: { commonName: 'Mock Instance Subject' },
  issuer: { commonName: 'Mock Instance Issuer' }, // 'certifier' in some contexts might map to 'issuer'
  validFrom: '2024-01-01T00:00:00Z',
  validUntil: '2025-01-01T00:00:00Z',
  keyring: { getSigningPublicKey: () => 'mockInstanceSigningPublicKey' },
  signature: 'mockInstanceDigitalSignature123',
  verify: jest.fn(() => true), // Instance verify method
  decryptFields: jest.fn(async (_key?: any) => ({ // Make _key optional to align with test usage
    defaultDecryptedField: 'defaultDecryptedValue',
    // This will often be overridden in tests, but a default mock is good.
  })),
  getField: jest.fn((fieldName: string) => `mockInstanceFieldValue_${fieldName}`),
  encode: jest.fn(() => 'encodedMockCertificateInstanceData'),
  // Add any other methods if tests show they are needed on this specific instance
};

// Mock for Transaction static methods (and potentially constructor if used with `new`)
export const Transaction = {
  fromHex: jest.fn((_hex: string) => mockTransactionInstance),
  // If Transaction is instantiated with `new Transaction()`, you might need:
  // new: jest.fn(() => mockTransactionInstance) and then adjust the export like other constructors.
  // For now, assuming static fromHex is the primary usage.
};

export const Utils = {
  someUtilityFunction: jest.fn(() => 'mockedUtilValue'),
  toArray: jest.fn((str: string): Uint8Array => {
    const arr = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      arr[i] = str.charCodeAt(i);
    }
    return arr;
  }),
  toUTF8: jest.fn((bytes: Uint8Array | Buffer | number[]): string => {
    if (!bytes || bytes.length === 0) return '';
    let result = '';
    const byteArray = bytes instanceof Uint8Array || Buffer.isBuffer(bytes) ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < byteArray.length; i++) {
      result += String.fromCharCode(byteArray[i]);
    }
    return result;
  }),
};

export const ProtoWallet = jest.fn().mockImplementation((config) => {
  return {
    config: config,
  };
});

// New exportable mock for VerifiableCertificate's decryptFields
export const mockDecryptFieldsForVerifiableCertificate = jest.fn(async (_key?: any) => ({
  defaultInternalVCField: 'defaultInternalVCValue' // A distinct default
}));

export const VerifiableCertificate = jest.fn().mockImplementation((type, serialNumber, subject, issuer, validFrom, validUntil, keyring, signature) => {
  return {
    type: type || ['VerifiableCredential', 'CustomTestCredential'],
    serialNumber: serialNumber || 'mockVCSerialNumber123',
    subject: subject || { commonName: 'Mock Subject Common Name' },
    issuer: issuer || { commonName: 'Mock Issuer Common Name' },
    validFrom: validFrom || '2024-01-01T00:00:00Z',
    validUntil: validUntil || '2025-01-01T00:00:00Z',
    keyring: keyring || { getSigningPublicKey: () => 'mockSigningPublicKey' },
    signature: signature || 'mockDigitalSignature123',
    verify: jest.fn(() => true), 
    decryptFields: mockDecryptFieldsForVerifiableCertificate, // Use the new exportable mock
    getField: jest.fn((fieldName) => {
      if (fieldName === 'customField') return 'mockCustomFieldValue';
      return 'defaultMockFieldValue';
    }),
    encode: jest.fn(() => 'encodedMockVCInstanceData')
  };
});

export const toBase58 = jest.fn((data: Uint8Array): string => {
  let str = 'z';
  for (let i = 0; i < Math.min(data.length, 10); i++) {
    str += String.fromCharCode(65 + (data[i] % 26));
  }
  return str;
});

export const fromBase58 = jest.fn((str: string): Uint8Array => {
  const arr = new Uint8Array(str.length -1);
  for (let i = 1; i < str.length; i++) {
    arr[i-1] = str.charCodeAt(i) - 65;
  }
  return arr;
});

export const __esModule = true;