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
  featured: false,
  featuredRank: 999,
  optionGroups: [],
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

const listStructuralDifferences = (before, after, currentPath = '') => {
  if (Object.is(before, after)) {
    return []
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const differences = []
    const length = Math.max(before.length, after.length)
    for (let index = 0; index < length; index += 1) {
      differences.push(...listStructuralDifferences(before[index], after[index], `${currentPath}[${index}]`))
    }
    return differences
  }
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    const differences = []
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    for (const key of keys) {
      differences.push(...listStructuralDifferences(before[key], after[key], currentPath ? `${currentPath}.${key}` : key))
    }
    return differences
  }
  return [currentPath]
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

test('category metadata updates preserve every stored product value', async () => {
  const fixture = createCatalog()
  fixture.products[0] = {
    ...fixture.products[0],
    image: `data:image/png;base64,${'A'.repeat(256_000)}`,
    images: [`data:image/png;base64,${'A'.repeat(256_000)}`],
    ean: '6412345678901',
    gtin: '6412345678901',
    mpn: 'MANUFACTURER-123',
    brand: 'Test Brand',
    manufacturer: 'Test Manufacturer',
    customSupplierField: { retained: true, code: 'SUPPLIER-1' },
  }
  const isolated = await createIsolatedStore(JSON.stringify(fixture, null, 2))

  try {
    const before = JSON.parse(fs.readFileSync(isolated.catalogPath, 'utf8'))
    await isolated.store.addCategory({
      id: 'new-parent',
      nameFi: 'Uusi paakategoria',
      nameEn: 'New parent category',
    })
    await isolated.store.addCategory({
      id: 'new-child',
      nameFi: 'Uusi alakategoria',
      nameEn: 'New subcategory',
      parentId: 'new-parent',
    })
    await isolated.store.updateCategory('new-child', {
      nameFi: 'Paivitetty alakategoria',
      nameEn: 'Updated subcategory',
      parentId: 'new-parent',
    })

    const after = JSON.parse(fs.readFileSync(isolated.catalogPath, 'utf8'))
    assert.deepEqual(after.products, before.products)
    assert.equal(after.products.length, before.products.length)
    assert.equal(after.categories.some((category) => category.id === 'new-parent'), true)
    assert.equal(after.categories.some((category) => category.id === 'new-child' && category.parentId === 'new-parent'), true)
    assert.equal(fs.readdirSync(path.dirname(isolated.catalogPath)).some((name) => name.endsWith('.tmp')), false)
  } finally {
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})

test('category metadata and product writes share one queue without data loss', async () => {
  const isolated = await createIsolatedStore(JSON.stringify(createCatalog(), null, 2))

  try {
    const product = isolated.store.readCatalog().products.find((item) => item.id === 'product-main')
    await Promise.all([
      isolated.store.addCategory({ id: 'queued-category', nameFi: 'Jonotettu', nameEn: 'Queued' }),
      isolated.store.upsertProduct({ ...product, description: 'Queued product edit' }),
    ])

    const after = JSON.parse(fs.readFileSync(isolated.catalogPath, 'utf8'))
    assert.equal(after.categories.some((category) => category.id === 'queued-category'), true)
    assert.equal(after.products.find((item) => item.id === product.id).description, 'Queued product edit')
    assert.equal(after.products.length, 3)
    assert.equal(fs.readdirSync(path.dirname(isolated.catalogPath)).some((name) => name.endsWith('.tmp')), false)
  } finally {
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})

test('a failed streamed category metadata write never replaces the existing catalog', async () => {
  const fixture = createCatalog()
  fixture.products[0].image = `data:image/png;base64,${'A'.repeat(4_000_000)}`
  fixture.products[0].images = [fixture.products[0].image]
  const originalContent = JSON.stringify(fixture)
  const isolated = await createIsolatedStore(originalContent)

  try {
    const updatePromise = isolated.store.addCategory({
      id: 'must-not-commit',
      nameFi: 'Ei saa tallentua',
      nameEn: 'Must not commit',
    })
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
    await assert.rejects(updatePromise, /Catalog changed during streamed update/)
    assert.equal(fs.readFileSync(isolated.catalogPath, 'utf8'), `${originalContent} `)
    assert.equal(fs.readdirSync(path.dirname(isolated.catalogPath)).some((name) => name.endsWith('.tmp')), false)
  } finally {
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})

test('streamed product and category deletion preserve unrelated catalog data', async () => {
  const fixture = createCatalog()
  fixture.products[0].customSupplierField = { retained: true }
  const isolated = await createIsolatedStore(JSON.stringify(fixture, null, 2))

  try {
    const beforeProductDelete = JSON.parse(fs.readFileSync(isolated.catalogPath, 'utf8'))
    await isolated.store.deleteProduct('product-transition')
    const afterProductDelete = JSON.parse(fs.readFileSync(isolated.catalogPath, 'utf8'))
    assert.equal(afterProductDelete.products.some((product) => product.id === 'product-transition'), false)
    assert.deepEqual(
      afterProductDelete.products,
      beforeProductDelete.products.filter((product) => product.id !== 'product-transition'),
    )

    const beforeCategoryDelete = structuredClone(afterProductDelete)
    await isolated.store.deleteCategory('child')
    const afterCategoryDelete = JSON.parse(fs.readFileSync(isolated.catalogPath, 'utf8'))
    const beforeMovedProduct = beforeCategoryDelete.products.find((product) => product.id === 'product-child')
    const afterMovedProduct = afterCategoryDelete.products.find((product) => product.id === 'product-child')
    const { category: beforeCategory, updatedAt: beforeUpdatedAt, ...beforeStable } = beforeMovedProduct
    const { category: afterCategory, updatedAt: afterUpdatedAt, ...afterStable } = afterMovedProduct

    assert.equal(beforeCategory, 'child')
    assert.equal(afterCategory, 'muut')
    assert.notEqual(afterUpdatedAt, beforeUpdatedAt)
    assert.deepEqual(afterStable, beforeStable)
    assert.deepEqual(
      afterCategoryDelete.products.filter((product) => product.id !== 'product-child'),
      beforeCategoryDelete.products.filter((product) => product.id !== 'product-child'),
    )
    assert.equal(afterCategoryDelete.categories.some((category) => category.id === 'child'), false)
    assert.equal(fs.readdirSync(path.dirname(isolated.catalogPath)).some((name) => name.endsWith('.tmp')), false)
  } finally {
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})

test('streaming catalog paths preserve JSON semantics for complex product fields', async () => {
  const fixture = createCatalog()
  fixture.products[0] = createProduct({
    id: 'complex-product',
    slug: 'complex-product',
    sku: 'COMPLEX-1',
    name: 'Aanitesti "lainaus" \u{1F600}',
    description: `Ensimmainen rivi\nToinen rivi \\ polku ja "lainaus" ${'\u00e4'.repeat(20_000)}`,
    price: 12.34,
    stock: 0,
    featured: false,
    unitNote: '',
    image: 'https://example.test/images/matto%20kuva.jpg?x=1&y=2',
    images: [
      'https://example.test/images/matto%20kuva.jpg?x=1&y=2',
      'https://example.test/images/toinen-kuva.png',
    ],
    searchKeywords: ['aakkoset', 'lainaus "testi"', 'emoji-\u{1F600}', 'polku\\testi'],
    optionGroups: [
      {
        id: 'nested-group',
        name: 'Sisakkainen ryhma',
        values: [
          { id: 'value-1', label: 'Arvo 1', detail: 'Rivi\n"lainaus"', price: 1.25 },
          { id: 'value-2', label: 'Arvo 2', price: 0 },
        ],
      },
    ],
    nullableField: null,
    booleanField: true,
    numericField: -123.456,
    arrayField: [null, true, false, 0, ''],
    nestedField: { quote: '"', slash: '\\', unicode: 'Aani \u{1F600}', empty: '' },
  })
  const isolated = await createIsolatedStore(JSON.stringify(fixture, null, 2))

  try {
    const before = JSON.parse(fs.readFileSync(isolated.catalogPath, 'utf8'))
    const cached = isolated.store.readCatalog().products.find((product) => product.id === 'complex-product')
    assert.equal(cached.name, fixture.products[0].name)
    assert.equal(cached.description, fixture.products[0].description)
    assert.deepEqual(cached.searchKeywords, fixture.products[0].searchKeywords)
    assert.deepEqual(JSON.parse(JSON.stringify(cached.optionGroups)), fixture.products[0].optionGroups)

    await isolated.store.addCategory({ id: 'json-semantics', nameFi: 'JSON-semantiikka', nameEn: 'JSON semantics' })
    const after = JSON.parse(fs.readFileSync(isolated.catalogPath, 'utf8'))
    assert.deepEqual(after.products, before.products)
    assert.equal(listStructuralDifferences(before.products, after.products).length, 0)
  } finally {
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})

test('targeted product updates have no unexpected field changes', async () => {
  const isolated = await createIsolatedStore(JSON.stringify(createCatalog(), null, 2))

  try {
    const categoryBefore = JSON.parse(fs.readFileSync(isolated.catalogPath, 'utf8'))
    await isolated.store.updateProductCategory('product-main', 'child')
    const categoryAfter = JSON.parse(fs.readFileSync(isolated.catalogPath, 'utf8'))
    const categoryBeforeTarget = categoryBefore.products.find((product) => product.id === 'product-main')
    const categoryAfterTarget = categoryAfter.products.find((product) => product.id === 'product-main')
    assert.deepEqual(
      listStructuralDifferences(categoryBeforeTarget, categoryAfterTarget).sort(),
      ['category', 'updatedAt'],
    )
    assert.deepEqual(
      categoryAfter.products.filter((product) => product.id !== 'product-main'),
      categoryBefore.products.filter((product) => product.id !== 'product-main'),
    )

    const productBefore = JSON.parse(fs.readFileSync(isolated.catalogPath, 'utf8'))
    const cachedProduct = isolated.store.readCatalog().products.find((product) => product.id === 'product-child')
    await isolated.store.upsertProduct({ ...cachedProduct, description: 'Only this description should change' })
    const productAfter = JSON.parse(fs.readFileSync(isolated.catalogPath, 'utf8'))
    const productBeforeTarget = productBefore.products.find((product) => product.id === 'product-child')
    const productAfterTarget = productAfter.products.find((product) => product.id === 'product-child')
    assert.deepEqual(
      listStructuralDifferences(productBeforeTarget, productAfterTarget).sort(),
      ['description', 'updatedAt'],
    )
    assert.deepEqual(
      productAfter.products.filter((product) => product.id !== 'product-child'),
      productBefore.products.filter((product) => product.id !== 'product-child'),
    )
  } finally {
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})

test('queued catalog writes retain every accepted change and recover after failure', async () => {
  const isolated = await createIsolatedStore(JSON.stringify(createCatalog(), null, 2))

  try {
    await Promise.all([
      isolated.store.addCategory({ id: 'queue-parent', nameFi: 'Queue parent', nameEn: 'Queue parent' }),
      isolated.store.addCategory({
        id: 'queue-child',
        nameFi: 'Queue child',
        nameEn: 'Queue child',
        parentId: 'queue-parent',
      }),
    ])

    const product = isolated.store.readCatalog().products.find((item) => item.id === 'product-main')
    await Promise.all([
      isolated.store.addCategory({ id: 'queue-extra', nameFi: 'Queue extra', nameEn: 'Queue extra' }),
      isolated.store.upsertProduct({ ...product, description: 'Concurrent queued edit' }),
    ])

    const productChild = isolated.store.readCatalog().products.find((item) => item.id === 'product-child')
    await Promise.all([
      isolated.store.addCategory({ id: 'rapid-1', nameFi: 'Rapid one', nameEn: 'Rapid one' }),
      isolated.store.addCategory({ id: 'rapid-2', nameFi: 'Rapid two', nameEn: 'Rapid two' }),
      isolated.store.updateCategory('main', { nameFi: 'Main updated', nameEn: 'Main updated', parentId: '' }),
      isolated.store.upsertProduct({ ...productChild, description: 'Rapid queued edit' }),
      isolated.store.updateProductCategory('product-main', 'child'),
    ])

    const after = JSON.parse(fs.readFileSync(isolated.catalogPath, 'utf8'))
    for (const categoryId of ['queue-parent', 'queue-child', 'queue-extra', 'rapid-1', 'rapid-2']) {
      assert.equal(after.categories.some((category) => category.id === categoryId), true)
    }
    assert.equal(after.categories.find((category) => category.id === 'queue-child').parentId, 'queue-parent')
    assert.equal(after.categories.find((category) => category.id === 'main').nameFi, 'Main updated')
    assert.equal(after.products.find((item) => item.id === 'product-main').description, 'Concurrent queued edit')
    assert.equal(after.products.find((item) => item.id === 'product-main').category, 'child')
    assert.equal(after.products.find((item) => item.id === 'product-child').description, 'Rapid queued edit')
    assert.equal(after.products.length, 3)
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(isolated.catalogPath, 'utf8')))
  } finally {
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }

  const duplicateFixture = createCatalog()
  duplicateFixture.products.push(createProduct({ id: 'product-main', slug: 'duplicate-id', sku: 'DUPLICATE-ID' }))
  const recoveryStore = await createIsolatedStore(JSON.stringify(duplicateFixture, null, 2))

  try {
    const failedWrite = recoveryStore.store.updateProductCategory('product-main', 'child')
    const followingWrite = recoveryStore.store.addCategory({
      id: 'after-failure',
      nameFi: 'After failure',
      nameEn: 'After failure',
    })
    await assert.rejects(failedWrite, /not found uniquely/)
    await followingWrite
    const afterRecovery = JSON.parse(fs.readFileSync(recoveryStore.catalogPath, 'utf8'))
    assert.equal(afterRecovery.categories.some((category) => category.id === 'after-failure'), true)
    assert.equal(afterRecovery.products.length, duplicateFixture.products.length)
  } finally {
    fs.rmSync(recoveryStore.root, { recursive: true, force: true })
  }
})

test('readers see only a complete catalog while a streamed write is running', async () => {
  const fixture = createCatalog()
  fixture.products[0].image = `data:image/png;base64,${'A'.repeat(8_000_000)}`
  fixture.products[0].images = [fixture.products[0].image]
  const isolated = await createIsolatedStore(JSON.stringify(fixture))

  try {
    let settled = false
    const writePromise = isolated.store
      .addCategory({ id: 'atomic-reader-test', nameFi: 'Atomic reader', nameEn: 'Atomic reader' })
      .finally(() => {
        settled = true
      })
    let validReads = 0
    let oldReads = 0
    let newReads = 0

    while (!settled && validReads < 100) {
      const observed = JSON.parse(fs.readFileSync(isolated.catalogPath, 'utf8'))
      validReads += 1
      if (observed.categories.some((category) => category.id === 'atomic-reader-test')) {
        newReads += 1
      } else {
        oldReads += 1
      }
      await new Promise((resolve) => setTimeout(resolve, 1))
    }

    await writePromise
    const finalCatalog = JSON.parse(fs.readFileSync(isolated.catalogPath, 'utf8'))
    assert.equal(finalCatalog.categories.some((category) => category.id === 'atomic-reader-test'), true)
    assert.ok(validReads > 0)
    assert.equal(validReads, oldReads + newReads)
    assert.equal(finalCatalog.products.length, fixture.products.length)
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

test('normal product creation and editing stream changes without touching other products', async () => {
  const isolated = await createIsolatedStore(JSON.stringify(createCatalog(), null, 2))

  try {
    const before = structuredClone(isolated.store.readCatalog())
    const newImage = `data:image/png;base64,${'B'.repeat(256_000)}`
    const next = await isolated.store.upsertProduct(
      createProduct({
        id: 'new-product',
        slug: 'new-product',
        name: 'New product',
        sku: 'NEW-1',
        image: newImage,
        images: [newImage],
      }),
    )

    assert.equal(next.products.length, before.products.length + 1)
    const created = next.products.find((product) => product.id === 'new-product')
    assert.equal(created.image, newImage)
    assert.deepEqual(created.images, [newImage])
    assert.deepEqual(next.products.filter((product) => product.id !== 'new-product'), before.products)

    const existing = next.products.find((product) => product.id === 'product-main')
    const replacementImage = `data:image/jpeg;base64,${'C'.repeat(128_000)}`
    const edited = await isolated.store.upsertProduct({
      ...existing,
      image: replacementImage,
      images: [replacementImage],
      description: 'Edited through the normal product path',
    })
    const editedProduct = edited.products.find((product) => product.id === 'product-main')
    assert.equal(edited.products.length, next.products.length)
    assert.equal(editedProduct.description, 'Edited through the normal product path')
    assert.equal(editedProduct.image, replacementImage)
    assert.deepEqual(editedProduct.images, [replacementImage])
    assert.equal(editedProduct.slug, existing.slug)
    assert.equal(editedProduct.createdAt, existing.createdAt)
    assert.deepEqual(
      edited.products.filter((product) => product.id !== 'product-main'),
      next.products.filter((product) => product.id !== 'product-main'),
    )

    const unchangedImageEdit = await isolated.store.upsertProduct({
      ...editedProduct,
      price: 12.5,
    })
    const unchangedImageProduct = unchangedImageEdit.products.find((product) => product.id === 'product-main')
    assert.equal(unchangedImageProduct.price, 12.5)
    assert.equal(unchangedImageProduct.image, replacementImage)
    assert.deepEqual(unchangedImageProduct.images, [replacementImage])
    assert.equal(fs.readdirSync(path.dirname(isolated.catalogPath)).some((name) => name.endsWith('.tmp')), false)
  } finally {
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})

test('normal product updates are serialized with category-only updates', async () => {
  const isolated = await createIsolatedStore(JSON.stringify(createCatalog(), null, 2))

  try {
    const before = isolated.store.readCatalog()
    const productToEdit = before.products.find((product) => product.id === 'product-child')
    await Promise.all([
      isolated.store.updateProductCategory('product-main', 'child'),
      isolated.store.upsertProduct({ ...productToEdit, description: 'Concurrent normal edit' }),
    ])

    const after = JSON.parse(fs.readFileSync(isolated.catalogPath, 'utf8'))
    assert.equal(after.products.find((product) => product.id === 'product-main').category, 'child')
    assert.equal(after.products.find((product) => product.id === 'product-child').description, 'Concurrent normal edit')
    assert.equal(after.products.length, before.products.length)
    assert.equal(new Set(after.products.map((product) => product.id)).size, after.products.length)
  } finally {
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})

test('a failed streamed normal product update never replaces the existing catalog', async () => {
  const fixture = createCatalog()
  fixture.products.push(createProduct({ id: 'product-main', slug: 'duplicate-id', sku: 'DUPLICATE-ID' }))
  const originalContent = JSON.stringify(fixture, null, 2)
  const isolated = await createIsolatedStore(originalContent)

  try {
    const existing = isolated.store.readCatalog().products.find((product) => product.id === 'product-main')
    await assert.rejects(
      isolated.store.upsertProduct({ ...existing, description: 'This must not be committed' }),
      /not found uniquely/,
    )
    assert.equal(fs.readFileSync(isolated.catalogPath, 'utf8'), originalContent)
    assert.equal(fs.readdirSync(path.dirname(isolated.catalogPath)).some((name) => name.endsWith('.tmp')), false)
  } finally {
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})

test('streamed product updates preserve sitemap, merchant feed, search and product SEO', async () => {
  const isolated = await createIsolatedStore(JSON.stringify(createCatalog(), null, 2))

  try {
    const before = structuredClone(isolated.store.readCatalog())
    const existing = before.products.find((product) => product.id === 'product-main')
    const beforeSitemap = renderSitemapXml({ siteUrl: 'https://example.test', catalog: before })
    const editedCatalog = await isolated.store.upsertProduct({
      ...existing,
      stock: 7,
    })
    const edited = editedCatalog.products.find((product) => product.id === existing.id)

    const afterSitemap = renderSitemapXml({ siteUrl: 'https://example.test', catalog: editedCatalog })
    const beforeLocations = Array.from(beforeSitemap.matchAll(/<loc>(.*?)<\/loc>/g), (match) => match[1])
    const afterLocations = Array.from(afterSitemap.matchAll(/<loc>(.*?)<\/loc>/g), (match) => match[1])
    assert.deepEqual(afterLocations, beforeLocations)

    const merchantXml = renderGoogleMerchantXml({ siteUrl: 'https://example.test', catalog: editedCatalog })
    assert.match(merchantXml, /<g:link>https:\/\/example\.test\/tuote\/product-main<\/g:link>/)
    assert.match(merchantXml, new RegExp(existing.name))

    const productHtml = renderProductPage({
      siteUrl: 'https://example.test',
      catalog: editedCatalog,
      product: edited,
      category: editedCatalog.categories.find((category) => category.id === edited.category),
      related: [],
    })
    assert.match(productHtml, /<link rel="canonical" href="https:\/\/example\.test\/tuote\/product-main"/)
    assert.equal((productHtml.match(/"@type":"Product"/g) ?? []).length, 1)
    assert.match(productHtml, new RegExp(existing.name))
    assert.equal(
      editedCatalog.products.some((product) =>
        [product.name, ...(product.searchKeywords ?? [])].join(' ').toLocaleLowerCase('fi').includes(existing.name.toLocaleLowerCase('fi')),
      ),
      true,
    )
  } finally {
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})

test('a newly streamed product is immediately visible to SSR, sitemap and Merchant feed', async () => {
  const isolated = await createIsolatedStore(JSON.stringify(createCatalog(), null, 2))

  try {
    await isolated.store.upsertProduct(
      createProduct({
        id: 'new-visible-product',
        slug: 'new-visible-product',
        name: 'New visible product',
        sku: 'VISIBLE-1',
        category: 'child',
      }),
    )

    const cached = isolated.store.readCatalog()
    const publicCatalog = isolated.store.readPublicCatalog()
    const product = cached.products.find((item) => item.id === 'new-visible-product')
    assert.ok(product)
    assert.ok(publicCatalog.products.find((item) => item.id === product.id))

    const sitemap = renderSitemapXml({ siteUrl: 'https://example.test', catalog: cached })
    const merchantXml = renderGoogleMerchantXml({ siteUrl: 'https://example.test', catalog: cached })
    const categoryHtml = renderSpaPage({
      siteUrl: 'https://example.test',
      catalog: cached,
      route: { type: 'home', categorySlug: 'child' },
    })
    const productHtml = renderProductPage({
      siteUrl: 'https://example.test',
      catalog: cached,
      product,
      category: cached.categories.find((category) => category.id === product.category),
      related: [],
    })

    assert.match(sitemap, /https:\/\/example\.test\/tuote\/new-visible-product/)
    assert.match(merchantXml, /<g:link>https:\/\/example\.test\/tuote\/new-visible-product<\/g:link>/)
    assert.match(categoryHtml, /href="\/tuote\/new-visible-product"/)
    assert.match(productHtml, /<link rel="canonical" href="https:\/\/example\.test\/tuote\/new-visible-product"/)
    assert.equal((productHtml.match(/"@type":"Product"/g) ?? []).length, 1)
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
