import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_IMAGE_PAYLOAD_BYTES = 65_300

const categories = [
  { id: 'main', slug: 'main', nameFi: 'Pääkategoria', nameEn: 'Main category' },
  { id: 'child', slug: 'child', nameFi: 'Alakategoria', nameEn: 'Subcategory', parentId: 'main' },
  { id: 'muut', slug: 'muut', nameFi: 'Muut', nameEn: 'Other' },
]

const createProduct = (index, imagePayload) => {
  const serial = String(index + 1).padStart(6, '0')
  const image = `data:image/png;base64,${imagePayload}`
  const timestamp = '2026-01-01T00:00:00.000Z'

  return {
    id: `product-${serial}`,
    slug: `realistic-product-${serial}`,
    name: `Realistic hygiene product ${serial}`,
    category: index % 3 === 0 ? 'child' : 'main',
    price: Number((4.5 + (index % 150) / 10).toFixed(2)),
    priceUnit: 'EUR / kpl',
    unitNote: 'Myyntierä 1 laatikko',
    sku: `SPT-${serial}`,
    ean: `640000${serial}`,
    gtin: `0640000${serial}`,
    mpn: `MFG-${serial}`,
    brand: index % 2 === 0 ? 'Tork' : 'Katrin',
    manufacturer: index % 2 === 0 ? 'Essity' : 'Metsä Tissue',
    stock: 25 + (index % 80),
    image,
    images: [image],
    description: `Realistinen yrityskäyttöön tarkoitettu hygieniatuote ${serial}. Tuotekuvaus sisältää käyttökohteen, materiaalin, pakkauskoon ja toimitustiedot.`,
    featured: index < 12,
    featuredRank: index < 12 ? index + 1 : 999,
    optionGroups: [
      {
        id: 'unit',
        name: 'Yksikkö',
        values: [
          { id: 'piece', label: 'Kappale', detail: '1 kpl', price: Number((4.5 + (index % 150) / 10).toFixed(2)) },
          { id: 'box', label: 'Laatikko', detail: '12 kpl' },
        ],
      },
    ],
    seoTitle: `Realistic hygiene product ${serial} | Suomen Paperitukku`,
    metaDescription: `Tilaa realistic hygiene product ${serial} yritykselle Suomen Paperitukusta nopeasti ja kilpailukykyiseen hintaan.`,
    searchKeywords: [`realistic product ${serial}`, 'hygieniatuote', 'yrityksille', `SPT-${serial}`],
    createdAt: timestamp,
    updatedAt: timestamp,
    customSupplierField: `supplier-value-${serial}`,
  }
}

export const writeCatalogFixture = ({ filePath, productCount, imagePayloadBytes = DEFAULT_IMAGE_PAYLOAD_BYTES }) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const fd = fs.openSync(filePath, 'w')
  const imagePayload = 'A'.repeat(imagePayloadBytes)

  try {
    fs.writeSync(fd, `{\n  "categories": ${JSON.stringify(categories, null, 2).replaceAll('\n', '\n  ')},\n  "products": [`)
    for (let index = 0; index < productCount; index += 1) {
      const serialized = JSON.stringify(createProduct(index, imagePayload), null, 2).replaceAll('\n', '\n    ')
      fs.writeSync(fd, `${index === 0 ? '\n' : ',\n'}    ${serialized}`)
    }
    fs.writeSync(fd, '\n  ]\n}\n')
  } finally {
    fs.closeSync(fd)
  }

  return fs.statSync(filePath)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const [, , filePath, rawCount, rawImageBytes] = process.argv
  const productCount = Number.parseInt(rawCount, 10)
  const imagePayloadBytes = rawImageBytes ? Number.parseInt(rawImageBytes, 10) : DEFAULT_IMAGE_PAYLOAD_BYTES
  if (!filePath || !Number.isInteger(productCount) || productCount < 1) {
    throw new Error('Usage: node scripts/catalog-oom-fixture.mjs <file> <product-count> [image-payload-bytes]')
  }
  const stat = writeCatalogFixture({ filePath, productCount, imagePayloadBytes })
  process.stdout.write(`${JSON.stringify({ filePath: path.resolve(filePath), productCount, bytes: stat.size, mib: stat.size / 1024 / 1024 })}\n`)
}
