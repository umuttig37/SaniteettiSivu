import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { renderProductPage, renderSitemapXml, renderSpaPage } from './site-render.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const createProduct = (overrides) => ({
  id: 'product-1',
  slug: 'existing-product',
  name: 'Existing product',
  category: 'main',
  price: 10,
  priceUnit: 'EUR / pc',
  sku: 'SKU-1',
  stock: 10,
  image: '/product.svg',
  images: ['/product.svg'],
  description: 'Existing description',
  seoTitle: 'Existing SEO title',
  metaDescription: 'Existing meta description',
  searchKeywords: ['existing', 'product'],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  ...overrides,
})

const createCatalog = () => ({
  categories: [
    { id: 'main', slug: 'main', nameFi: 'Main', nameEn: 'Main' },
    { id: 'child', slug: 'child', nameFi: 'Child', nameEn: 'Child', parentId: 'main' },
    { id: 'muut', slug: 'muut', nameFi: 'Muut', nameEn: 'Other' },
  ],
  products: [
    createProduct({ id: 'product-main', slug: 'product-main', category: 'main', sku: 'MAIN-1' }),
    createProduct({ id: 'product-child', slug: 'product-child', category: 'child', sku: 'CHILD-1' }),
    createProduct({ id: 'product-transition', slug: 'product-transition', category: 'muut', sku: 'OTHER-1' }),
  ],
})

const createIsolatedStore = async (catalogContent) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paperitukku-catalog-test-'))
  const serverDir = path.join(root, 'server')
  const dataDir = path.join(root, 'data')
  fs.mkdirSync(serverDir)
  fs.mkdirSync(dataDir)
  fs.copyFileSync(path.join(__dirname, 'catalog-store.mjs'), path.join(serverDir, 'catalog-store.mjs'))
  fs.copyFileSync(path.join(__dirname, 'catalog.seed.json'), path.join(serverDir, 'catalog.seed.json'))
  const catalogPath = path.join(dataDir, 'catalog.json')
  fs.writeFileSync(catalogPath, catalogContent, 'utf8')
  const moduleUrl = `${pathToFileURL(path.join(serverDir, 'catalog-store.mjs')).href}?test=${Date.now()}-${Math.random()}`
  return { root, catalogPath, store: await import(moduleUrl) }
}

test('category-only update changes only category and updatedAt on one stored product', async () => {
  const fixture = createCatalog()
  const isolated = await createIsolatedStore(JSON.stringify(fixture, null, 2))

  try {
    const before = JSON.parse(fs.readFileSync(isolated.catalogPath, 'utf8'))
    const result = isolated.store.updateProductCategory('product-main', 'child')
    const after = JSON.parse(fs.readFileSync(isolated.catalogPath, 'utf8'))
    const beforeTarget = before.products.find((product) => product.id === 'product-main')
    const afterTarget = after.products.find((product) => product.id === 'product-main')
    const beforeUntouched = before.products.find((product) => product.id === 'product-child')
    const afterUntouched = after.products.find((product) => product.id === 'product-child')
    const { category: beforeCategory, updatedAt: beforeUpdatedAt, ...beforeStable } = beforeTarget
    const { category: afterCategory, updatedAt: afterUpdatedAt, ...afterStable } = afterTarget

    assert.equal(beforeCategory, 'main')
    assert.equal(afterCategory, 'child')
    assert.notEqual(afterUpdatedAt, beforeUpdatedAt)
    assert.deepEqual(afterStable, beforeStable)
    assert.deepEqual(afterUntouched, beforeUntouched)
    assert.equal(after.products.length, before.products.length)
    assert.equal(new Set(after.products.map((product) => product.id)).size, after.products.length)
    assert.equal(result.product.id, 'product-main')
    assert.equal(fs.readdirSync(path.dirname(isolated.catalogPath)).some((name) => name.endsWith('.tmp')), false)
  } finally {
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})

test('an unreadable existing catalog fails without replacing or rewriting it', async () => {
  const invalidCatalog = '{ this is not valid catalog JSON'
  const isolated = await createIsolatedStore(invalidCatalog)
  const originalConsoleError = console.error
  const loggedErrors = []
  console.error = (...args) => loggedErrors.push(args.join(' '))

  try {
    assert.throws(() => isolated.store.ensureCatalogStore(), /Catalog could not be read/)
    assert.equal(fs.readFileSync(isolated.catalogPath, 'utf8'), invalidCatalog)
    assert.equal(loggedErrors.some((message) => message.includes('Existing catalog was not modified')), true)
  } finally {
    console.error = originalConsoleError
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})

test('server-rendered category pages expose product links without JavaScript', () => {
  const catalog = createCatalog()
  const mainHtml = renderSpaPage({
    siteUrl: 'https://example.test',
    catalog,
    route: { type: 'home', categorySlug: 'main' },
  })
  const childHtml = renderSpaPage({
    siteUrl: 'https://example.test',
    catalog,
    route: { type: 'home', categorySlug: 'child' },
  })
  const homeHtml = renderSpaPage({ siteUrl: 'https://example.test', catalog, route: { type: 'home' } })

  assert.match(mainHtml, /href="\/tuote\/product-main"/)
  assert.match(mainHtml, /href="\/tuote\/product-child"/)
  assert.match(mainHtml, /href="\/\?category=child"/)
  assert.doesNotMatch(mainHtml, /href="\/tuote\/product-transition"/)
  assert.match(childHtml, /href="\/tuote\/product-child"/)
  assert.doesNotMatch(childHtml, /href="\/tuote\/product-main"/)
  assert.match(homeHtml, /href="\/tuote\/product-transition"/)
  assert.match(mainHtml, /<link rel="canonical" href="https:\/\/example\.test\/\?category=main"/)
})

test('product pages retain one canonical URL and Product structured data', () => {
  const catalog = createCatalog()
  const product = catalog.products[1]
  const html = renderProductPage({
    siteUrl: 'https://example.test',
    catalog,
    product,
    category: catalog.categories[1],
    related: [],
  })

  assert.match(html, /<link rel="canonical" href="https:\/\/example\.test\/tuote\/product-child"/)
  assert.match(html, /"@type":"Product"/)
  assert.match(html, /"url":"https:\/\/example\.test\/tuote\/product-child"/)
})

test('sitemap includes every existing product and category URL', () => {
  const catalog = createCatalog()
  const sitemap = renderSitemapXml({ siteUrl: 'https://example.test', catalog })

  for (const product of catalog.products) {
    assert.match(sitemap, new RegExp(`https://example\\.test/tuote/${product.slug}`))
  }
  assert.match(sitemap, /https:\/\/example\.test\/\?category=main/)
  assert.match(sitemap, /https:\/\/example\.test\/\?category=child/)
})
