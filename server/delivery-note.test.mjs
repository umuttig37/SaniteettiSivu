import assert from 'node:assert/strict'
import test from 'node:test'
import nodemailer from 'nodemailer'
import { createDeliveryNotePdf, getDeliveryNoteFilename } from './delivery-note.mjs'

const sampleOrder = {
  id: '12045',
  shippedAt: '2026-09-25T09:00:00.000Z',
  customer: {
    company: 'Malliyritys Oy',
    contact: 'Testi Asiakas',
    email: 'asiakas@example.com',
    phone: '+358 40 123 4567',
    address: 'Esimerkkikatu 10',
    zip: '00100',
    city: 'Helsinki',
    deliveryDate: '2026-09-26',
    notes: 'Toimitus pääovelle vastaanottoon.',
  },
  items: [
    {
      productId: 'product-1',
      sku: '290067',
      name: 'Tork H1 Matic Advanced rullakäsipyyhe 2-krs',
      quantity: 3,
      priceUnit: 'EUR / Laatikko',
      selectedOptions: [{ groupName: 'Yksikkö', valueLabel: 'Laatikko', valueDetail: '6 rullaa' }],
    },
  ],
}

test('delivery note is generated in memory without mutating the order', async () => {
  const before = structuredClone(sampleOrder)
  const pdf = await createDeliveryNotePdf(sampleOrder, { generatedAt: new Date('2026-09-25T09:00:00.000Z') })

  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-')
  assert.ok(pdf.length > 5_000)
  assert.deepEqual(sampleOrder, before)
})

test('delivery note filename contains only safe characters', () => {
  assert.equal(getDeliveryNoteFilename('SPT / 12045'), 'lahete-SPT-12045.pdf')
})

test('Nodemailer accepts the delivery note attachment without opening an SMTP connection', async () => {
  const pdf = await createDeliveryNotePdf(sampleOrder)
  const transporter = nodemailer.createTransport({ jsonTransport: true })
  const result = await transporter.sendMail({
    from: 'Suomen Paperitukku <info@suomenpaperitukku.fi>',
    to: 'test@example.com',
    subject: `Tilauksesi on matkalla ${sampleOrder.id}`,
    html: '<p>Tilauksen lähete on tämän viestin PDF-liitteenä.</p>',
    attachments: [
      {
        filename: getDeliveryNoteFilename(sampleOrder.id),
        content: pdf,
        contentType: 'application/pdf',
      },
    ],
  })
  const message = JSON.parse(result.message)

  assert.equal(message.from.address, 'info@suomenpaperitukku.fi')
  assert.equal(message.to[0].address, 'test@example.com')
  assert.equal(message.attachments.length, 1)
  assert.equal(message.attachments[0].filename, 'lahete-12045.pdf')
  assert.equal(message.attachments[0].contentType, 'application/pdf')
  assert.equal(Buffer.from(message.attachments[0].content, 'base64').subarray(0, 5).toString('ascii'), '%PDF-')
})
