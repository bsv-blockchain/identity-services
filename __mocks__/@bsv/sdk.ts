// __mocks__/@bsv/sdk.ts
import { jest } from '@jest/globals';

// Define StoredCertificate interface locally for the mock's clarity
// This should match the one in your actual types.ts
interface StoredCertificate {
  type: string[];
  serialNumber: string;
  subject: any;
  certifier: any;
  validation?: {
    validFrom?: string;
    validUntil?: string;
  };
  fields?: Record<string, any>;
  signature?: string;
  revocationOutpoint?: string;
}


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

export const certificateStaticVerifyMock = jest.fn<(...args: any[]) => Promise<boolean>>(async () => {
  console.log('DEBUG_STATIC_VERIFY_MOCK: certificateStaticVerifyMock CALLED');
  return true;
});
export const mockVerify = certificateStaticVerifyMock; // Export for test access

export const mockInstanceVerifyForVerifiableCertificate = jest.fn(async (keyring?: any) => {
  console.log('DEBUG_VERIFY_MOCK: mockInstanceVerifyForVerifiableCertificate CALLED', { keyring });
  return true;
});

export const mockDecryptFieldsForVerifiableCertificate = jest.fn(async (_key?: any) => ({
  defaultInternalVCField: 'defaultInternalVCValue'
}));

// This is the primary mock for Certificate / VerifiableCertificate
export const Certificate = jest.fn().mockImplementation((...args: any[]) => {
  // Initialize fallback values
  let finalType: string[] = ['DefaultFallbackType'];
  let finalSerialNumber: string = 'defaultFallbackSerialNumber';
  let finalSubject: any = { commonName: 'DefaultFallbackSubject' };
  let finalIssuer: any = { commonName: 'DefaultFallbackIssuer' };
  let finalValidFrom: string | undefined = '1999-01-01T00:00:00Z';
  let finalValidUntil: string | undefined = '1999-01-02T00:00:00Z';
  let finalKeyring: any = undefined;
  let finalSignature: string | undefined = 'defaultFallbackSignature';
  let finalFields: Record<string, any> | undefined = { defaultFallbackField: 'value' };
  let finalRevocationOutpoint: string | undefined = 'defaultFallbackRevocation.0';

  // console.log('DEBUG_MOCK_CERT_CONSTRUCTOR: Called with args:', JSON.stringify(args));

  // Check for single StoredCertificate object argument
  if (args.length === 1 && args[0] && typeof args[0] === 'object' && 
      args[0].serialNumber !== undefined && typeof args[0].serialNumber === 'string' && 
      Array.isArray(args[0].type)) {
    
    const sc = args[0] as StoredCertificate;
    // console.log('DEBUG_MOCK_CERT_CONSTRUCTOR: Detected single StoredCertificate object argument.');
    finalType = sc.type;
    finalSerialNumber = sc.serialNumber;
    finalSubject = sc.subject;
    finalIssuer = sc.certifier; 
    finalValidFrom = sc.validation?.validFrom;
    finalValidUntil = sc.validation?.validUntil;
    finalSignature = sc.signature;
    finalFields = sc.fields;
    finalRevocationOutpoint = sc.revocationOutpoint;

  // Check for multi-argument constructor style (type, serialNumber, subject, issuer, revocationOutpoint, fields, signature)
  // Order based on usage in IdentityStorageManager.findRecordsByCertifiers
  } else if (args.length >= 4) { // Minimum: type, serialNumber, subject, issuer
    // console.log('DEBUG_MOCK_CERT_CONSTRUCTOR: Detected multi-argument constructor style.');
    
    if (typeof args[0] === 'string') { // Type argument
      finalType = [args[0]]; 
    } else if (Array.isArray(args[0])) {
      finalType = args[0];
    } // Else: Type has unexpected format, uses fallback

    if (typeof args[1] === 'string') { // serialNumber argument
      finalSerialNumber = args[1];
    } // Else: SerialNumber not a string, uses fallback
    
    finalSubject = args[2]; // subject argument
    finalIssuer = args[3];  // issuer (certifier) argument
    
    // Optional arguments based on usage: revocationOutpoint, fields, signature
    finalRevocationOutpoint = (args.length > 4 && args[4] !== undefined) ? args[4] : undefined;
    finalFields = (args.length > 5 && args[5] !== undefined) ? args[5] : {}; 
    if (args.length > 5 && args[5] !== undefined) finalFields = args[5];
    finalSignature = (args.length > 6 && args[6] !== undefined) ? args[6] : undefined;
    
  } else {
    // console.log('DEBUG_MOCK_CERT_CONSTRUCTOR: Constructor arguments not recognized, using fallbacks. Args:', JSON.stringify(args));
  }

  return {
    type: finalType,
    serialNumber: finalSerialNumber,
    subject: finalSubject,
    issuer: finalIssuer,
    validFrom: finalValidFrom,
    validUntil: finalValidUntil,
    keyring: finalKeyring, 
    signature: finalSignature,
    fields: finalFields,
    revocationOutpoint: finalRevocationOutpoint,
    verify: mockInstanceVerifyForVerifiableCertificate, // CRITICAL for verifyOutputCertification tests
    decryptFields: mockDecryptFieldsForVerifiableCertificate, 
    getField: jest.fn((fieldName: string) => { 
      if (finalFields && typeof finalFields === 'object' && fieldName in finalFields) {
        return finalFields[fieldName];
      }
      // Return a consistent mock value if field not found, or undefined
      return undefined; // Or `mockFieldValueFor_${fieldName}` if that's preferred test behavior
    }),
    encode: jest.fn(() => 'encodedMockVCInstanceData'), 
    getAttributes: jest.fn(() => finalFields), // Ensure this is present
  };
}); // Correct closing for Certificate mockImplementation

// Assign static verify method to the Certificate mock itself
(Certificate as any).verify = certificateStaticVerifyMock;

// Mock for Transaction
export const Transaction = jest.fn().mockImplementation(() => ({
  id: 'mockTxId1234567890abcdef',
  inputs: [],
  outputs: [],
  addInput: jest.fn(),
  addOutput: jest.fn(),
  sign: jest.fn().mockReturnThis(), // Or mockResolvedValue(true) if it's async
  serialize: jest.fn(() => 'mockSerializedTxHex'),
  fee: 1000, // Example property
  isFullySigned: jest.fn(() => true)
}));

// Alias VerifiableCertificate to Certificate for compatibility if tests use it
export const VerifiableCertificate = Certificate;

// Mock for PushDrop (if it's used in the code under test directly or indirectly)
export const PushDrop = {
  decode: jest.fn((script: any) => {
    // This is a basic mock. If your tests depend on specific PushDrop behavior,
    // you might need to make this more sophisticated.
    if (script && typeof script.toString === 'function' && script.toString('hex') === 'INVALID_EMPTY_SCRIPT_HEX_FOR_TEST') {
      return { fields: [] }; // Simulate empty fields for a specific invalid script
    }
    return {
      fields: [
        Buffer.from('mock_field1_data_from_pushdrop'),
        Buffer.from('mock_field2_data_from_pushdrop')
      ],
      lockingScript: { toHex: () => 'mockLockingScriptHexFromPushDrop' },
      unlockingScript: { toHex: () => 'mockUnlockingScriptHexFromPushDrop' }
    };
  })
};

export const toBase58 = jest.fn((data: Uint8Array): string => {
  let str = 'z'; // Start with 'z' to ensure it's a valid base58 char if data is empty or short
  for (let i = 0; i < Math.min(data.length, 10); i++) { // Limit length for simplicity
    str += String.fromCharCode(65 + (data[i] % 26)); // Mock simple encoding
  }
  return str;
});

export const fromBase58 = jest.fn((str: string): Uint8Array => {
  const arr = new Uint8Array(Math.max(0, str.length - 1)); // Handle empty string case for str.length-1
  for (let i = 1; i < str.length; i++) { // Start from 1 if 'z' prefix is assumed
    arr[i-1] = (str.charCodeAt(i) - 65 + 256) % 256; // Ensure positive result before modulo
  }
  return arr;
});

export const __esModule = true; // CommonJS/ESM interop hint for Jest