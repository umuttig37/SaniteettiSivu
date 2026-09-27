import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { renderGoogleMerchantXml } from './merchant-feed.mjs'
import { getCategoryPath, renderProductPage, renderSitemapXml, renderSpaPage } from './site-render.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testTempDir = path.resolve(__dirname, '..', 'tmp')

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
  fs.mkdirSync(testTempDir, { recursive: true })
  const root = fs.mkdtempSync(path.join(testTempDir, 'paperitukku-catalog-test-'))
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
    const result = await isolated.store.updateProductCategory('product-main', 'child')
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

test('category-only update refreshes cache and preserves SEO and catalog output', async () => {
  const fixture = createCatalog()
  fixture.products[0].image = 'data:image/png;base64,AAAA-category-regression-image'
  fixture.products[0].images = [fixture.products[0].image]
  const isolated = await createIsolatedStore(JSON.stringify(fixture, null, 2))

  try {
    const before = JSON.parse(fs.readFileSync(isolated.catalogPath, 'utf8'))
    const beforeTarget = structuredClone(before.products.find((product) => product.id === 'product-main'))
    const beforeSitemap = renderSitemapXml({ siteUrl: 'https://example.test', catalog: before })
    const beforeProductHtml = renderProductPage({
      siteUrl: 'https://example.test',
      catalog: before,
      product: beforeTarget,
      category: before.categories.find((category) => category.id === beforeTarget.category),
      related: [],
    })

    await isolated.store.updateProductCategory('product-main', 'child')

    const after = JSON.parse(fs.readFileSync(isolated.catalogPath, 'utf8'))
    const cached = isolated.store.readCatalog()
    const afterTarget = after.products.find((product) => product.id === 'product-main')
    const cachedTarget = cached.products.find((product) => product.id === 'product-main')
    const { category: beforeCategory, updatedAt: beforeUpdatedAt, ...beforeStable } = beforeTarget
    const { category: afterCategory, updatedAt: afterUpdatedAt, ...afterStable } = afterTarget

    assert.equal(beforeCategory, 'main')
    assert.equal(afterCategory, 'child')
    assert.notEqual(afterUpdatedAt, beforeUpdatedAt)
    assert.deepEqual(afterStable, beforeStable)
    assert.deepEqual(after.products.filter((product) => product.id !== 'product-main'), before.products.filter((product) => product.id !== 'product-main'))
    assert.equal(after.products.length, before.products.length)
    assert.equal(afterTarget.image, beforeTarget.image)
    assert.deepEqual(afterTarget.images, beforeTarget.images)
    assert.equal(cachedTarget.category, 'child')
    assert.equal(cachedTarget.updatedAt, afterTarget.updatedAt)

    const afterSitemap = renderSitemapXml({ siteUrl: 'https://example.test', catalog: after })
    const beforeLocations = Array.from(beforeSitemap.matchAll(/<loc>(.*?)<\/loc>/g), (match) => match[1])
    const afterLocations = Array.from(afterSitemap.matchAll(/<loc>(.*?)<\/loc>/g), (match) => match[1])
    assert.deepEqual(afterLocations, beforeLocations)

    const afterProductHtml = renderProductPage({
      siteUrl: 'https://example.test',
      catalog: after,
      product: afterTarget,
      category: after.categories.find((category) => category.id === afterTarget.category),
      related: [],
    })
    assert.equal((afterProductHtml.match(/\"@type\":\"Product\"/g) ?? []).length, 1)
    assert.match(afterProductHtml, /<link rel="canonical" href="https:\/\/example\.test\/tuote\/product-main"/)
    assert.match(afterProductHtml, new RegExp(beforeTarget.name))
    assert.match(beforeProductHtml, new RegExp(beforeTarget.name))

    const merchantXml = renderGoogleMerchantXml({ siteUrl: 'https://example.test', catalog: after })
    assert.match(merchantXml, /<g:link>https:\/\/example\.test\/tuote\/product-main<\/g:link>/)
    assert.match(merchantXml, new RegExp(beforeTarget.name))

    const mainHtml = renderSpaPage({
      siteUrl: 'https://example.test',
      catalog: after,
      route: { type: 'home', categorySlug: 'main' },
    })
    const childHtml = renderSpaPage({
      siteUrl: 'https://example.test',
      catalog: after,
      route: { type: 'home', categorySlug: 'child' },
    })
    assert.match(mainHtml, /href="\/tuote\/product-main"/)
    assert.match(childHtml, /href="\/tuote\/product-main"/)
    assert.equal(
      cached.products.some((product) =>
        [product.name, ...(product.searchKeywords ?? [])].join(' ').toLocaleLowerCase('fi').includes(beforeTarget.name.toLocaleLowerCase('fi')),
      ),
      true,
    )
  } finally {
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})

test('concurrent category-only updates are serialized without losing either change', async () => {
  const isolated = await createIsolatedStore(JSON.stringify(createCatalog(), null, 2))

  try {
    await Promise.all([
      isolated.store.updateProductCategory('product-main', 'child'),
      isolated.store.updateProductCategory('product-child', 'muut'),
    ])

    const after = JSON.parse(fs.readFileSync(isolated.catalogPath, 'utf8'))
    assert.equal(after.products.find((product) => product.id === 'product-main').category, 'child')
    assert.equal(after.products.find((product) => product.id === 'product-child').category, 'muut')
    assert.equal(after.products.length, 3)
    assert.equal(fs.readdirSync(path.dirname(isolated.catalogPath)).some((name) => name.endsWith('.tmp')), false)
  } finally {
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})

test('a failed streamed category update never replaces the existing catalog', async () => {
  const fixture = createCatalog()
  fixture.products.push(createProduct({ id: 'product-main', slug: 'duplicate-id', sku: 'DUPLICATE-ID' }))
  const originalContent = JSON.stringify(fixture, null, 2)
  const isolated = await createIsolatedStore(originalContent)

  try {
    await assert.rejects(
      isolated.store.updateProductCategory('product-main', 'child'),
      /not found uniquely/,
    )
    assert.equal(fs.readFileSync(isolated.catalogPath, 'utf8'), originalContent)
    assert.equal(fs.readdirSync(path.dirname(isolated.catalogPath)).some((name) => name.endsWith('.tmp')), false)
  } finally {
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})

test('a concurrent catalog write makes the streamed update abort safely', async () => {
  const fixture = createCatalog()
  fixture.products[0].image = `data:image/png;base64,${'A'.repeat(4_000_000)}`
  fixture.products[0].images = [fixture.products[0].image]
  const originalContent = JSON.stringify(fixture)
  const isolated = await createIsolatedStore(originalContent)

  try {
    const updatePromise = isolated.store.updateProductCategory('product-main', 'child')
    let temporaryFileObserved = false

    for (let attempt = 0; attempt < 2_000; attempt += 1) {
      if (fs.readdirSync(path.dirname(isolated.catalogPath)).some((name) => name.endsWith('.tmp'))) {
        temporaryFileObserved = true
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 1))
    }

    assert.equal(temporaryFileObserved, true)
    fs.appendFileSync(isolated.catalogPath, ' ')
    await assert.rejects(updatePromise, /Catalog changed during category update/)
    assert.equal(fs.readFileSync(isolated.catalogPath, 'utf8'), `${originalContent} `)
    assert.equal(fs.readdirSync(path.dirname(isolated.catalogPath)).some((name) => name.endsWith('.tmp')), false)
  } finally {
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})

test('normal product creation and editing still use the existing full update path', async () => {
  const isolated = await createIsolatedStore(JSON.stringify(createCatalog(), null, 2))

  try {
    const before = isolated.store.readCatalog()
    const next = isolated.store.upsertProduct(
      createProduct({ id: 'new-product', slug: 'new-product', name: 'New product', sku: 'NEW-1' }),
    )

    assert.equal(next.products.length, before.products.length + 1)
    assert.equal(next.products.some((product) => product.id === 'new-product'), true)
    assert.equal(next.products.some((product) => product.id === 'product-main'), true)

    const existing = next.products.find((product) => product.id === 'product-main')
    const edited = isolated.store.upsertProduct({ ...existing, description: 'Edited through the normal product path' })
    const editedProduct = edited.products.find((product) => product.id === 'product-main')
    assert.equal(edited.products.length, next.products.length)
    assert.equal(editedProduct.description, 'Edited through the normal product path')
    assert.equal(editedProduct.slug, existing.slug)
    assert.equal(editedProduct.createdAt, existing.createdAt)
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
  assert.match(mainHtml, /href="\/child"/)
  assert.doesNotMatch(mainHtml, /href="\/tuote\/product-transition"/)
  assert.doesNotMatch(mainHtml, /class="hero"/)
  assert.doesNotMatch(mainHtml, /Suosittelemme juuri nyt/)
  assert.match(mainHtml, /<h1>Main<\/h1>/)
  assert.match(childHtml, /href="\/tuote\/product-child"/)
  assert.doesNotMatch(childHtml, /href="\/tuote\/product-main"/)
  assert.match(homeHtml, /href="\/tuote\/product-transition"/)
  assert.match(homeHtml, /class="nav-button header-contact-link" href="\/#contact">Yhteystiedot<\/a>/)
  assert.match(mainHtml, /<link rel="canonical" href="https:\/\/example\.test\/main"/)
  assert.match(childHtml, /<link rel="canonical" href="https:\/\/example\.test\/child"/)
  assert.doesNotMatch(mainHtml, /\?category=/)
})

test('product pages retain one canonical URL and Product structured data', () => {
  const catalog = createCatalog()
  const product = {
    ...catalog.products[1],
    name: 'Tork Existing product',
    seoTitle: 'Tork Existing | Suomen Paperitukku',
  }
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
  assert.match(html, /"brand":\{"@type":"Brand","name":"Tork"\}/)
  assert.equal((html.match(/"@type":"Product"/g) ?? []).length, 1)
  assert.equal((html.match(/data-seo="structured-data"/g) ?? []).length, 1)
  assert.match(html, /https:\/\/example\.test\/child/)
  assert.match(html, /<title>Tork Existing product \| Suomen Paperitukku<\/title>/)
})

test('sitemap includes every existing product and category URL', () => {
  const catalog = createCatalog()
  const sitemap = renderSitemapXml({ siteUrl: 'https://example.test', catalog })

  for (const product of catalog.products) {
    assert.match(sitemap, new RegExp(`https://example\\.test/tuote/${product.slug}`))
  }
  assert.match(sitemap, /https:\/\/example\.test\/main/)
  assert.match(sitemap, /https:\/\/example\.test\/child/)
  assert.doesNotMatch(sitemap, /\?category=/)
  const locations = Array.from(sitemap.matchAll(/<loc>(.*?)<\/loc>/g), (match) => match[1])
  assert.equal(new Set(locations).size, locations.length)
})

test('reserved application paths use a conflict-free category URL', () => {
  assert.equal(getCategoryPath({ id: 'kassa', slug: 'kassa' }), '/kategoria/kassa')
  assert.equal(getCategoryPath({ id: 'pesuaineet', slug: 'pesuaineet' }), '/pesuaineet')
})

test('initial HTML only embeds products relevant to the rendered page', () => {
  const catalog = createCatalog()
  const productHtml = renderProductPage({
    siteUrl: 'https://example.test',
    catalog,
    product: catalog.products[0],
    category: catalog.categories[0],
    related: [],
  })
  const childHtml = renderSpaPage({
    siteUrl: 'https://example.test',
    catalog,
    route: { type: 'home', categorySlug: 'child' },
  })

  assert.doesNotMatch(productHtml, /product-transition/)
  assert.doesNotMatch(productHtml, /product-child/)
  assert.doesNotMatch(childHtml, /product-transition/)
  assert.doesNotMatch(childHtml, /product-main/)
})
