import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'
import {
  MAX_INVOICE_FILE_BYTES,
  createInvoiceComparisonStore,
  receiveInvoiceComparisonUpload,
  serializeInvoiceComparisonForAdmin,
} from './invoice-comparison-store.mjs'

const fields = {
  company: 'Testiyritys Oy',
  contactName: 'Testi Henkilö',
  email: 'testi@example.com',
  phone: '040 123 4567',
  message: 'Testiviesti',
}

const createMultipartRequest = ({ file, filename, mimeType }) => {
  const boundary = `----spt-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const chunks = []
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`))
  }
  chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="invoice"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`))
  chunks.push(file)
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`))
  const body = Buffer.concat(chunks)
  const request = Readable.from(body)
  request.headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
    'content-length': String(body.length),
  }
  return request
}

const withTempStore = async (callback) => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'spt-invoice-comparison-'))
  const store = createInvoiceComparisonStore({ rootDir })
  try {
    await callback(store)
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true })
  }
}

const validFiles = [
  { name: 'PDF', filename: 'lasku.pdf', mimeType: 'application/pdf', bytes: Buffer.from('%PDF-1.7\nmock') },
  { name: 'JPG', filename: 'lasku.jpg', mimeType: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]) },
  { name: 'PNG', filename: 'lasku.png', mimeType: 'image/png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]) },
  { name: 'WebP', filename: 'lasku.webp', mimeType: 'image/webp', bytes: Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]) },
  { name: 'HEIC from a phone with a generic MIME type', filename: 'lasku.heic', mimeType: 'application/octet-stream', expectedMime: 'image/heic', bytes: Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]) },
  { name: 'HEIF', filename: 'lasku.heif', mimeType: 'image/heif', bytes: Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31]) },
  { name: 'AVIF', filename: 'lasku.avif', mimeType: 'image/avif', bytes: Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]) },
  { name: 'GIF', filename: 'lasku.gif', mimeType: 'image/gif', bytes: Buffer.from('GIF89a') },
  { name: 'BMP', filename: 'lasku.bmp', mimeType: 'image/bmp', bytes: Buffer.from([0x42, 0x4d, 0, 0]) },
  { name: 'TIFF', filename: 'lasku.tiff', mimeType: 'image/tiff', bytes: Buffer.from([0x49, 0x49, 0x2a, 0x00]) },
]

for (const fixture of validFiles) {
  test(`${fixture.name} upload is streamed and stored`, async () => {
    await withTempStore(async (store) => {
      await store.ensure()
      const upload = await receiveInvoiceComparisonUpload(
        createMultipartRequest({ file: fixture.bytes, filename: fixture.filename, mimeType: fixture.mimeType }),
        { uploadsDir: store.uploadsDir },
      )
      const record = await store.create(upload.fields, upload.attachment)
      const attachment = await store.getAttachment(record.id)

      assert.equal(record.company, fields.company)
      assert.equal(record.status, 'new')
      assert.equal(attachment?.record.attachment.mimeType, fixture.expectedMime ?? fixture.mimeType)
      assert.deepEqual(await fs.promises.readFile(attachment.filePath), fixture.bytes)
    })
  })
}

test('upload accepts a file that is exactly 10 MiB', async () => {
  await withTempStore(async (store) => {
    await store.ensure()
    const file = Buffer.alloc(MAX_INVOICE_FILE_BYTES, 0x61)
    file.write('%PDF-', 0, 'ascii')
    const upload = await receiveInvoiceComparisonUpload(
      createMultipartRequest({ file, filename: 'lasku.pdf', mimeType: 'application/pdf' }),
      { uploadsDir: store.uploadsDir },
    )

    assert.equal(upload.attachment.size, MAX_INVOICE_FILE_BYTES)
    assert.equal((await fs.promises.stat(path.join(store.uploadsDir, upload.attachment.storedName))).size, MAX_INVOICE_FILE_BYTES)
  })
})

test('oversized upload is rejected and temp file is removed', async () => {
  await withTempStore(async (store) => {
    await store.ensure()
    const request = createMultipartRequest({
      file: Buffer.alloc(MAX_INVOICE_FILE_BYTES + 1, 0x61),
      filename: 'lasku.pdf',
      mimeType: 'application/pdf',
    })

    await assert.rejects(
      receiveInvoiceComparisonUpload(request, { uploadsDir: store.uploadsDir }),
      /enintään 10 Mt/,
    )
    assert.deepEqual(await fs.promises.readdir(store.uploadsDir), [])
  })
})

test('wrong file type is rejected even when its declared MIME type is allowed', async () => {
  await withTempStore(async (store) => {
    await store.ensure()
    const request = createMultipartRequest({
      file: Buffer.from('not a real PDF'),
      filename: 'lasku.pdf',
      mimeType: 'application/pdf',
    })

    await assert.rejects(
      receiveInvoiceComparisonUpload(request, { uploadsDir: store.uploadsDir }),
      /PDF tai tuettu kuvatiedosto/,
    )
    assert.deepEqual(await fs.promises.readdir(store.uploadsDir), [])
  })
})

test('phone number is required by server-side validation', async () => {
  await withTempStore(async (store) => {
    await store.ensure()

    await assert.rejects(
      store.create({ ...fields, phone: '' }, {
        storedName: 'phone-required.pdf',
        originalName: 'lasku.pdf',
        mimeType: 'application/pdf',
        size: 10,
      }),
      /puhelin/,
    )
    assert.deepEqual(await store.list(), [])
  })
})

test('records are newest-first and admin status and note are persisted', async () => {
  await withTempStore(async (store) => {
    await store.ensure()
    const first = await store.create(fields, {
      storedName: 'first.pdf',
      originalName: 'first.pdf',
      mimeType: 'application/pdf',
      size: 10,
    })
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = await store.create({ ...fields, company: 'Uudempi Oy' }, {
      storedName: 'second.pdf',
      originalName: 'second.pdf',
      mimeType: 'application/pdf',
      size: 10,
    })
    const updated = await store.update(first.id, { status: 'offer_sent', internalNote: 'Tarjous lähetetty 1.10.' })
    const records = await store.list()

    assert.equal(records[0].id, second.id)
    assert.equal(updated.status, 'offer_sent')
    assert.equal(updated.internalNote, 'Tarjous lähetetty 1.10.')
    assert.equal(records.find((item) => item.id === first.id)?.status, 'offer_sent')
  })
})

test('admin response omits stored filename while protected lookup still uses request id', async () => {
  await withTempStore(async (store) => {
    await store.ensure()
    const storedName = 'protected.pdf'
    const bytes = Buffer.from('%PDF-1.7\nprotected')
    await fs.promises.writeFile(path.join(store.uploadsDir, storedName), bytes)
    const record = await store.create(fields, {
      storedName,
      originalName: 'lasku.pdf',
      mimeType: 'application/pdf',
      size: bytes.length,
    })

    const adminRecord = serializeInvoiceComparisonForAdmin(record)
    const attachment = await store.getAttachment(record.id)

    assert.equal(Object.hasOwn(adminRecord.attachment, 'storedName'), false)
    assert.equal(attachment?.record.id, record.id)
    assert.deepEqual(await fs.promises.readFile(attachment.filePath), bytes)
  })
})
