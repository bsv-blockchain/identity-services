import { IdentityStorageManager } from './IdentityStorageManager.js'
import { AdmissionMode, LookupAnswer, LookupFormula, LookupQuestion, LookupService, OutputAdmittedByTopic, OutputSpent, SpendNotificationMode } from '@bsv/overlay'
import { ProtoWallet, PushDrop, Utils, VerifiableCertificate, Script } from '@bsv/sdk'
import docs from './docs/IdentityLookupDocs.md'
import { IdentityQuery, StoredCertificate } from './types.js'
import { Db } from 'mongodb'

/**
 * Implements a lookup service for Identity key registry
 * @public
 */
class IdentityLookupService implements LookupService {
  readonly admissionMode: AdmissionMode = 'locking-script'
  readonly spendNotificationMode: SpendNotificationMode = 'none'

  constructor(public storageManager: IdentityStorageManager) { }

  async outputAdmittedByTopic(payload: OutputAdmittedByTopic): Promise<void> {
    if (payload.mode !== 'locking-script') throw new Error('Invalid payload')
    const { txid, outputIndex, topic, lockingScript } = payload
    if (topic !== 'tm_identity') return
    console.log(`Identity lookup service outputAdded called with ${txid}.${outputIndex}`)
    // Decode the Identity token fields from the Bitcoin outputScript
    const result = PushDrop.decode(lockingScript)
  }

  async outputDeleted(txid: string, outputIndex: number, topic: string): Promise<void> {
    if (topic !== 'tm_identity') {
      // console.log(`IdentityLookupService: outputDeleted for topic ${topic} ignored.`);
      return;
    }
    // console.log(`IdentityLookupService: outputDeleted called for ${txid}.${outputIndex} with topic ${topic}. Deleting record.`);
    await this.storageManager.deleteRecord(txid, outputIndex);
  }

  /**
   * Notifies the lookup service of a new output added.
   *
   * @param {string} txid - The transaction ID containing the output.
   * @param {number} outputIndex - The index of the output in the transaction.
   * @param {Script} outputScript - The script of the output to be processed.
   * @param {string} topic - The topic associated with the output.
   *
   * @returns {Promise<void>} A promise that resolves when the processing is complete.
   * @throws Will throw an error if there is an issue with storing the record in the storage engine.
   */
  async outputAdded?(txid: string, outputIndex: number, outputScript: Script, topic: string): Promise<void> {
    if (topic !== 'tm_identity') return
    console.log(`Identity lookup service outputAdded called with ${txid}.${outputIndex}`)
    // Decode the Identity token fields from the Bitcoin outputScript
    const result = PushDrop.decode(outputScript)
    const parsedCert = JSON.parse(Utils.toUTF8(result.fields[0]))
    const sdkCertificate = new VerifiableCertificate(
      parsedCert.type, // This might be a string or already an array if source data supports it
      parsedCert.serialNumber,
      parsedCert.subject,
      parsedCert.certifier,
      parsedCert.revocationOutpoint,
      parsedCert.fields,
      parsedCert.keyring
    )

    // Decrypt certificate fields
    const decryptedFields = await sdkCertificate.decryptFields(new ProtoWallet('anyone'))
    if (Object.keys(decryptedFields).length === 0) throw new Error('No publicly revealed attributes present!')

    // Construct the StoredCertificate object
    let w3cTypes: string[];
    if (typeof parsedCert.type === 'string' && parsedCert.type.trim() !== '') {
      w3cTypes = ["VerifiableCredential", parsedCert.type];
    } else if (Array.isArray(parsedCert.type) && parsedCert.type.length > 0) {
      w3cTypes = parsedCert.type;
    } else {
      w3cTypes = ["VerifiableCredential"]; // Default or fallback
    }

    const storedCertificateObject: StoredCertificate = {
      type: w3cTypes,
      serialNumber: sdkCertificate.serialNumber, // or parsedCert.serialNumber
      subject: sdkCertificate.subject, // or parsedCert.subject
      certifier: sdkCertificate.certifier, // or parsedCert.certifier
      revocationOutpoint: sdkCertificate.revocationOutpoint, // or parsedCert.revocationOutpoint
      fields: decryptedFields, // Use the decrypted fields
      keyring: sdkCertificate.keyring ? { ...sdkCertificate.keyring } : undefined,
    };

    console.log(
      'Identity lookup service is storing a record',
      txid,
      outputIndex,
      storedCertificateObject // Log the object we are about to store
    )

    // Store identity certificate
    await this.storageManager.storeRecord(
      txid,
      outputIndex,
      storedCertificateObject // Pass the StoredCertificate object
    )
  }

  async outputSpent(payload: OutputSpent): Promise<void> {
    if (payload.mode !== 'none') throw new Error('Invalid payload')
    const { topic, txid, outputIndex } = payload
    if (topic !== 'tm_identity') return
    await this.storageManager.deleteRecord(txid, outputIndex)
  }

  async outputEvicted(txid: string, outputIndex: number): Promise<void> {
    await this.storageManager.deleteRecord(txid, outputIndex)
  }

  async lookup(question: LookupQuestion): Promise<LookupAnswer | LookupFormula> {
    console.log('Identity lookup with question', question)
    if (question.query === undefined || question.query === null) {
      throw new Error('A valid query must be provided!')
    }
    if (question.service !== 'ls_identity') {
      throw new Error('Lookup service not supported!')
    }

    const questionToAnswer = (question.query as IdentityQuery)
    let results

    // Check if the query is effectively empty
    if (
      questionToAnswer.serialNumber === undefined &&
      questionToAnswer.attributes === undefined &&
      questionToAnswer.identityKey === undefined &&
      questionToAnswer.certifiers === undefined &&
      questionToAnswer.certificateTypes === undefined &&
      Object.keys(questionToAnswer).length === 0 // Ensures no other unexpected properties exist
    ) {
      results = await this.storageManager.findRecordWithQuery({})
      console.log('Identity lookup (empty query) returning this many results: ', results.length)
      return results
    }

    // If a unique serialNumber is provided, use findByCertificateSerialNumber.
    if (
      questionToAnswer.serialNumber !== undefined
    ) {
      results = await this.storageManager.findByCertificateSerialNumber(
        questionToAnswer.serialNumber
      )
      console.log('Identity lookup returning this many results: ', results.length)
      return results
    }

    // Handle all available queries
    if (questionToAnswer.attributes !== undefined && questionToAnswer.certifiers !== undefined) {
      results = await this.storageManager.findByAttribute(
        questionToAnswer.attributes,
        questionToAnswer.certifiers
      )
      console.log('Identity lookup returning this many results: ', results.length)
      return results
    } else if (questionToAnswer.identityKey !== undefined && questionToAnswer.certificateTypes !== undefined && questionToAnswer.certifiers !== undefined) {
      results = await this.storageManager.findByCertificateType(
        questionToAnswer.certificateTypes,
        questionToAnswer.identityKey,
        questionToAnswer.certifiers
      )
      console.log('Identity lookup returning this many results: ', results.length)
      return results
    } else if (questionToAnswer.identityKey !== undefined && questionToAnswer.certifiers !== undefined) {
      results = await this.storageManager.findByIdentityKey(
        questionToAnswer.identityKey,
        questionToAnswer.certifiers
      )
      console.log('Identity lookup returning this many results: ', results.length)
      return results
    } else if (questionToAnswer.certifiers !== undefined) {
      results = await this.storageManager.findByCertifier(
        questionToAnswer.certifiers
      )
      console.log('Identity lookup returning this many results: ', results.length)
      return results
    } else {
      throw new Error('One of the following params is missing: attribute, identityKey, certifier, or certificateType')
    }
  }

  async getDocumentation(): Promise<string> {
    return docs
  }

  async getMetaData(): Promise<{
    name: string
    shortDescription: string
    iconURL?: string
    version?: string
    informationURL?: string
  }> {
    return {
      name: 'Identity Lookup Service',
      shortDescription: 'Identity resolution made easy.'
    }
  }
}

// Factory function
export default (db: Db): IdentityLookupService => {
  return new IdentityLookupService(new IdentityStorageManager(db))
}
