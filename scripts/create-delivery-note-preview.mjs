import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDeliveryNotePdf } from '../server/delivery-note.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const outputPath = path.join(projectRoot, 'output', 'pdf', 'spt-lahete-esikatselu.pdf')

const previewOrder = {
  id: '12045',
  shippedAt: '2026-09-25T09:00:00.000Z',
  customer: {
    company: 'Malliyritys Oy',
    contact: 'Maija Mallikas',
    email: 'maija.mallikas@example.com',
    phone: '+358 40 123 4567',
    address: 'Esimerkkikatu 10',
    zip: '00100',
    city: 'Helsinki',
    deliveryDate: '2026-09-26',
    notes: 'Toimitus pääoven vastaanottoon. Soita saavuttaessa.',
  },
  items: [
    { sku: '87181', name: 'Katrin Plus Non Stop M käsipyyhe 2-krs Z-taitto valkoinen 2835 ark', quantity: 20, priceUnit: 'EUR / Säkki' },
    { sku: '96060', name: 'Katrin 300 wc-paperi 2-krs valkoinen 37,5 m / 40 rll', quantity: 40, priceUnit: 'EUR / Säkki' },
    { sku: '680008', name: 'Tork T8 SmartOne -annostelija wc-paperirullalle musta', quantity: 2, priceUnit: 'EUR / Kappale' },
    { sku: '2974930', name: 'Tork T8 SmartOne wc-paperi 2-krs valkoinen 6 rll', quantity: 4, priceUnit: 'EUR / Laatikko' },
    { sku: 'VS214', name: 'Sini Pro rikkalapio 214 sininen', quantity: 2, priceUnit: 'EUR / Kappale' },
    { sku: '234', name: 'Sini Pro lattiaharja 234 sininen puolipitkävartinen', quantity: 2, priceUnit: 'EUR / Kappale' },
    { sku: '50101104', name: 'Wellgio nitriilikäsine sininen koko L 100 kpl', quantity: 10, priceUnit: 'EUR / Rasia' },
    { sku: '100145', name: "Vileda Quick'n Dry sienipyyhe sininen 25 cm / 10 m", quantity: 4, priceUnit: 'EUR / Rulla' },
    { sku: '3015104', name: 'Clean roskapussi 30 L musta LD 500x700 / 0,02 50 kpl', quantity: 60, priceUnit: 'EUR / Rulla' },
    { sku: '3010103', name: 'Clean jätesäkki 150 L LD musta 750x1150 mm / 0,04 10 kpl', quantity: 60, priceUnit: 'EUR / Rulla' },
  ],
}

await fs.mkdir(path.dirname(outputPath), { recursive: true })
const pdf = await createDeliveryNotePdf(previewOrder, {
  generatedAt: new Date('2026-09-25T09:00:00.000Z'),
})
await fs.writeFile(outputPath, pdf)
console.log(outputPath)
