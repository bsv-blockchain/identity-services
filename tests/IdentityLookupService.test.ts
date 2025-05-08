jest.mock('@bsv/sdk');

import { jest } from '@jest/globals'; // This import is for the test file's scope
import { Db, Collection, OptionalId, InsertOneOptions, InsertOneResult, Filter, DeleteOptions, DeleteResult, FindOptions, FindCursor, WithId, Document } from 'mongodb';
import { ObjectId } from 'bson'; // Import ObjectId
import createIdentityLookupService from '../backend/src/IdentityLookupServiceFactory.ts';
import { LookupQuestion } from '@bsv/overlay';
// Standard SDK imports (will be mapped to mock by Jest for runtime)
import { PushDrop, Script, Utils, VerifiableCertificate } from '@bsv/sdk'; 
// Direct import from mock file for test-specific instance control
import { mockCertificateInstance } from '../__mocks__/@bsv/sdk.ts';
import { IdentityRecord } from '../backend/src/types.ts';

// Tell Jest to use the manual mock for @bsv/overlay
jest.mock('@bsv/overlay', () => {
  return {
    LookupQuestion: jest.fn()
  };
});

describe('IdentityLookupService (via factory)', () => {
  let mockDb: Db
  let mockCollection: Partial<Collection<IdentityRecord>>
  let service: ReturnType<typeof createIdentityLookupService>

  beforeEach(() => {
    jest.clearAllMocks() // General mock clearing

    // Reverted mockClear calls as types are now 'any'
    // if (PushDrop && PushDrop.decode) {
    //   PushDrop.decode.mockClear(); 
    // }
    // if (VerifiableCertificate && VerifiableCertificate.prototype && VerifiableCertificate.prototype.decryptFields) {
    //   VerifiableCertificate.prototype.decryptFields.mockClear();
    // }

    // Mock MongoDB collection
    mockCollection = {
      insertOne: jest.fn<(doc: OptionalId<IdentityRecord>, options?: InsertOneOptions) => Promise<InsertOneResult<IdentityRecord>>>(), 
      deleteOne: jest.fn<(filter?: Filter<IdentityRecord>, options?: DeleteOptions) => Promise<DeleteResult>>(),
      createIndex: jest.fn<() => Promise<string>>().mockResolvedValue('mockIndexName'), 
      find: jest.fn<(filter?: Filter<IdentityRecord>) => FindCursor<WithId<IdentityRecord>>>().mockReturnValue({
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<WithId<IdentityRecord>[]>>().mockResolvedValue([]) 
      } as any) // Restore as any for the FindCursor mock object
    } 

    // Mock DB so that .collection() returns our mock collection
    mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection)
    } as unknown as Db

    // Create the IdentityLookupService via the factory function.
    service = createIdentityLookupService(mockDb)
  })

  describe('outputAdded', () => {
    it('should store a certificate when topic is "tm_identity" and decrypted fields are non-empty', async () => {
      const mockTxid = 'abc123'
      const mockIndex = 0
      const mockScript = {} as unknown as Script

      const certificateData = {
        type: 'testType',
        serialNumber: 'testSerial',
        subject: 'testSubject',
        certifier: 'testCertifier',
        revocationOutpoint: 'testRevOutpoint',
        fields: { dataField: 'dataValue' },
        keyring: { key: 'value' }
      };
      const certificateBuffer = Utils.toArray(JSON.stringify(certificateData)) as unknown as Buffer;
      const mockDecoded: { lockingPublicKey: object, fields: Buffer[] } = {
        lockingPublicKey: {}, // Mocked appropriately for the test's needs
        fields: [
          certificateBuffer
        ]
      };
      (PushDrop.decode as jest.Mock).mockReturnValue(mockDecoded);

      // Spy on VerifiableCertificate.prototype.decryptFields to simulate decryption.
      // Reassign mock directly with explicit typing to help with type inference issues
      mockCertificateInstance.decryptFields = jest.fn<(keyRing?: any) => Promise<Record<string, string>>>().mockResolvedValue({ attribute1: 'decryptedValue', attribute2: 'anotherValue' });

      // Setup mock for insertOne to resolve successfully for this specific test
      (mockCollection.insertOne! as jest.Mock).mockImplementation(() => Promise.resolve({ acknowledged: true, insertedId: new ObjectId() } as any)); // Use mockImplementation

      // Call the method under test using optional chaining as it's an optional method
      await service.outputAdded?.(mockTxid, mockIndex, mockScript, 'tm_identity');

      // @ts-ignore
      expect(mockCollection.insertOne! as jest.Mock).toHaveBeenCalledTimes(1);
      const insertedDoc = (mockCollection.insertOne! as jest.Mock).mock.calls[0][0] as IdentityRecord;
      expect(insertedDoc.txid).toBe(mockTxid);
      expect(insertedDoc.outputIndex).toBe(mockIndex);
      // Confirm the "searchableAttributes" includes the decrypted data.
      expect(insertedDoc.searchableAttributes).toContain('decryptedValue')
    })

    it('should ignore when topic is not "tm_identity"', async () => {
      const mockTxid = 'abc123'
      const mockIndex = 0
      const mockScript = {} as unknown as Script

      await service.outputAdded?.(mockTxid, mockIndex, mockScript, 'unrelated_topic')

      expect(PushDrop.decode).not.toHaveBeenCalled()
      expect(mockCollection.insertOne as jest.Mock).not.toHaveBeenCalled()
    })

    it('should throw an error if decrypted fields are empty', async () => {
      const mockTxid = 'abc123'
      const mockIndex = 0
      const mockScript = {} as unknown as Script

      const certificateDataForEmptyTest = {
        type: 'testTypeEmpty',
        serialNumber: 'testSerialEmpty',
        subject: 'testSubjectEmpty',
        certifier: 'testCertifierEmpty',
        revocationOutpoint: 'testRevOutpointEmpty',
        fields: { dataField: 'dataValueEmpty' },
        keyring: { key: 'valueEmpty' }
      };
      const certificateBufferForEmptyTest = Utils.toArray(JSON.stringify(certificateDataForEmptyTest)) as unknown as Buffer;
      const mockDecoded: { lockingPublicKey: object, fields: Buffer[] } = {
        lockingPublicKey: {},
        fields: [
          certificateBufferForEmptyTest
        ]
      };
      (PushDrop.decode as jest.Mock).mockReturnValue(mockDecoded);

      mockCertificateInstance.decryptFields = jest.fn<(keyRing?: any) => Promise<Record<string, any>>>().mockResolvedValue({});

      await expect(
        service.outputAdded?.(mockTxid, mockIndex, mockScript, 'tm_identity')
      ).rejects.toThrow('No publicly revealed attributes present!')

      expect(mockCollection.insertOne as jest.Mock).not.toHaveBeenCalled()
    })
  })

  describe('outputSpent', () => {
    it('should delete record if topic is "tm_identity"', async () => {
      const mockTxid = 'abc123'
      const mockIndex = 0

      await service.outputSpent?.(mockTxid, mockIndex, 'tm_identity')
      expect(mockCollection.deleteOne).toHaveBeenCalledWith({ txid: mockTxid, outputIndex: mockIndex })
    })

    it('should ignore if topic is not "tm_identity"', async () => {
      const mockTxid = 'abc123'
      const mockIndex = 0

      await service.outputSpent?.(mockTxid, mockIndex, 'different_topic')
      expect(mockCollection.deleteOne).not.toHaveBeenCalled()
    })
  })

  describe('outputDeleted', () => {
    it('should delete record if topic is "tm_identity"', async () => {
      const mockTxid = 'abc123'
      const mockIndex = 0

      await service.outputDeleted?.(mockTxid, mockIndex, 'tm_identity')
      expect(mockCollection.deleteOne).toHaveBeenCalledWith({ txid: mockTxid, outputIndex: mockIndex })
    })

    it('should ignore if topic is not "tm_identity"', async () => {
      const mockTxid = 'abc123'
      const mockIndex = 0

      await service.outputDeleted?.(mockTxid, mockIndex, 'other_topic')
      expect(mockCollection.deleteOne).not.toHaveBeenCalled()
    })
  })

  describe('lookup', () => {
    it('should throw an error if no query is provided', async () => {
      const question: LookupQuestion = {
        service: 'ls_identity',
        query: undefined
      } as unknown as LookupQuestion

      await expect(service.lookup(question)).rejects.toThrow('A valid query must be provided!')
    })

    it('should throw an error if service is not "ls_identity"', async () => {
      const question: LookupQuestion = {
        service: 'unsupported_service',
        query: {}
      }

      await expect(service.lookup(question)).rejects.toThrow('Lookup service not supported!')
    })

    it('should handle lookup by serialNumber', async () => {
      const question: LookupQuestion = {
        service: 'ls_identity',
        query: { serialNumber: 'someSerial' }
      };

      (mockCollection.find as jest.Mock).mockReturnValueOnce({
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<WithId<IdentityRecord>[]>>().mockImplementationOnce(() => Promise.resolve([{ txid: '123', outputIndex: 0 }] as unknown as WithId<IdentityRecord>[]))
      });

      const result = await service.lookup(question)
      expect(result).toEqual([{ txid: '123', outputIndex: 0 }])
      expect(mockCollection.find).toHaveBeenCalledWith({ 'certificate.serialNumber': 'someSerial' })
    })

    it('should handle lookup by attribute + certifiers', async () => {
      const question: LookupQuestion = {
        service: 'ls_identity',
        query: {
          attributes: { firstName: 'John' },
          certifiers: ['certA', 'certB']
        }
      };

      (mockCollection.find as jest.Mock).mockReturnValueOnce({
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<WithId<IdentityRecord>[]>>().mockImplementationOnce(() => Promise.resolve([] as unknown as WithId<IdentityRecord>[]))
      } as any);

      await service.lookup(question)
      expect(mockCollection.find).toHaveBeenCalledTimes(1)

      const callArg = (mockCollection.find as jest.Mock).mock.calls[0][0] as Filter<IdentityRecord>;
      expect(callArg.$and).toHaveLength(2)
      // $and[0] should be: { 'certificate.certifier': { $in: ['certA', 'certB'] } }
      // $and[1] should be a fuzzy search on the "firstName" attribute.
    })

    it('should handle lookup by identityKey + certificateTypes + certifiers', async () => {
      const question: LookupQuestion = {
        service: 'ls_identity',
        query: {
          identityKey: 'someIdentityKey',
          certificateTypes: ['typeA', 'typeB'],
          certifiers: ['certX']
        }
      };

      (mockCollection.find as jest.Mock).mockReturnValueOnce({
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<WithId<IdentityRecord>[]>>().mockImplementationOnce(() => Promise.resolve([] as unknown as WithId<IdentityRecord>[]))
      } as any);

      await service.lookup(question)
      expect(mockCollection.find).toHaveBeenCalledWith({
        'certificate.subject': 'someIdentityKey',
        'certificate.certifier': { $in: ['certX'] },
        'certificate.type': { $in: ['typeA', 'typeB'] }
      })
    })

    it('should handle lookup by identityKey + certifiers (no certificateTypes)', async () => {
      const question: LookupQuestion = {
        service: 'ls_identity',
        query: {
          identityKey: 'someIdentityKey',
          certifiers: ['certZ']
        }
      };

      (mockCollection.find as jest.Mock).mockReturnValueOnce({
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<WithId<IdentityRecord>[]>>().mockImplementationOnce(() => Promise.resolve([] as unknown as WithId<IdentityRecord>[]))
      } as any);

      await service.lookup(question)
      expect(mockCollection.find).toHaveBeenCalledWith({
        'certificate.subject': 'someIdentityKey',
        'certificate.certifier': { $in: ['certZ'] }
      })
    })

    it('should handle lookup by certifiers alone', async () => {
      const question: LookupQuestion = {
        service: 'ls_identity',
        query: {
          certifiers: ['certOnly']
        }
      };

      (mockCollection.find as jest.Mock).mockReturnValueOnce({
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<WithId<IdentityRecord>[]>>().mockImplementationOnce(() => Promise.resolve([] as unknown as WithId<IdentityRecord>[]))
      } as any);

      await service.lookup(question)
      expect(mockCollection.find).toHaveBeenCalledWith({
        'certificate.certifier': { $in: ['certOnly'] }
      })
    })

    it('should throw error if required params are missing', async () => {
      const question: LookupQuestion = {
        service: 'ls_identity',
        query: { invalidParam: 'test' } as any
      }

      await expect(service.lookup(question)).rejects.toThrow(
        'One of the following params is missing: attribute, identityKey, certifier, or certificateType'
      )
    })

    it('should return an empty array if no outputs are found matching the lookup criteria', async () => {
      // Mock find to return a cursor that resolves to an empty array
      (mockCollection.find as jest.Mock).mockReturnValueOnce({
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<WithId<IdentityRecord>[]>>().mockImplementationOnce(() => Promise.resolve([] as unknown as WithId<IdentityRecord>[]))
      } as any);

      const question: LookupQuestion = {
        service: 'ls_identity',
        query: {}
      };

      const result = await service.lookup(question)
      expect(result).toEqual([])
    })

    it('should return an array of matching outputs', async () => {
      // Mock find to return a cursor that resolves to the mock output
      (mockCollection.find as jest.Mock).mockReturnValueOnce({
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<WithId<IdentityRecord>[]>>().mockImplementationOnce(() => Promise.resolve([{ txid: '123', outputIndex: 0 }] as unknown as WithId<IdentityRecord>[]))
      } as any);

      const question: LookupQuestion = {
        service: 'ls_identity',
        query: {}
      };

      const result = await service.lookup(question);
      expect(result).toEqual([{ txid: '123', outputIndex: 0 }])
    })
  })

  describe('getDocumentation', () => {
    it('should return documentation string', async () => {
      const docs = await service.getDocumentation()
      expect(docs).toBe('Mocked Markdown Content')
    })
  })

  describe('getMetaData', () => {
    it('should return metadata object', async () => {
      const metadata = await service.getMetaData()
      expect(metadata.name).toBe('Identity Lookup Service')
      expect(metadata.shortDescription).toBe('Identity resolution made easy.')
    })
  })
})
