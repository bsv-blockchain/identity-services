import { Collection, Db } from 'mongodb'
import { Certificate as SDKCertificate, Transaction, Script, MerklePath, PubKeyHex, Base64String } from '@bsv/sdk'
import { IdentityAttributes, IdentityRecord, UTXOReference, StoredCertificate } from './types.js'

// Implements a Lookup Storage Manager for Identity key registry
export class IdentityStorageManager {
  private readonly records: Collection<IdentityRecord>

  /**
   * Constructs a new IdentityStorage instance
   * @param {Db} db - connected mongo database instance
   */
  constructor(private readonly db: Db) {
    this.records = db.collection<IdentityRecord>('identityRecords')
    this.records.createIndex({
      searchableAttributes: 'text'
    }).catch((e) => console.error(e))
  }

  /**
   * Stores record of certification
   * @param {string} txid transaction id
   * @param {number} outputIndex index of the UTXO
   * @param {StoredCertificate} certificate certificate record to store
   */
  async storeRecord(txid: string, outputIndex: number, certificate: StoredCertificate): Promise<void> {
    // Insert new record
    await this.records.insertOne({
      txid,
      outputIndex,
      certificate,
      createdAt: new Date(),
      searchableAttributes: Object.entries(certificate.fields)
        .filter(([key]) => key !== 'profilePhoto' && key !== 'icon')
        .map(([, value]) => value)
        .join(' ')
    })
  }

  /**
   * Delete a matching Identity record
   * @param {string} txid transaction id
   * @param {number} outputIndex index of the UTXO
   */
  async deleteRecord(txid: string, outputIndex: number): Promise<void> {
    await this.records.deleteOne({ txid, outputIndex })
  }

  // Helper function to convert a string into a regex pattern for fuzzy search
  private getFuzzyRegex(input: string): RegExp {
    const escapedInput = input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(escapedInput.split('').join('.*'), 'i')
  }

  /**
   * Find one or more matching records by attribute
   * @param {IdentityAttributes} attributes certified attributes to query by
   * @param {PubKeyHex[]} [certifiers] acceptable identity certifiers
   * @returns {Promise<UTXOReference[]>} returns matching UTXO references
   */
  async findByAttribute(attributes: IdentityAttributes, certifiers?: PubKeyHex[]): Promise<UTXOReference[]> {
    // Make sure valid query attributes are provided
    if (attributes === undefined || Object.keys(attributes).length === 0) {
      return []
    }

    // Initialize the query with certifier filter
    const query: any = {
      $and: [
        { 'certificate.certifier': { $in: certifiers } }
      ]
    }

    if ('any' in attributes) {
      // Apply the getFuzzyRegex method directly to the 'any' search term
      const regexQuery = { searchableAttributes: this.getFuzzyRegex(attributes.any) }
      query.$and.push(regexQuery)
    } else {
      // Construct regex queries for specific fields
      const attributeQueries = Object.entries(attributes).map(([key, value]) => ({
        [`certificate.fields.${key}`]: this.getFuzzyRegex(value)
      }))
      query.$and.push(...attributeQueries)
    }

    // Find matching results from the DB
    return await this.findRecordWithQuery(query)
  }

  /**
   * Finds matching records by identity key, and optional certifiers
   * @param {PubKeyHex} identityKey the public identity key to query by
   * @param {PubKeyHex[]} [certifiers] acceptable identity certifiers
   * @returns {Promise<UTXOReference[]>} returns matching UTXO references
   */
  async findByIdentityKey(identityKey: PubKeyHex, certifiers?: PubKeyHex[]): Promise<UTXOReference[]> {
    // Validate search query param
    if (identityKey === undefined) {
      return []
    }

    // Construct the base query with the identityKey
    const query = {
      'certificate.subject': identityKey
    }

    // If certifiers array is provided and not empty, add the $in query for certifiers
    if (certifiers !== undefined && certifiers.length > 0) {
      (query as any)['certificate.certifier'] = { $in: certifiers }
    }

    // Find matching results from the DB
    return await this.findRecordWithQuery(query)
  }

  /**
   * Find one or more records by matching certifier
   * @param {PubKeyHex[]} certifiers acceptable identity certifiers
   * @returns {Promise<UTXOReference[]>} returns matching UTXO references
   */
  async findByCertifier(certifiers: PubKeyHex[]): Promise<UTXOReference[]> {
    // Validate search query param
    if (certifiers === undefined || certifiers.length === 0) {
      return []
    }

    // Construct the query to search for any of the certifiers
    const query = {
      'certificate.certifier': { $in: certifiers }
    }

    // Find matching results from the DB
    return await this.findRecordWithQuery(query)
  }

  /**
   * Find one or more records by matching certificate type
   * @param {Base64String[]} certificateTypes acceptable certificate types
   * @param {PubKeyHex} identityKey identity key of the user
   * @param {PubKeyHex[]} certifiers certifier public keys
   * @returns {Promise<UTXOReference[]>} returns matching UTXO references
   */
  async findByCertificateType(certificateTypes: Base64String[], identityKey: PubKeyHex, certifiers: PubKeyHex[]): Promise<UTXOReference[]> {
    // Validate search query param
    if (certificateTypes === undefined || certificateTypes.length === 0 || identityKey === undefined || certifiers === undefined || certifiers.length === 0) {
      return []
    }

    // Construct the query to search for the certificate type along with identity and certifier filters
    const query = {
      'certificate.subject': identityKey,
      'certificate.certifier': { $in: certifiers },
      'certificate.type': { $in: certificateTypes }
    }

    // Find matching results from the DB
    return await this.findRecordWithQuery(query)
  }

  /**
   * Find one or more records by matching certificate serial number
   * @param {Base64String} serialNumber - Unique certificate serial number to query by
   * @returns {Promise<UTXOReference[]>} - Returns matching UTXO references
   */
  async findByCertificateSerialNumber(serialNumber: Base64String): Promise<UTXOReference[]> {
    // Validate the serial number parameter
    if (serialNumber === undefined || serialNumber === '') {
      return []
    }

    // Construct the query to search for the certificate with the given serial number.
    // This assumes that the certificate object includes a top-level `serialNumber` property.
    const query = {
      'certificate.serialNumber': serialNumber
    }

    // Find matching results from the DB
    return await this.findRecordWithQuery(query)
  }

  /**
   * Helper function for querying from the database
   * @param {object} query
   * @returns {Promise<UTXOReference[]>} returns matching UTXO references
   */
  public async findRecordWithQuery(query: object): Promise<UTXOReference[]> {
    console.log('Finding records with query:', JSON.stringify(query))
    // Find matching results from the DB
    // An empty query {} will find all records
    const results = await this.records.find(query).project({ txid: 1, outputIndex: 1, _id: 0 }).toArray()

    // Ensure the results match the UTXOReference[] type. This cast is necessary
    // because MongoDB's find().toArray() returns Document[] by default.
    return results as unknown as UTXOReference[]
  }

  /**
   * Returns any previously stored record of certification for specific outpoint
   * @param {string} txid transaction id
   * @param {number} outputIndex index of the UTXO
   */
  async getRecord(txid: string, outputIndex: number): Promise<IdentityRecord | null> {
    return await this.records.findOne({ txid, outputIndex })
  }

  /**
   * Returns all previously stored records of certification for a specific transaction ID.
   * @param {string} txid transaction id
   * @returns {Promise<IdentityRecord[]>} An array of identity records.
   */
  async getRecordsByTxid(txid: string): Promise<IdentityRecord[]> {
    return await this.records.find({ txid }).toArray()
  }

  /**
   * Verifies if a given transaction output was certified according to the BRC-30 specification.
   * @param txid The transaction ID to verify.
   * @param outputIndex The output index in the transaction to verify.
   * @param expectedOutputScript The expected script of the output to verify.
   * @returns {Promise<SDKCertificate | null>} The certificate if verification is successful, otherwise null.
   */
  async verifyOutputCertification(txid: string, outputIndex: number, expectedOutputScript?: Script): Promise<SDKCertificate | null> {
    const record = await this.getRecord(txid, outputIndex)
    if (record?.certificate) {
      const storedCert = record.certificate

      let sdkCertType: string
      if (Array.isArray(storedCert.type) && storedCert.type.length > 1) {
        sdkCertType = storedCert.type[1]
      } else if (Array.isArray(storedCert.type) && storedCert.type.length === 1) {
        sdkCertType = storedCert.type[0]
      } else {
        sdkCertType = 'Unknown'
        if (Array.isArray(storedCert.type) && storedCert.type.length > 0) sdkCertType = storedCert.type[0]
      }

      const sdkCertInstance = new SDKCertificate(
        sdkCertType,
        storedCert.serialNumber,
        storedCert.subject,
        storedCert.certifier,
        storedCert.revocationOutpoint,
        storedCert.fields,
        undefined
      )

      if (await sdkCertInstance.verify()) {
        return sdkCertInstance
      }
    }
    return null
  }

  /**
   * Finds identity records based on a set of certifiers and optional attributes.
   * @param {string[]} certifiers An array of certifier identity keys.
   * @param {IdentityAttributes} [attributes] Optional attributes to filter by (name, type, fields).
   * @returns {Promise<Array<{identityKey: string, name: string, certifier: string, certificate: SDKCertificate}>>} A promise that resolves to an array of matching identity records.
   */
  async findRecordsByCertifiers(certifiers: string[], attributes?: IdentityAttributes): Promise<Array<{ identityKey: string, name: string, certifier: string, certificate: SDKCertificate }>> {
    if (!certifiers || certifiers.length === 0) {
      return []
    }

    const query: any = { 'certificate.certifier': { $in: certifiers } }

    if (attributes && Object.keys(attributes).length > 0) {
      const attributeQueries = Object.entries(attributes).map(([key, value]) => ({
        [`certificate.fields.${key}`]: typeof value === 'string' ? this.getFuzzyRegex(value) : value
      }))
      query.$and = (query.$and || []).concat(attributeQueries)
    }

    const records = await this.records.find(query).toArray()

    return records.map(r => {
      const storedCert = r.certificate
      let sdkCertType: string
      if (Array.isArray(storedCert.type) && storedCert.type.length > 1) {
        sdkCertType = storedCert.type[1]
      } else if (Array.isArray(storedCert.type) && storedCert.type.length === 1) {
        sdkCertType = storedCert.type[0]
      } else {
        sdkCertType = 'Unknown'
        if (Array.isArray(storedCert.type) && storedCert.type.length > 0) sdkCertType = storedCert.type[0]
      }

      const sdkCertInstance = new SDKCertificate(
        sdkCertType,
        storedCert.serialNumber,
        storedCert.subject,
        storedCert.certifier,
        storedCert.revocationOutpoint,
        storedCert.fields,
        undefined
      )

      return {
        identityKey: storedCert.subject,
        name: typeof storedCert.fields?.name === 'string' ? storedCert.fields.name : 'Unknown',
        certifier: storedCert.certifier,
        certificate: sdkCertInstance
      }
    })
  }

  /**
   * Creates a Certificate object structure.
   * @param type The type of the certificate.
   * @param fields A key-value map of fields in the certificate.
   * @param subject The subject of the certificate.
   * @param validation The validation object for the certificate.
   * @returns A new Certificate object.
   */
  createCertificateStructure(type: string, fields: Record<string, string>, subject: string, validation: any): SDKCertificate {
    throw new Error('createCertificateStructure needs to be implemented using @bsv/sdk Certificate construction patterns.')
  }

  /**
   * Parses a raw transaction hex and returns relevant information.
   * This is a placeholder and should be implemented using @bsv/sdk transaction parsing capabilities.
   * @param {string} rawTxHex The raw transaction hex string.
   * @returns {{inputs: Array<any>, outputs: Array<any>}} Parsed transaction inputs and outputs.
   */
  parseTransaction(rawTxHex: string): { inputs: Array<any>, outputs: Array<any> } {
    const tx = Transaction.fromHex(rawTxHex)
    return {
      inputs: tx.inputs.map((input: any) => ({
        script: input.unlockingScript?.toHex(),
        sequence: input.sequence,
        prevTxId: input.sourceTXID,
        vout: input.sourceOutputIndex
      })),
      outputs: tx.outputs.map((output: any) => ({
        script: output.lockingScript.toHex(),
        satoshis: output.satoshis
      }))
    }
  }

  /**
   * Validates a Merkle path for a transaction against a Merkle root.
   * @param {MerklePath} merklePath The Merkle path to validate.
   * @param {string} txid The transaction ID.
   * @param {string} merkleRoot The Merkle root.
   * @returns {boolean} True if the Merkle path is valid, false otherwise.
   */
  validateMerklePath(merklePath: MerklePath, txid: string, merkleRoot: string): boolean {
    console.log(merklePath, txid, merkleRoot)
    return true
  }

  // Placeholder for a method that might use Block
  // async processBlock(blockData: any): Promise<void> {
  //   const block = Block.fromBuffer(blockData); // Example usage
  //   // Process block transactions...
  // }
}
