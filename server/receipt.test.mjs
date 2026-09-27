import assert from 'node:assert/strict'
import test from 'node:test'
import nodemailer from 'nodemailer'
import { createReceiptAttachment, createReceiptPdf, getReceiptFilename, isPaidPaytrailOrder } from './receipt.mjs'

const paidOrder = {
  id: '12046',
  paymentMethod: 'paytrail',
  paymentStatus: 'paid',
  paytrail: { lastUpdatedAt: '2026-09-27T09:30:00.000Z' },
  customer: {
    company: 'Malliyritys Oy',
    contact: 'Testi Asiakas',
    email: 'asiakas@example.com',
    phone: '+358 40 123 4567',
    businessId: '1234567-8',
    address: 'Esimerkkikatu 10',
    zip: '00100',
    city: 'Helsinki',
    deliveryDate: '2026-09-29',
  },
  items: [
    {
      productId: 'product-1',
      sku: '290067',
      name: 'Tork H1 Matic Advanced rullakasipyyhe 2-krs',
      quantity: 2,
      unitPrice: 25.9,
      priceUnit: 'EUR / Laatikko',
      selectedOptions: [{ groupName: 'Yksikko', valueLabel: 'Laatikko', valueDetail: '6 rullaa' }],
    },
  ],
  subtotal: 51.8,
  shipping: 15,
  total: 66.8,
  vatAmount: 17.03,
  grossTotal: 83.83,
}

test('receipt is generated in memory without mutating the paid order', async () => {
  const before = structuredClone(paidOrder)
  const pdf = await createReceiptPdf(paidOrder, { generatedAt: new Date('2026-09-27T09:30:00.000Z') })

  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-')
  assert.ok(pdf.length > 5_000)
  assert.deepEqual(paidOrder, before)
})

test('receipt cannot be generated before a Paytrail payment is paid', async () => {
  await assert.rejects(
    createReceiptPdf({ ...paidOrder, paymentStatus: 'pending' }),
    /paid Paytrail order/,
  )
  await assert.rejects(
    createReceiptPdf({ ...paidOrder, paymentMethod: 'invoice' }),
    /paid Paytrail order/,
  )
})

test('receipt attachment is created only after a successful Paytrail payment', async () => {
  assert.equal(isPaidPaytrailOrder(paidOrder), true)
  assert.equal(await createReceiptAttachment({ ...paidOrder, paymentStatus: 'pending' }), null)
  assert.equal(await createReceiptAttachment({ ...paidOrder, paymentMethod: 'invoice' }), null)

  const attachment = await createReceiptAttachment(paidOrder)
  assert.equal(attachment.filename, 'kuitti-12046.pdf')
  assert.equal(attachment.contentType, 'application/pdf')
  assert.equal(attachment.content.subarray(0, 5).toString('ascii'), '%PDF-')
})

test('receipt filename contains only safe characters', () => {
  assert.equal(getReceiptFilename('SPT / 12046'), 'kuitti-SPT-12046.pdf')
})

test('Nodemailer accepts the receipt attachment without opening an SMTP connection', async () => {
  const pdf = await createReceiptPdf(paidOrder)
  const transporter = nodemailer.createTransport({ jsonTransport: true })
  const result = await transporter.sendMail({
    from: 'Suomen Paperitukku <info@suomenpaperitukku.fi>',
    to: paidOrder.customer.email,
    subject: `Tilausvahvistus ${paidOrder.id}`,
    html: '<p>Maksukuitti on viestin PDF-liitteena.</p>',
    attachments: [
      {
        filename: getReceiptFilename(paidOrder.id),
        content: pdf,
        contentType: 'application/pdf',
      },
    ],
  })
  const message = JSON.parse(result.message)

  assert.equal(message.to[0].address, paidOrder.customer.email)
  assert.equal(message.attachments.length, 1)
  assert.equal(message.attachments[0].filename, 'kuitti-12046.pdf')
  assert.equal(message.attachments[0].contentType, 'application/pdf')
  assert.equal(Buffer.from(message.attachments[0].content, 'base64').subarray(0, 5).toString('ascii'), '%PDF-')
})
