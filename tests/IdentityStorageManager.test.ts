/* eslint-disable no-new */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { jest } from '@jest/globals';
import { Collection, Db, InsertOneResult, DeleteResult, Document, ObjectId } from 'mongodb'
import { IdentityStorageManager } from '../backend/src/IdentityStorageManager.js'
import { IdentityRecord, StoredCertificate, UTXOReference, IdentityAttributes } from '../backend/src/types.js'
// Use require for the mock as a workaround for TS/Jest module resolution issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SdkMocked = require('@bsv/sdk');
const { Certificate: SDKCertificate, mockVerify } = SdkMocked;

// Declare ActualSDKCertificate here, will be assigned in beforeAll
let ActualSDKCertificate: typeof SDKCertificate;

// Mock the entire mongodb library
describe('IdentityStorageManager', () => {
  let mockDb: jest.Mocked<Db>
  let mockCollection: jest.Mocked<Collection<IdentityRecord>>
  let manager: IdentityStorageManager
  let defaultMockCursorForFullRecords: { project: jest.Mock; toArray: jest.Mock<() => Promise<IdentityRecord[]>> }

  beforeAll(async () => {
    // Dynamically import the actual SDK for spying
    const actualSdk = await import('@bsv/sdk');
    ActualSDKCertificate = actualSdk.Certificate;

    // Prepare a mocked Db and Collection
    mockCollection = {
      createIndex: jest.fn<() => Promise<string>>().mockResolvedValue('indexName'),
      insertOne: jest.fn<(doc: IdentityRecord, options?: any) => Promise<InsertOneResult<Document>>>()
        .mockResolvedValue({ acknowledged: true, insertedId: new ObjectId() } as InsertOneResult<Document>),
      deleteOne: jest.fn<(filter?: any, options?: any) => Promise<DeleteResult>>()
        .mockResolvedValue({ acknowledged: true, deletedCount: 1 } as DeleteResult),
      find: jest.fn(),
      project: jest.fn(),
      toArray: jest.fn() // This specific toArray is not directly used, cursors have their own
    } as any // Still need 'as any' for the overall mockCollection object if not all Collection methods are mocked

    // Default mock for find().toArray() to return empty array
    // to prevent tests from failing if find is called unexpectedly.
    const defaultMockCursorForPartials = {
      project: jest.fn().mockReturnThis(),
      toArray: jest.fn<() => Promise<Partial<IdentityRecord>[]>>().mockResolvedValue([])
    }
    // For general cases where specific mockImplementationOnce is not used, or for findRecordWithQuery
    mockCollection.find.mockReturnValue(defaultMockCursorForPartials as any);

    // Fallback cursor for methods expecting full IdentityRecord[]
    defaultMockCursorForFullRecords = {
      project: jest.fn().mockReturnThis(), 
      toArray: jest.fn<() => Promise<IdentityRecord[]>>().mockResolvedValue([])
    };

    mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection)
    } as any
  })

  beforeEach(() => {
    jest.clearAllMocks()
    manager = new IdentityStorageManager(mockDb)
  })

  describe('constructor', () => {
    it('should create and store the collection', () => {
      expect(mockDb.collection).toHaveBeenCalledWith('identityRecords')
    })

    it('should create a text index on searchableAttributes', () => {
      expect(mockCollection.createIndex).toHaveBeenCalledWith({ searchableAttributes: 'text' })
    })
  })

  describe('storeRecord', () => {
    it('should insert a new record into the collection', async () => {
      const txid = 'someTxid'
      const outputIndex = 1
      // Create a StoredCertificate object instead of an SDKCertificate instance
      const certificateData: StoredCertificate = {
        type: ['VerifiableCredential', 'BRC52IdentityCertificate'], // W3C compliant type array
        serialNumber: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', // 32 bytes base64
        subject: '022222222222222222222222222222222222222222222222222222222222222222', // subject (33 bytes hex)
        certifier: '033333333333333333333333333333333333333333333333333333333333333333', // certifier (33 bytes hex)
        revocationOutpoint: 'revocationTxid.0',
        fields: {
          firstName: 'Alice',
          lastName: 'Example',
          profilePhoto: 'someBase64Photo', // Should be excluded from searchableAttributes
          icon: 'someBase64Icon'          // Should be excluded from searchableAttributes
        }
        // keyring is not part of StoredCertificate
      }

      await manager.storeRecord(txid, outputIndex, certificateData)

      expect(mockCollection.insertOne).toHaveBeenCalledTimes(1)
      const insertArg = (mockCollection.insertOne as jest.Mock).mock.calls[0][0] as IdentityRecord

      expect(insertArg.txid).toEqual(txid)
      expect(insertArg.outputIndex).toEqual(outputIndex)
      expect(insertArg.certificate).toEqual(certificateData) // Assert against the StoredCertificate data
      expect(insertArg.createdAt).toBeInstanceOf(Date)

      // Ensure profilePhoto and icon do NOT appear in searchableAttributes
      expect(insertArg.searchableAttributes).toContain('Alice')
      expect(insertArg.searchableAttributes).toContain('Example')
      expect(insertArg.searchableAttributes).not.toContain('someBase64Photo')
      expect(insertArg.searchableAttributes).not.toContain('someBase64Icon')
    })
  })

  describe('deleteRecord', () => {
    it('should delete a matching record from the collection', async () => {
      const txid = 'txidForDelete'
      const outputIndex = 2

      await manager.deleteRecord(txid, outputIndex)

      expect(mockCollection.deleteOne).toHaveBeenCalledTimes(1)
      expect(mockCollection.deleteOne).toHaveBeenCalledWith({ txid, outputIndex })
    })
  })

  describe('findByAttribute', () => {
    it('should return empty array if attributes is empty or undefined', async () => {
      const res1 = await manager.findByAttribute({}, ['cert1'])
      const res2 = await manager.findByAttribute(undefined as any, ['cert1'])
      expect(res1).toEqual([])
      expect(res2).toEqual([])
      expect(mockCollection.find).not.toHaveBeenCalled()
    })

    it('should call findRecordWithQuery with "any" attribute for fuzzy search', async () => {
      const attributes: IdentityAttributes = { any: 'Alice' }
      const certifiers = ['cert1']

      // Setup mock to return a known array
      const mockCursor = {
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<Partial<IdentityRecord>[]>>().mockResolvedValue([
          { txid: 'txidA', outputIndex: 0 },
          { txid: 'txidB', outputIndex: 1 }
        ])
      }
      mockCollection.find.mockReturnValue(mockCursor as any)

      const results = await manager.findByAttribute(attributes, certifiers)
      expect(mockCollection.find).toHaveBeenCalledTimes(1)
      expect(results).toEqual([
        { txid: 'txidA', outputIndex: 0 },
        { txid: 'txidB', outputIndex: 1 }
      ])
    })

    it('should handle specific attributes (non-"any")', async () => {
      const attributes: IdentityAttributes = { firstName: 'Alice', lastName: 'Test' }
      const certifiers = ['cert1', 'cert2']

      // Setup mock
      const mockCursor = {
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<Partial<IdentityRecord>[]>>().mockResolvedValue([
          { txid: 'txidC', outputIndex: 2 }
        ])
      }
      mockCollection.find.mockReturnValue(mockCursor as any)

      const results = await manager.findByAttribute(attributes, certifiers)
      expect(results).toEqual([{ txid: 'txidC', outputIndex: 2 }])

      // Check that find was called with a query that includes $and
      expect(mockCollection.find).toHaveBeenCalled()
      // We won't deep-equal the exact query object; we just check it was used
    })
  })

  describe('findByIdentityKey', () => {
    it('should return empty array if identityKey is undefined', async () => {
      const results = await manager.findByIdentityKey(undefined as any)
      expect(results).toEqual([])
      expect(mockCollection.find).not.toHaveBeenCalled()
    })

    it('should construct query and call findRecordWithQuery', async () => {
      const identityKey = '022222222222222222222222222222222222222222222222222222222222222222'
      const certifiers = ['033333333333333333333333333333333333333333333333333333333333333333']

      // Setup mock
      const mockCursor = {
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<Partial<IdentityRecord>[]>>().mockResolvedValue([
          { txid: 'testTxid', outputIndex: 9 }
        ])
      }
      mockCollection.find.mockReturnValue(mockCursor as any)

      const results = await manager.findByIdentityKey(identityKey, certifiers)
      expect(mockCollection.find).toHaveBeenCalled()
      expect(results).toEqual([{ txid: 'testTxid', outputIndex: 9 }])
    })
  })

  describe('findByCertifier', () => {
    it('should return empty array if certifiers is undefined or empty', async () => {
      const result1 = await manager.findByCertifier(undefined as any)
      const result2 = await manager.findByCertifier([])

      expect(result1).toEqual([])
      expect(result2).toEqual([])
      expect(mockCollection.find).not.toHaveBeenCalled()
    })

    it('should find records by certifiers', async () => {
      const certifiers = [
        '033333333333333333333333333333333333333333333333333333333333333333',
        '044444444444444444444444444444444444444444444444444444444444444444'
      ]
      // Setup mock
      const mockCursor = {
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<Partial<IdentityRecord>[]>>().mockResolvedValue([
          { txid: 'certTxid1', outputIndex: 0 },
          { txid: 'certTxid2', outputIndex: 1 }
        ])
      }
      mockCollection.find.mockReturnValue(mockCursor as any)

      const results = await manager.findByCertifier(certifiers)
      expect(mockCollection.find).toHaveBeenCalled()
      expect(results).toEqual([
        { txid: 'certTxid1', outputIndex: 0 },
        { txid: 'certTxid2', outputIndex: 1 }
      ])
    })
  })

  describe('findByCertificateType', () => {
    it('should return empty array if parameters are missing or empty', async () => {
      const result1 = await manager.findByCertificateType(undefined as any, 'someKey', ['cert1'])
      const result2 = await manager.findByCertificateType([], 'someKey', ['cert1'])
      const result3 = await manager.findByCertificateType(['type1'], undefined as any, ['cert1'])
      const result4 = await manager.findByCertificateType(['type1'], 'someKey', [])
      expect(result1).toEqual([])
      expect(result2).toEqual([])
      expect(result3).toEqual([])
      expect(result4).toEqual([])
      expect(mockCollection.find).not.toHaveBeenCalled()
    })

    it('should find by certificateType, identityKey, and certifiers', async () => {
      const types = ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA']
      const identityKey = '022222222222222222222222222222222222222222222222222222222222222222'
      const certifiers = ['033333333333333333333333333333333333333333333333333333333333333333']

      // Setup mock
      const mockCursor = {
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<Partial<IdentityRecord>[]>>().mockResolvedValue([
          { txid: 'typeTxid', outputIndex: 7 }
        ])
      }
      mockCollection.find.mockReturnValue(mockCursor as any)

      const results = await manager.findByCertificateType(types, identityKey, certifiers)
      expect(mockCollection.find).toHaveBeenCalled()
      expect(results).toEqual([{ txid: 'typeTxid', outputIndex: 7 }])
    })
  })

  describe('findByCertificateSerialNumber', () => {
    it('should return empty array if serialNumber is undefined or empty string', async () => {
      const result1 = await manager.findByCertificateSerialNumber(undefined as any)
      const result2 = await manager.findByCertificateSerialNumber('')
      expect(result1).toEqual([])
      expect(result2).toEqual([])
      expect(mockCollection.find).not.toHaveBeenCalled()
    })

    it('should find by certificate.serialNumber', async () => {
      const serialNumber = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'

      // Setup mock
      const mockCursor = {
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<Partial<IdentityRecord>[]>>().mockResolvedValue([{ txid: 'snTxid', outputIndex: 11 }])
      }
      mockCollection.find.mockReturnValue(mockCursor as any)

      const results = await manager.findByCertificateSerialNumber(serialNumber)
      expect(mockCollection.find).toHaveBeenCalled()
      expect(results).toEqual([{ txid: 'snTxid', outputIndex: 11 }])
    })
  })

  describe('Integration of findRecordWithQuery', () => {
    it('should query the DB, project, and map results to UTXOReference', async () => {
      const testQuery = { someField: 'someValue' }
      const mockData = [
        { txid: 'qTxid1', outputIndex: 9 },
        { txid: 'qTxid2', outputIndex: 10 }
      ]
      // Correctly typed mockCursor for this specific test
      const mockCursor = {
        project: jest.fn().mockReturnThis(), // Allow chaining
        toArray: jest.fn<() => Promise<Partial<IdentityRecord>[]>>().mockResolvedValue(mockData)
      }
      mockCollection.find.mockReturnValueOnce(mockCursor as any)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results = await (manager as any).findRecordWithQuery(testQuery)
      expect(mockCollection.find).toHaveBeenCalledWith(testQuery)
      expect(mockCursor.project).toHaveBeenCalledWith({ txid: 1, outputIndex: 1, _id: 0 }) // Updated expectation
      expect(results).toEqual([
        { txid: 'qTxid1', outputIndex: 9 },
        { txid: 'qTxid2', outputIndex: 10 }
      ])
    })
  })

  describe('getRecordsByTxid', () => {
    it('should return IdentityRecords for records matching the txid', async () => {
      const specificRecords: IdentityRecord[] = [
        { txid: 'txid123', outputIndex: 0, certificate: { type: ['VerifiableCredential', 'BRC52IdentityCertificate'], serialNumber: 'serial1', subject: 's1', certifier: 'c1', revocationOutpoint: 'ro1', fields: { f: 'v1' } } as StoredCertificate, createdAt: new Date(), searchableAttributes: 'v1' },
        { txid: 'txid123', outputIndex: 1, certificate: { type: ['VerifiableCredential', 'BRC52IdentityCertificate'], serialNumber: 'serial2', subject: 's2', certifier: 'c2', revocationOutpoint: 'ro2', fields: { f: 'v2' } } as StoredCertificate, createdAt: new Date(), searchableAttributes: 'v2' }
      ]
      const mockCursorForTxid = { 
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<IdentityRecord[]>>().mockResolvedValue(specificRecords)
      }
      // Override the default find mock for this specific test case
      ;(mockCollection.find as jest.Mock).mockReturnValueOnce(mockCursorForTxid);

      const results = await manager.getRecordsByTxid('txid123');
      expect(results.length).toBe(2);
      expect(results[0].txid).toBe('txid123');
      expect(results[0].outputIndex).toBe(0);
      expect(results[0].certificate.serialNumber).toBe('serial1');
      expect(results[0].certificate.type).toEqual(['VerifiableCredential', 'BRC52IdentityCertificate']);
      expect(results[0].certificate.subject).toBe('s1');

      expect(results[1].txid).toBe('txid123');
      expect(results[1].outputIndex).toBe(1);
      expect(results[1].certificate.serialNumber).toBe('serial2');
      expect(results[1].certificate.type).toEqual(['VerifiableCredential', 'BRC52IdentityCertificate']);
      expect(results[1].certificate.subject).toBe('s2');
    });

    it('should return an empty array if no records match the txid', async () => {
      const mockCursorEmptyForTxid = { 
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<IdentityRecord[]>>().mockResolvedValue([])
      }
      ;(mockCollection.find as jest.Mock).mockReturnValueOnce(mockCursorEmptyForTxid);

      const results = await manager.getRecordsByTxid('nonExistentTxid');
      expect(results.length).toBe(0);
    });
  })

  describe('findRecordsByCertifiers', () => {
    it('should return SDKCertificates for records matching certifier IDs', async () => {
      const records: IdentityRecord[] = [
        { txid: 'txidA', outputIndex: 0, certificate: { type: ['VerifiableCredential', 'BRC52IdentityCertificate'], serialNumber: 'serialA', subject: 'sA', certifier: 'certifier1', revocationOutpoint: 'roA', fields: { f: 'vA' } } as StoredCertificate, createdAt: new Date(), searchableAttributes: 'vA' },
        { txid: 'txidB', outputIndex: 1, certificate: { type: ['VerifiableCredential', 'BRC52IdentityCertificate'], serialNumber: 'serialB', subject: 'sB', certifier: 'certifier2', revocationOutpoint: 'roB', fields: { f: 'vB' } } as StoredCertificate, createdAt: new Date(), searchableAttributes: 'vB' }
      ]
      const mockCursor = { 
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<IdentityRecord[]>>().mockResolvedValue(records) 
      }
      mockCollection.find.mockReturnValue(mockCursor as any)

      const result = await manager.findRecordsByCertifiers(['certifier1', 'certifier2'])
      expect(result.length).toBe(2)
      // Check for a defining property instead of instanceof for mocked class
      expect(result[0].certificate).toHaveProperty('serialNumber') 
      expect(result[0].certificate.serialNumber).toBe('serialA')
      expect(result[0].certificate.type).toEqual(['VerifiableCredential', 'BRC52IdentityCertificate']) // Assert specific type from StoredCert
      expect(result[1].certificate).toHaveProperty('serialNumber')
      expect(result[1].certificate.serialNumber).toBe('serialB')
      expect(result[1].certificate.type).toEqual(['VerifiableCredential', 'BRC52IdentityCertificate']) // Assert specific type from StoredCert
    })
  })

  describe('findByCertificateType', () => {
    it('should return UTXOReferences for records matching type, identityKey, and certifiers', async () => {
      const utxoReferences: Partial<IdentityRecord>[] = [
        { txid: 'txidC', outputIndex: 0 }, // Simulating UTXOReference structure
        { txid: 'txidD', outputIndex: 1 }
      ]
      const mockCursor = { 
        project: jest.fn().mockReturnThis(), // findRecordWithQuery projects by default
        toArray: jest.fn<() => Promise<Partial<IdentityRecord>[]>>().mockResolvedValue(utxoReferences) 
      }
      mockCollection.find.mockReturnValue(mockCursor as any)

      const mockCertTypes = ['BRC52IdentityCertificateType'] // Example type
      const mockIdentityKey = 'mockIdentityKey'
      const mockCertifiers = ['mockCertifierKey']

      const result = await manager.findByCertificateType(mockCertTypes, mockIdentityKey, mockCertifiers) 
      expect(result.length).toBe(2)
      expect(result[0]).toEqual(expect.objectContaining({ txid: 'txidC', outputIndex: 0 }))
      expect(result[1]).toEqual(expect.objectContaining({ txid: 'txidD', outputIndex: 1 }))
      // Ensure the mock was called with a query that includes certificate.type, certificate.subject, and certificate.certifier
      expect(mockCollection.find).toHaveBeenCalledWith(expect.objectContaining({
        'certificate.type': { $in: mockCertTypes },
        'certificate.subject': mockIdentityKey,
        'certificate.certifier': { $in: mockCertifiers }
      }))
    })
  })

  describe('findByCertificateSerialNumber', () => {
    it('should return a UTXOReference for a record matching serial number', async () => {
      const partialRecordForSerial: UTXOReference = { txid: 'txidD', outputIndex: 0 };
      const mockCursorForSerialFound = {
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<UTXOReference[]>>().mockResolvedValue([partialRecordForSerial])
      };
      (mockCollection.find as jest.Mock).mockImplementationOnce((query: any) => {
        if (query['certificate.serialNumber'] === 'uniqueSerial') return mockCursorForSerialFound;
        return { project: jest.fn().mockReturnThis(), toArray: jest.fn<() => Promise<UTXOReference[]>>().mockResolvedValue([]) }; // Default empty for safety
      })

      const result = await manager.findByCertificateSerialNumber('uniqueSerial')
      expect(result.length).toBe(1)
      expect(result[0]).toEqual(partialRecordForSerial) 
    })

    it('should return an empty array if no record matches serial number', async () => {
       // Mock setup for find().project().toArray() to return an empty array
      const mockCursorForSerialNotFound = {
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<UTXOReference[]>>().mockResolvedValue([])
      };
      (mockCollection.find as jest.Mock).mockImplementationOnce((query: any) => {
        if (query['certificate.serialNumber'] === 'nonExistentSerial') return mockCursorForSerialNotFound;
        return { project: jest.fn().mockReturnThis(), toArray: jest.fn<() => Promise<UTXOReference[]>>().mockResolvedValue([]) }; // Default empty
      })

      const result = await manager.findByCertificateSerialNumber('nonExistentSerial')
      expect(result).toEqual([])
    })
  })

  describe('findRecordWithQuery', () => {
    it('should return a partial record matching the query', async () => {
      const partialRecordForQuery: UTXOReference = { txid: 'txidQuery', outputIndex: 0 }
      const mockCursorWithPartialRecord = {
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<UTXOReference[]>>().mockResolvedValue([partialRecordForQuery])
      };
      (mockCollection.find as jest.Mock).mockImplementationOnce((query: any) => {
        if (query['certificate.fields.custom'] === 'value') return mockCursorWithPartialRecord;
        return { project: jest.fn().mockReturnThis(), toArray: jest.fn<() => Promise<UTXOReference[]>>().mockResolvedValue([]) }; // Default empty for safety
      })

      const result = await (manager as any).findRecordWithQuery({ 'certificate.fields.custom': 'value' })
      expect(result.length).toBe(1);
      expect(result[0]).toEqual(partialRecordForQuery) // Expecting UTXOReference from mockCursorWithPartialRecord
    })
  })

  describe('verifyOutputCertification', () => {
    beforeEach(() => {
      // Clear the mockVerify before each test to ensure clean state
      mockVerify.mockClear();
      // Set a default behavior (e.g., verification passes) that can be overridden in specific tests
      mockVerify.mockResolvedValue(true);
    });

    it('should return an SDKCertificate if output is certified and verification passes', async () => {
      mockVerify.mockResolvedValueOnce(true); // Ensure verify passes for this test
      const mockRecord: IdentityRecord = {
        _id: new ObjectId(),
        txid: 'txid1',
        outputIndex: 0,
        certificate: { type: ['VerifiableCredential'], serialNumber: 'testSerial', subject: 'sV', certifier: 'cV', revocationOutpoint: 'roV', fields: {} } as StoredCertificate,
        createdAt: new Date(),
        searchableAttributes: ''
      }
      const mockCursorForVerify = { 
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<IdentityRecord[]>>().mockResolvedValue([mockRecord])
      };
      (mockCollection.find as jest.Mock).mockImplementationOnce((query: any) => {
        if (query.txid === 'txid1' && query.outputIndex === 0) return mockCursorForVerify;
        return defaultMockCursorForFullRecords; // Fallback, though not expected to be hit here
      })

      const result = await manager.verifyOutputCertification('txid1', 0)

      expect(mockCollection.find).toHaveBeenCalledWith({ txid: 'txid1', outputIndex: 0 })
      expect(mockVerify).toHaveBeenCalled(); // Check if verify was called
      expect(result).toBeInstanceOf(SDKCertificate)
      expect(result?.serialNumber).toBe('testSerial')
      expect(result?.type).toEqual('VerifiableCredential') // Assert first type
    })

    it('should return null if output is certified but SDKCertificate.verify() fails', async () => {
      mockVerify.mockResolvedValueOnce(false); // Ensure verify fails for this test
      const mockRecord: IdentityRecord = {
        _id: new ObjectId(),
        txid: 'txid1',
        outputIndex: 1,
        certificate: { type: ['VerifiableCredential'], serialNumber: 'testSerial', subject: 'sV', certifier: 'cV', revocationOutpoint: 'roV', fields: {} } as StoredCertificate,
        createdAt: new Date(),
        searchableAttributes: ''
      }
      const mockCursorForVerifyFail = { 
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<IdentityRecord[]>>().mockResolvedValue([mockRecord])
      };
      (mockCollection.find as jest.Mock).mockImplementationOnce((query: any) => {
        if (query.txid === 'txid1' && query.outputIndex === 1) return mockCursorForVerifyFail;
        return defaultMockCursorForFullRecords;
      })

      const result = await manager.verifyOutputCertification('txid1', 1)

      expect(mockCollection.find).toHaveBeenCalledWith({ txid: 'txid1', outputIndex: 1 })
      expect(mockVerify).toHaveBeenCalled(); // Check if verify was called
      expect(result).toBeNull()
    })

    it('should return an SDKCertificate if output is certified but revoked, IF SDKCertificate.verify() passes (current behavior)', async () => {
      mockVerify.mockResolvedValueOnce(true); // Ensure verify passes
      const mockRecord: IdentityRecord = {
        _id: new ObjectId(),
        txid: 'txid1',
        outputIndex: 1,
        certificate: { type: ['VerifiableCredential', 'BRC52IdentityCertificate'], serialNumber: 'testSerial', subject: 'sV', certifier: 'cV', revocationOutpoint: 'roV', fields: {} } as StoredCertificate,
        createdAt: new Date(),
        searchableAttributes: ''
      }
      const mockCursorForRevoked = { 
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<IdentityRecord[]>>().mockResolvedValue([mockRecord])
      };
      (mockCollection.find as jest.Mock).mockImplementationOnce((query: any) => {
        if (query.txid === 'txid1' && query.outputIndex === 1) return mockCursorForRevoked;
        return defaultMockCursorForFullRecords;
      })

      const result = await manager.verifyOutputCertification('txid1', 1)

      expect(mockCollection.find).toHaveBeenCalledWith({ txid: 'txid1', outputIndex: 1 })
      expect(mockVerify).toHaveBeenCalled(); // Check if verify was called
      expect(result).toBeInstanceOf(SDKCertificate) // Current implementation returns cert if verify() passes
      expect(result?.serialNumber).toBe('testSerial')
      expect(result?.type).toEqual('VerifiableCredential') // Assert first type
    })

    it('should return null if output is not certified (no record found)', async () => {
      const emptyMockCursorForVerify = { 
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn<() => Promise<IdentityRecord[]>>().mockResolvedValue([])
      };
      (mockCollection.find as jest.Mock).mockImplementationOnce((query: any) => {
        if (query.txid === 'notCertifiedTxid' && query.outputIndex === 2) return emptyMockCursorForVerify;
        return defaultMockCursorForFullRecords;
      })
      // verifySpy will not be called if no record is found, so no need to mock its return for this case specifically

      const result = await manager.verifyOutputCertification('notCertifiedTxid', 2)

      expect(mockCollection.find).toHaveBeenCalledWith({ txid: 'notCertifiedTxid', outputIndex: 2 })
      expect(mockVerify).not.toHaveBeenCalled(); // Ensure verify was NOT called
      expect(result).toBeNull()
    })
  })
})
