import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createReceiptPdf } from '../server/receipt.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const outputPath = path.join(projectRoot, 'output', 'pdf', 'spt-kuitti-esikatselu.pdf')

const sampleOrder = {
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
      sku: '290067',
      name: 'Tork H1 Matic Advanced rullakasipyyhe 2-krs, 150 metria',
      quantity: 2,
      unitPrice: 25.9,
      priceUnit: 'EUR / Laatikko',
      selectedOptions: [{ groupName: 'Yksikko', valueLabel: 'Laatikko', valueDetail: '6 rullaa' }],
    },
    {
      sku: '420501',
      name: 'Tork S1 Mildly Scented nestesaippua 1 L',
      quantity: 3,
      unitPrice: 7.3,
      priceUnit: 'EUR / Pullo',
      selectedOptions: [{ groupName: 'Yksikko', valueLabel: 'Pullo' }],
    },
  ],
  subtotal: 73.7,
  shipping: 15,
  total: 88.7,
  vatAmount: 22.62,
  grossTotal: 111.32,
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, await createReceiptPdf(sampleOrder, { generatedAt: new Date('2026-09-27T09:30:00.000Z') }))
console.log(outputPath)
