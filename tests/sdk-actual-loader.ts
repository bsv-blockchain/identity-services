// tests/sdk-actual-loader.ts
// This file's purpose is to import and re-export the actual Certificate from @bsv/sdk,
// bypassing Jest's automocking for this specific import when used by other test files.

declare var jest: any; // Add this declaration for jest.requireActual

const Sdk = jest.requireActual('@bsv/sdk');

let ActualSDKCertificate: any;

if (Sdk.Certificate) {
  ActualSDKCertificate = Sdk.Certificate;
} else if (Sdk.default && Sdk.default.Certificate) {
  ActualSDKCertificate = Sdk.default.Certificate;
} else {
  console.error('SDK Loader Error (using jest.requireActual): Could not find actual Certificate in @bsv/sdk module.');
  console.error('SDK Loader: Sdk keys:', Object.keys(Sdk || {}));
  if (Sdk && Sdk.default) {
    console.error('SDK Loader: Sdk.default keys:', Object.keys(Sdk.default || {}));
  }
  throw new Error('Failed to load actual Certificate from @bsv/sdk in sdk-actual-loader.ts using jest.requireActual');
}

export { ActualSDKCertificate };
