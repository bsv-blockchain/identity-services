import { Base64String, Certificate as SDKCertificate, PubKeyHex } from '@bsv/sdk'
import { ObjectId } from 'mongodb';

export interface UTXOReference {
  txid: string
  outputIndex: number
}

export interface IdentityAttributes {
  [key: string]: string
}

// New interface for storing certificates with W3C compliant type array
export interface StoredCertificate {
  type: string[]; // W3C compliant type array, e.g., ["VerifiableCredential", "BRC52IdentityCertificate"]
  serialNumber: string; // Assuming string based on mock, adjust if SDK uses Base64String
  subject: string; // Assuming string based on mock, adjust if SDK uses PubKeyHex
  certifier: string; // Assuming string based on mock, adjust if SDK uses PubKeyHex
  revocationOutpoint: string; // Assuming string based on mock
  fields: Record<string, any>; // General object for fields
  keyring?: Record<string, any>; // Optional, based on mock structure
  // Consider adding 'signature' if it's stored as part of the certificate object itself
  // For now, aligning with mockCertificateInstance properties
}

export interface IdentityRecord {
  _id?: ObjectId;
  txid: string
  outputIndex: number
  certificate: StoredCertificate; // Use the new StoredCertificate type
  createdAt: Date
  searchableAttributes?: string
}

export interface IdentityQuery {
  attributes?: IdentityAttributes
  certifiers?: PubKeyHex[]
  identityKey?: PubKeyHex
  certificateTypes?: Base64String[]
  serialNumber?: Base64String
}

// W3C DID Related Types

/**
 * Represents a W3C Verification Method.
 * @see https://www.w3.org/TR/did-core/#verification-methods
 */
export interface VerificationMethod {
  id: string; // DID URL, e.g., did:example:123#key-1
  type: string; // e.g., 'JsonWebKey2020', 'Ed25519VerificationKey2020', 'EcdsaSecp256k1VerificationKey2018'
  controller: string; // DID that controls this verification method
  publicKeyJwk?: Record<string, unknown>; // Public key in JWK format
  publicKeyMultibase?: string; // Public key in multibase format
}

/**
 * Represents a W3C DID Document.
 * @see https://www.w3.org/TR/did-core/#did-documents
 */
export interface DidDocument {
  '@context': string | string[];
  id: string; // The DID itself
  verificationMethod?: VerificationMethod[];
  authentication?: (string | VerificationMethod)[]; // DID URL string or embedded VerificationMethod
  assertionMethod?: (string | VerificationMethod)[];
  keyAgreement?: (string | VerificationMethod)[];
  capabilityInvocation?: (string | VerificationMethod)[];
  capabilityDelegation?: (string | VerificationMethod)[];
  service?: ServiceEndpoint[];
}

/**
 * Represents a W3C Service Endpoint in a DID Document.
 * @see https://www.w3.org/TR/did-core/#services
 */
export interface ServiceEndpoint {
  id: string; // DID URL, e.g., did:example:123#service-1
  type: string; // Type of the service
  serviceEndpoint: string | Record<string, unknown> | Array<string | Record<string, unknown>>;
  description?: string;
}
