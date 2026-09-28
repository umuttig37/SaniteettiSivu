import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '..', 'data')
const resetTokensFile = path.join(dataDir, 'password-reset-tokens.json')
const defaultTokenTtlMs = 60 * 60 * 1000

let atomicWriteCounter = 0
let tokenWriteQueue = Promise.resolve()

const hashToken = (token) => crypto.createHash('sha256').update(String(token ?? ''), 'utf8').digest('hex')

const safeTokenHashEqual = (left, right) => {
  try {
    const leftBuffer = Buffer.from(String(left ?? ''), 'hex')
    const rightBuffer = Buffer.from(String(right ?? ''), 'hex')
    return leftBuffer.length === 32 && rightBuffer.length === 32 && crypto.timingSafeEqual(leftBuffer, rightBuffer)
  } catch {
    return false
  }
}

const normalizeRecord = (record) => {
  const customerId = String(record?.customerId ?? '').trim()
  const tokenHash = String(record?.tokenHash ?? '').trim().toLowerCase()
  const createdAt = Number(record?.createdAt)
  const expiresAt = Number(record?.expiresAt)
  if (!customerId || !/^[a-f0-9]{64}$/.test(tokenHash) || !Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) {
    return null
  }
  return { customerId, tokenHash, createdAt, expiresAt }
}

const queueTokenWrite = (operation) => {
  const result = tokenWriteQueue.then(operation, operation)
  tokenWriteQueue = result.catch(() => undefined)
  return result
}

const writeRecordsAtomic = (records) => {
  const tempFile = path.join(
    path.dirname(resetTokensFile),
    `.${path.basename(resetTokensFile)}.${process.pid}.${Date.now()}.${atomicWriteCounter += 1}.tmp`,
  )
  let fileDescriptor = null

  try {
    fileDescriptor = fs.openSync(tempFile, 'wx')
    fs.writeFileSync(fileDescriptor, JSON.stringify({ tokens: records }, null, 2), 'utf8')
    fs.fsyncSync(fileDescriptor)
    fs.closeSync(fileDescriptor)
    fileDescriptor = null
    fs.renameSync(tempFile, resetTokensFile)
  } catch (error) {
    if (fileDescriptor !== null) {
      fs.closeSync(fileDescriptor)
    }
    try {
      fs.unlinkSync(tempFile)
    } catch {
      // The temporary file may not exist or may already have been renamed.
    }
    throw error
  }
}

export const ensurePasswordResetStore = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  if (!fs.existsSync(resetTokensFile)) {
    writeRecordsAtomic([])
  }
}

const readRecords = () => {
  ensurePasswordResetStore()
  try {
    const raw = fs.readFileSync(resetTokensFile, 'utf8')
    if (!raw.trim()) {
      return []
    }
    const parsed = JSON.parse(raw)
    const source = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.tokens) ? parsed.tokens : []
    return source.map(normalizeRecord).filter(Boolean)
  } catch (error) {
    console.error('[password-reset] Failed to read reset token store. Existing token data was not modified.')
    throw new Error('Password reset token store could not be read.', { cause: error })
  }
}

export const createPasswordResetToken = (customerId, { now = Date.now(), ttlMs = defaultTokenTtlMs } = {}) =>
  queueTokenWrite(async () => {
    const normalizedCustomerId = String(customerId ?? '').trim()
    if (!normalizedCustomerId) {
      throw new Error('Customer ID is required for a password reset token.')
    }

    const token = crypto.randomBytes(32).toString('base64url')
    const tokenHash = hashToken(token)
    const records = readRecords().filter(
      (record) => record.expiresAt > now && record.customerId !== normalizedCustomerId,
    )
    records.push({
      customerId: normalizedCustomerId,
      tokenHash,
      createdAt: now,
      expiresAt: now + Math.max(1, Number(ttlMs) || defaultTokenTtlMs),
    })
    writeRecordsAtomic(records)
    return token
  })

export const validatePasswordResetToken = (token, { now = Date.now() } = {}) => {
  const candidateHash = hashToken(token)
  const match = readRecords().find(
    (record) => record.expiresAt > now && safeTokenHashEqual(record.tokenHash, candidateHash),
  )
  return match ? { customerId: match.customerId, expiresAt: match.expiresAt } : null
}

export const consumePasswordResetToken = (token, { now = Date.now() } = {}) =>
  queueTokenWrite(async () => {
    const candidateHash = hashToken(token)
    const records = readRecords()
    const match = records.find(
      (record) => record.expiresAt > now && safeTokenHashEqual(record.tokenHash, candidateHash),
    )
    if (!match) {
      return null
    }

    writeRecordsAtomic(
      records.filter(
        (record) => record.expiresAt > now && !safeTokenHashEqual(record.tokenHash, candidateHash),
      ),
    )
    return { customerId: match.customerId }
  })

export const revokePasswordResetToken = (token) =>
  queueTokenWrite(async () => {
    const candidateHash = hashToken(token)
    const records = readRecords()
    const nextRecords = records.filter((record) => !safeTokenHashEqual(record.tokenHash, candidateHash))
    if (nextRecords.length !== records.length) {
      writeRecordsAtomic(nextRecords)
    }
  })

export const revokePasswordResetTokensForCustomer = (customerId) =>
  queueTokenWrite(async () => {
    const normalizedCustomerId = String(customerId ?? '').trim()
    const records = readRecords()
    const nextRecords = records.filter((record) => record.customerId !== normalizedCustomerId)
    if (nextRecords.length !== records.length) {
      writeRecordsAtomic(nextRecords)
    }
  })

export const getPasswordResetTokenFilePath = () => resetTokensFile
