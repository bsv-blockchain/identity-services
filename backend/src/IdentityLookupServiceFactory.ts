import { IdentityStorageManager } from './IdentityStorageManager.js'
import { LookupAnswer, LookupFormula, LookupQuestion, LookupService } from '@bsv/overlay'
import { ProtoWallet, PushDrop, Script, Utils, VerifiableCertificate } from '@bsv/sdk'
import docs from './docs/IdentityLookupDocs.md.js'
import { IdentityQuery } from './types.js'
import { Db } from 'mongodb'

/**
 * Implements a lookup service for Identity key registry
 * @public
 */
class IdentityLookupService implements LookupService {
  /**
   * Constructs a new Identity Lookup Service instance
   * @param storageManager
   */
  constructor(public storageManager: IdentityStorageManager) { }

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
    const certificate = new VerifiableCertificate(
      parsedCert.type,
      parsedCert.serialNumber,
      parsedCert.subject,
      parsedCert.certifier,
      parsedCert.revocationOutpoint,
      parsedCert.fields,
      parsedCert.keyring
    )

    // Decrypt certificate fields
    const decryptedFields = await certificate.decryptFields(new ProtoWallet('anyone'))
    if (Object.keys(decryptedFields).length === 0) throw new Error('No publicly revealed attributes present!')

    // Replace the certificate fields with the decrypted versions
    certificate.fields = decryptedFields

    console.log(
      'Identity lookup service is storing a record',
      txid,
      outputIndex,
      certificate
    )

    // Store identity certificate
    await this.storageManager.storeRecord(
      txid,
      outputIndex,
      certificate
    )
  }

  /**
   * Notifies the lookup service that an output was spent
   * @param txid - The transaction ID of the spent output
   * @param outputIndex - The index of the spent output
   * @param topic - The topic associated with the spent output
   */
  async outputSpent?(txid: string, outputIndex: number, topic: string): Promise<void> {
    if (topic !== 'tm_identity') return
    await this.storageManager.deleteRecord(txid, outputIndex)
  }

  /**
   * Notifies the lookup service that an output has been deleted
   * @param txid - The transaction ID of the deleted output
   * @param outputIndex - The index of the deleted output
   * @param topic - The topic associated with the deleted output
   */
  async outputDeleted?(txid: string, outputIndex: number, topic: string): Promise<void> {
    if (topic !== 'tm_identity') return
    await this.storageManager.deleteRecord(txid, outputIndex)
  }

  /**
   * Answers a lookup query
   * @param question - The lookup question to be answered
   * @returns A promise that resolves to a lookup answer or formula
   */
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

  /**
   *
   * @param output
   * @param currentDepth
   * @param historyRequested
   * @returns
   */
  // private async historySelector(output, currentDepth, historyRequested): Promise<boolean> {
  //   try {
  //     if (historyRequested === false && currentDepth > 0) return false
  //   } catch (error) {
  //     // Probably not a PushDrop token so do nothing
  //   }
  //   return true
  // }

  /**
   * Returns documentation specific to this overlay lookup service
   * @returns A promise that resolves to the documentation string
   */
  async getDocumentation(): Promise<string> {
    return docs
  }

  /**
   * Returns metadata associated with this lookup service
   * @returns A promise that resolves to an object containing metadata
   * @throws An error indicating the method is not implemented
   */
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
