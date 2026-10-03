import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import Busboy from 'busboy'

export const INVOICE_COMPARISON_STATUSES = ['new', 'processing', 'offer_sent', 'done']
export const MAX_INVOICE_FILE_BYTES = 10 * 1024 * 1024

const hasIsoBaseMediaBrand = (bytes, brands) =>
  bytes.length >= 12
  && bytes.subarray(4, 8).toString('ascii') === 'ftyp'
  && brands.has(bytes.subarray(8, 12).toString('ascii'))

const acceptedTypes = [
  {
    extensions: ['.pdf'],
    mimeTypes: ['application/pdf', 'application/x-pdf'],
    signature: (bytes) => bytes.subarray(0, 5).toString('ascii') === '%PDF-',
  },
  {
    extensions: ['.jpg', '.jpeg'],
    mimeTypes: ['image/jpeg', 'image/jpg', 'image/pjpeg'],
    signature: (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  {
    extensions: ['.png'],
    mimeTypes: ['image/png', 'image/x-png'],
    signature: (bytes) =>
      bytes.length >= 8
      && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    extensions: ['.webp'],
    mimeTypes: ['image/webp'],
    signature: (bytes) =>
      bytes.length >= 12
      && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
      && bytes.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    extensions: ['.heic', '.heif'],
    mimeTypes: ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'],
    signature: (bytes) => hasIsoBaseMediaBrand(bytes, new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'])),
  },
  {
    extensions: ['.avif'],
    mimeTypes: ['image/avif'],
    signature: (bytes) => hasIsoBaseMediaBrand(bytes, new Set(['avif', 'avis'])),
  },
  {
    extensions: ['.gif'],
    mimeTypes: ['image/gif'],
    signature: (bytes) => ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii')),
  },
  {
    extensions: ['.bmp'],
    mimeTypes: ['image/bmp', 'image/x-ms-bmp'],
    signature: (bytes) => bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d,
  },
  {
    extensions: ['.tif', '.tiff'],
    mimeTypes: ['image/tiff', 'image/x-tiff'],
    signature: (bytes) =>
      bytes.length >= 4
      && (
        bytes.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00]))
        || bytes.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))
      ),
  },
]

const acceptedExtensions = new Map(
  acceptedTypes.flatMap((type) => type.extensions.map((extension) => [extension, type])),
)

export class InvoiceComparisonError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'InvoiceComparisonError'
    this.status = status
  }
}

export const serializeInvoiceComparisonForAdmin = (record) => ({
  ...record,
  attachment: {
    originalName: record.attachment.originalName,
    mimeType: record.attachment.mimeType,
    size: record.attachment.size,
  },
})

const sanitizeDisplayFilename = (value) => {
  const basename = path.basename(String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ''))
  return (basename || 'lasku').slice(0, 180)
}

const normalizeText = (value, maxLength) => String(value ?? '').trim().slice(0, maxLength)

const validateFields = (rawFields) => {
  const fields = {
    company: normalizeText(rawFields.company, 160),
    contactName: normalizeText(rawFields.contactName, 160),
    email: normalizeText(rawFields.email, 254).toLowerCase(),
    phone: normalizeText(rawFields.phone, 80),
    message: normalizeText(rawFields.message, 3000),
  }

  if (!fields.company || !fields.contactName || !fields.email || !fields.phone) {
    throw new InvoiceComparisonError('Täytä yrityksen nimi, yhteyshenkilö, sähköposti ja puhelin.')
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
    throw new InvoiceComparisonError('Tarkista sähköpostiosoite.')
  }

  return fields
}

const validateFile = ({ bytes, filename, mimeType, size }) => {
  const normalizedMime = String(mimeType ?? '').toLowerCase()
  const extension = path.extname(String(filename ?? '')).toLowerCase()
  const detectedType = acceptedTypes.find((type) => type.signature(bytes))
  const genericMime = !normalizedMime || normalizedMime === 'application/octet-stream'
  const mimeMatches = genericMime || detectedType?.mimeTypes.includes(normalizedMime)

  if (!detectedType || !mimeMatches) {
    throw new InvoiceComparisonError('Laskun pitää olla PDF tai tuettu kuvatiedosto.')
  }
  if (size <= 0) {
    throw new InvoiceComparisonError('Laskutiedosto on tyhjä.')
  }

  const resolvedMime = detectedType.mimeTypes.includes(normalizedMime)
    ? normalizedMime
    : extension === '.heif'
      ? 'image/heif'
      : detectedType.mimeTypes[0]
  const resolvedExtension = acceptedExtensions.get(extension) === detectedType
    ? extension
    : detectedType.extensions[0]
  return { mimeType: resolvedMime, extension: resolvedExtension }
}

const writeJsonAtomically = async (filePath, value) => {
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`
  const handle = await fs.promises.open(tempPath, 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }

  try {
    await fs.promises.rename(tempPath, filePath)
  } catch (error) {
    await fs.promises.unlink(tempPath).catch(() => {})
    throw error
  }
}

export const createInvoiceComparisonStore = ({ rootDir }) => {
  const resolvedRoot = path.resolve(rootDir)
  const uploadsDir = path.join(resolvedRoot, 'uploads')
  const recordsFile = path.join(resolvedRoot, 'requests.json')
  let writeQueue = Promise.resolve()

  const ensure = async () => {
    await fs.promises.mkdir(uploadsDir, { recursive: true, mode: 0o700 })
    try {
      await fs.promises.access(recordsFile, fs.constants.F_OK)
    } catch {
      await writeJsonAtomically(recordsFile, [])
    }
  }

  const readRecords = async () => {
    await ensure()
    const parsed = JSON.parse(await fs.promises.readFile(recordsFile, 'utf8'))
    if (!Array.isArray(parsed)) {
      throw new Error('Invoice comparison store is invalid.')
    }
    return parsed
  }

  const enqueueWrite = (operation) => {
    const next = writeQueue.then(operation, operation)
    writeQueue = next.catch(() => {})
    return next
  }

  const list = async () => {
    const records = await readRecords()
    return records.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
  }

  const create = async (fields, attachment) => enqueueWrite(async () => {
    const records = await readRecords()
    const now = new Date().toISOString()
    const record = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      status: 'new',
      internalNote: '',
      ...validateFields(fields),
      attachment: {
        storedName: attachment.storedName,
        originalName: sanitizeDisplayFilename(attachment.originalName),
        mimeType: attachment.mimeType,
        size: attachment.size,
      },
    }
    records.push(record)
    await writeJsonAtomically(recordsFile, records)
    return record
  })

  const update = async (id, changes) => enqueueWrite(async () => {
    const records = await readRecords()
    const record = records.find((item) => item.id === id)
    if (!record) {
      return null
    }

    const status = String(changes.status ?? '')
    if (!INVOICE_COMPARISON_STATUSES.includes(status)) {
      throw new InvoiceComparisonError('Tuntematon status.')
    }

    record.status = status
    record.internalNote = normalizeText(changes.internalNote, 5000)
    record.updatedAt = new Date().toISOString()
    await writeJsonAtomically(recordsFile, records)
    return record
  })

  const getAttachment = async (id) => {
    const records = await readRecords()
    const record = records.find((item) => item.id === id)
    if (!record?.attachment?.storedName || path.basename(record.attachment.storedName) !== record.attachment.storedName) {
      return null
    }
    const filePath = path.join(uploadsDir, record.attachment.storedName)
    try {
      const stat = await fs.promises.stat(filePath)
      if (!stat.isFile()) {
        return null
      }
      return { record, filePath }
    } catch {
      return null
    }
  }

  const removeAttachment = async (storedName) => {
    if (path.basename(storedName) !== storedName) {
      return
    }
    await fs.promises.unlink(path.join(uploadsDir, storedName)).catch(() => {})
  }

  return { rootDir: resolvedRoot, uploadsDir, recordsFile, ensure, list, create, update, getAttachment, removeAttachment }
}

export const receiveInvoiceComparisonUpload = async (req, { uploadsDir, maxBytes = MAX_INVOICE_FILE_BYTES }) => {
  await fs.promises.mkdir(uploadsDir, { recursive: true, mode: 0o700 })

  let parser
  try {
    parser = Busboy({
      headers: req.headers,
      limits: { fileSize: maxBytes + 1, files: 1, fields: 6, parts: 7, fieldSize: 5000 },
    })
  } catch {
    throw new InvoiceComparisonError('Lomakkeen tiedostolähetys on virheellinen.')
  }

  const fields = {}
  let fileSeen = false
  let fileWasLimited = false
  let fieldWasLimited = false
  let uploadError = null
  let tempPath = null
  let filePromise = Promise.resolve()
  let receivedFile = null

  const cleanup = async () => {
    if (tempPath) {
      await fs.promises.unlink(tempPath).catch(() => {})
    }
  }

  try {
    await new Promise((resolve, reject) => {
      parser.on('field', (name, value, info) => {
        if (info.valueTruncated) {
          fieldWasLimited = true
        }
        if (['company', 'contactName', 'email', 'phone', 'message', 'website'].includes(name)) {
          fields[name] = value
        }
      })

      parser.on('file', (name, file, info) => {
        if (name !== 'invoice' || fileSeen) {
          uploadError = new InvoiceComparisonError('Lähetä vain yksi laskutiedosto.')
          file.resume()
          return
        }

        fileSeen = true
        tempPath = path.join(uploadsDir, `.${crypto.randomUUID()}.uploading`)
        const output = fs.createWriteStream(tempPath, { flags: 'wx', mode: 0o600 })
        let size = 0
        let signatureBytes = Buffer.alloc(0)

        file.on('limit', () => {
          fileWasLimited = true
        })
        file.on('data', (chunk) => {
          size += chunk.length
          if (signatureBytes.length < 16) {
            signatureBytes = Buffer.concat([signatureBytes, chunk]).subarray(0, 16)
          }
        })

        filePromise = pipeline(file, output).then(async () => {
          const handle = await fs.promises.open(tempPath, 'r+')
          try {
            await handle.sync()
          } finally {
            await handle.close()
          }
          receivedFile = { filename: info.filename, mimeType: info.mimeType, size, signatureBytes }
        })
      })

      parser.once('error', reject)
      parser.once('close', resolve)
      req.once('aborted', () => reject(new InvoiceComparisonError('Tiedoston lähetys keskeytyi.')))
      req.pipe(parser)
    })

    await filePromise

    if (uploadError) {
      throw uploadError
    }
    if (fieldWasLimited) {
      throw new InvoiceComparisonError('Yksi lomakkeen kentistä on liian pitkä.')
    }
    if (fileWasLimited) {
      throw new InvoiceComparisonError('Laskutiedosto saa olla enintään 10 Mt.', 413)
    }
    if (!fileSeen || !receivedFile || !tempPath) {
      throw new InvoiceComparisonError('Lisää lasku PDF-tiedostona tai kuvana.')
    }
    if (normalizeText(fields.website, 200)) {
      throw new InvoiceComparisonError('Lomakkeen lähetys estettiin.')
    }

    const validatedFields = validateFields(fields)
    const validatedFile = validateFile({
      bytes: receivedFile.signatureBytes,
      filename: receivedFile.filename,
      mimeType: receivedFile.mimeType,
      size: receivedFile.size,
    })
    const storedName = `${crypto.randomUUID()}${validatedFile.extension}`
    await fs.promises.rename(tempPath, path.join(uploadsDir, storedName))
    tempPath = null

    return {
      fields: validatedFields,
      attachment: {
        storedName,
        originalName: sanitizeDisplayFilename(receivedFile.filename),
        mimeType: validatedFile.mimeType,
        size: receivedFile.size,
      },
    }
  } catch (error) {
    await cleanup()
    throw error
  }
}
