// tests/sdk-actual-loader.ts
import { jest } from '@jest/globals';
// This file's purpose is to import and re-export the actual Certificate from @bsv/sdk,
// bypassing Jest's automocking for this specific import when used by other test files.

jest.unmock('@bsv/sdk');



// Sdk will be a Promise that resolves to the module
const SdkPromise = import('@bsv/sdk'); // Dynamic import

let ActualSDKCertificate: any; // This might become less useful if always loaded async

export const loadActualCertificate = async () => {
  const Sdk = await SdkPromise;
  if (Sdk.Certificate) {
    ActualSDKCertificate = Sdk.Certificate;
  } else if (Sdk.default && Sdk.default.Certificate) {
    ActualSDKCertificate = Sdk.default.Certificate;
  } else {
    console.error('SDK Loader Error (dynamic import): Could not find actual Certificate in @bsv/sdk module.');
    const sdkModule = Sdk.default || Sdk;
    console.error('SDK Loader: Sdk keys:', Object.keys(sdkModule));
    throw new Error('Failed to load actual Certificate from @bsv/sdk in sdk-actual-loader.ts');
  }
  return ActualSDKCertificate;
};

// For direct usage if tests can handle async import of this loader's export
export const ActualSDKCertificatePromise = (async () => {
    const Sdk = await SdkPromise;
    if (Sdk.Certificate) return Sdk.Certificate;
    if (Sdk.default && Sdk.default.Certificate) return Sdk.default.Certificate;
    console.error('SDK Loader Error (ActualSDKCertificatePromise): Could not find actual Certificate in @bsv/sdk module.');
    const sdkModule = Sdk.default || Sdk;
    console.error('SDK Loader: Sdk keys (ActualSDKCertificatePromise):', Object.keys(sdkModule));
    throw new Error('Failed to load actual Certificate (Promise export)');
})();

// The original export { ActualSDKCertificate }; is removed as it would be undefined initially.
