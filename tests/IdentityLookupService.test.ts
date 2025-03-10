import { Db, Collection } from 'mongodb'
import createIdentityLookupService from '../backend/src/IdentityLookupServiceFactory'
import { LookupQuestion } from '@bsv/overlay'
import { PushDrop, Script, Utils, VerifiableCertificate } from '@bsv/sdk'
import { IdentityRecord } from '../backend/src/types'

jest.mock('../backend/src/docs/IdentityLookupDocs.md', () => 'Mock Documentation', { virtual: true })
jest.mock('@bsv/overlay', () => {
  return {
    LookupQuestion: jest.fn()
  }
})
jest.mock('@bsv/sdk', () => {
  const originalSdk = jest.requireActual('@bsv/sdk')
  return {
    __esModule: true,
    ...originalSdk,
    PushDrop: {
      decode: jest.fn()
    }
  }
})

describe('IdentityLookupService (via factory)', () => {
  let mockDb: Db
  let mockCollection: Partial<Collection<IdentityRecord>>
  let service: ReturnType<typeof createIdentityLookupService>

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock MongoDB collection
    mockCollection = {
      insertOne: jest.fn(),
      deleteOne: jest.fn(),
      createIndex: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockReturnValue({
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([])
      })
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

      // Mock PushDrop.decode to return certificate data in fields[0]
      const mockDecoded = {
        lockingPublicKey: {},
        fields: [
          Utils.toArray(
            JSON.stringify({
              type: 'testType',
              serialNumber: 'testSerial',
              subject: 'testSubject',
              certifier: 'testCertifier',
              revocationOutpoint: 'testOutpoint',
              fields: { field1: 'encryptedValue' },
              keyring: { field1: 'encryptedKey' }
            })
          )
        ]
      }
        ; (PushDrop.decode as jest.Mock).mockReturnValue(mockDecoded)

      // Spy on VerifiableCertificate.prototype.decryptFields to simulate decryption.
      jest
        .spyOn(VerifiableCertificate.prototype, 'decryptFields')
        .mockResolvedValue({ field1: 'decryptedValue' })

      await service.outputAdded(mockTxid, mockIndex, mockScript, 'tm_identity')

      expect(mockCollection.insertOne).toHaveBeenCalledTimes(1)
      const insertedDoc = (mockCollection.insertOne as jest.Mock).mock.calls[0][0]
      expect(insertedDoc.txid).toBe(mockTxid)
      expect(insertedDoc.outputIndex).toBe(mockIndex)
      // Confirm the "searchableAttributes" includes the decrypted data.
      expect(insertedDoc.searchableAttributes).toContain('decryptedValue')
    })

    it('should ignore when topic is not "tm_identity"', async () => {
      const mockTxid = 'abc123'
      const mockIndex = 0
      const mockScript = {} as unknown as Script

      await service.outputAdded(mockTxid, mockIndex, mockScript, 'unrelated_topic')

      expect(PushDrop.decode).not.toHaveBeenCalled()
      expect(mockCollection.insertOne).not.toHaveBeenCalled()
    })

    it('should throw an error if decrypted fields are empty', async () => {
      const mockTxid = 'abc123'
      const mockIndex = 0
      const mockScript = {} as unknown as Script

      const mockDecoded = {
        lockingPublicKey: {},
        fields: [
          Utils.toArray(
            JSON.stringify({
              type: 'testType',
              serialNumber: 'testSerial',
              subject: 'testSubject',
              certifier: 'testCertifier',
              revocationOutpoint: 'testOutpoint',
              fields: { field1: 'encryptedValue' },
              keyring: { field1: 'encryptedKey' }
            })
          )
        ]
      }
        ; (PushDrop.decode as jest.Mock).mockReturnValue(mockDecoded)

      jest.spyOn(VerifiableCertificate.prototype, 'decryptFields').mockResolvedValue({})

      await expect(
        service.outputAdded(mockTxid, mockIndex, mockScript, 'tm_identity')
      ).rejects.toThrow('No publicly revealed attributes present!')

      expect(mockCollection.insertOne).not.toHaveBeenCalled()
    })
  })

  describe('outputSpent', () => {
    it('should delete record if topic is "tm_identity"', async () => {
      const mockTxid = 'abc123'
      const mockIndex = 0

      await service.outputSpent(mockTxid, mockIndex, 'tm_identity')
      expect(mockCollection.deleteOne).toHaveBeenCalledWith({ txid: mockTxid, outputIndex: mockIndex })
    })

    it('should ignore if topic is not "tm_identity"', async () => {
      const mockTxid = 'abc123'
      const mockIndex = 0

      await service.outputSpent(mockTxid, mockIndex, 'different_topic')
      expect(mockCollection.deleteOne).not.toHaveBeenCalled()
    })
  })

  describe('outputDeleted', () => {
    it('should delete record if topic is "tm_identity"', async () => {
      const mockTxid = 'abc123'
      const mockIndex = 0

      await service.outputDeleted(mockTxid, mockIndex, 'tm_identity')
      expect(mockCollection.deleteOne).toHaveBeenCalledWith({ txid: mockTxid, outputIndex: mockIndex })
    })

    it('should ignore if topic is not "tm_identity"', async () => {
      const mockTxid = 'abc123'
      const mockIndex = 0

      await service.outputDeleted(mockTxid, mockIndex, 'other_topic')
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
        toArray: jest.fn().mockResolvedValue([{ txid: '123', outputIndex: 0 }])
      })

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
        toArray: jest.fn().mockResolvedValue([])
      })

      await service.lookup(question)
      expect(mockCollection.find).toHaveBeenCalledTimes(1)

      const callArg = (mockCollection.find as jest.Mock).mock.calls[0][0]
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
        toArray: jest.fn().mockResolvedValue([])
      })

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
        toArray: jest.fn().mockResolvedValue([])
      })

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
        toArray: jest.fn().mockResolvedValue([])
      })

      await service.lookup(question)
      expect(mockCollection.find).toHaveBeenCalledWith({
        'certificate.certifier': { $in: ['certOnly'] }
      })
    })

    it('should throw error if required params are missing', async () => {
      const question: LookupQuestion = {
        service: 'ls_identity',
        query: {}
      }

      await expect(service.lookup(question)).rejects.toThrow(
        'One of the following params is missing: attribute, identityKey, certifier, or certificateType'
      )
    })
  })

  describe('getDocumentation', () => {
    it('should return documentation string', async () => {
      const docs = await service.getDocumentation()
      expect(docs).toBe('Mock Documentation')
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

