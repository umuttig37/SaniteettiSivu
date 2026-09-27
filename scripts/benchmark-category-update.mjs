import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const temporaryRoot = path.join(projectRoot, 'tmp', 'category-update-benchmark')
const productCount = 320
const imagePayload = `data:image/png;base64,${'A'.repeat(70_000)}`

const hashFile = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const stripAllowedCategoryChanges = (product) => {
  const { category, updatedAt, ...stable } = product
  return stable
}

const createFixture = ({ duplicateTarget = false } = {}) => ({
  categories: [
    { id: 'main', slug: 'main', nameFi: 'Main', nameEn: 'Main' },
    { id: 'child', slug: 'child', nameFi: 'Child', nameEn: 'Child', parentId: 'main' },
    { id: 'muut', slug: 'muut', nameFi: 'Muut', nameEn: 'Other' },
  ],
  products: Array.from({ length: productCount }, (_, index) => ({
    id: duplicateTarget && index === productCount - 1 ? 'product-0' : `product-${index}`,
    slug: `benchmark-product-${index}`,
    name: `Benchmark product ${index}`,
    category: 'main',
    price: 10 + index / 100,
    priceUnit: 'EUR / kpl',
    sku: `BENCH-${index}`,
    stock: 10,
    image: imagePayload,
    images: [imagePayload],
    description: `Benchmark description ${index}`,
    seoTitle: `Benchmark SEO title ${index}`,
    metaDescription: `Benchmark meta description ${index}`,
    searchKeywords: ['benchmark', `product-${index}`],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  })),
})

const prepareStore = (name, fixture) => {
  const root = path.join(temporaryRoot, name)
  const serverDir = path.join(root, 'server')
  const dataDir = path.join(root, 'data')
  fs.mkdirSync(serverDir, { recursive: true })
  fs.mkdirSync(dataDir, { recursive: true })
  fs.copyFileSync(path.join(projectRoot, 'server', 'catalog-store.mjs'), path.join(serverDir, 'catalog-store.mjs'))
  fs.copyFileSync(path.join(projectRoot, 'server', 'catalog.seed.json'), path.join(serverDir, 'catalog.seed.json'))
  const catalogPath = path.join(dataDir, 'catalog.json')
  fs.writeFileSync(catalogPath, JSON.stringify(fixture, null, 2), 'utf8')
  return {
    root,
    catalogPath,
    modulePath: path.join(serverDir, 'catalog-store.mjs'),
  }
}

const runWorker = (mode, modulePath) => {
  const result = spawnSync(
    process.execPath,
    [
      '--expose-gc',
      '--max-old-space-size=256',
      fileURLToPath(import.meta.url),
      '--worker',
      mode,
      modulePath,
    ],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    },
  )

  if (result.status !== 0) {
    throw new Error(`Benchmark worker failed (${mode}).\n${result.stdout}\n${result.stderr}`)
  }
  const line = result.stdout.split(/\r?\n/).find((entry) => entry.startsWith('BENCH_RESULT='))
  if (!line) {
    throw new Error(`Benchmark worker did not return results (${mode}).\n${result.stdout}\n${result.stderr}`)
  }
  return JSON.parse(line.slice('BENCH_RESULT='.length))
}

const measureOperation = async (operation) => {
  global.gc?.()
  const baseline = process.memoryUsage()
  let peakRss = baseline.rss
  let peakHeapUsed = baseline.heapUsed
  const sampler = setInterval(() => {
    const memory = process.memoryUsage()
    peakRss = Math.max(peakRss, memory.rss)
    peakHeapUsed = Math.max(peakHeapUsed, memory.heapUsed)
  }, 1)
  const startedAt = process.hrtime.bigint()

  try {
    await operation()
  } finally {
    clearInterval(sampler)
  }

  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6
  const finalMemory = process.memoryUsage()
  peakRss = Math.max(peakRss, finalMemory.rss)
  peakHeapUsed = Math.max(peakHeapUsed, finalMemory.heapUsed)
  return {
    elapsedMs,
    baselineRss: baseline.rss,
    baselineHeapUsed: baseline.heapUsed,
    peakRss,
    peakHeapUsed,
    processMaxRss: process.resourceUsage().maxRSS * 1024,
  }
}

const runWorkerMode = async (mode, modulePath) => {
  const store = await import(`${pathToFileURL(modulePath).href}?benchmark=${mode}-${Date.now()}`)
  store.readCatalog()
  store.readPublicCatalog()

  if (mode === 'single') {
    let result
    const metrics = await measureOperation(async () => {
      result = await store.updateProductCategory('product-0', 'child')
    })
    const cached = store.readCatalog().products.find((product) => product.id === 'product-0')
    const publicCatalog = store.readPublicCatalog()
    const { renderGoogleMerchantXml } = await import('../server/merchant-feed.mjs')
    const { renderProductPage, renderSitemapXml, renderSpaPage } = await import('../server/site-render.mjs')
    const product = publicCatalog.products.find((item) => item.id === 'product-0')
    const category = publicCatalog.categories.find((item) => item.id === product.category)
    const productHtml = renderProductPage({
      siteUrl: 'https://example.test',
      catalog: publicCatalog,
      product,
      category,
      related: [],
    })
    const sitemap = renderSitemapXml({ siteUrl: 'https://example.test', catalog: publicCatalog })
    const merchant = renderGoogleMerchantXml({ siteUrl: 'https://example.test', catalog: publicCatalog })
    const mainCategory = renderSpaPage({
      siteUrl: 'https://example.test',
      catalog: publicCatalog,
      route: { type: 'home', categorySlug: 'main' },
    })
    const childCategory = renderSpaPage({
      siteUrl: 'https://example.test',
      catalog: publicCatalog,
      route: { type: 'home', categorySlug: 'child' },
    })
    const name = product.name

    return {
      metrics,
      updatedAt: result.product.updatedAt,
      cacheUpdated: cached.category === 'child' && cached.updatedAt === result.product.updatedAt,
      seo: {
        sitemap: sitemap.includes('https://example.test/tuote/benchmark-product-0'),
        productSchema: (productHtml.match(/\"@type\":\"Product\"/g) ?? []).length === 1,
        canonical: productHtml.includes('href="https://example.test/tuote/benchmark-product-0"'),
        merchant: merchant.includes('<g:link>https://example.test/tuote/benchmark-product-0</g:link>'),
        search: publicCatalog.products.some((item) => item.name === name),
        mainCategory: mainCategory.includes('href="/tuote/benchmark-product-0"'),
        childCategory: childCategory.includes('href="/tuote/benchmark-product-0"'),
      },
    }
  }

  if (mode === 'concurrent') {
    const metrics = await measureOperation(() =>
      Promise.all([
        store.updateProductCategory('product-0', 'child'),
        store.updateProductCategory('product-1', 'child'),
      ]),
    )
    const catalog = store.readCatalog()
    return {
      metrics,
      firstCategory: catalog.products.find((product) => product.id === 'product-0').category,
      secondCategory: catalog.products.find((product) => product.id === 'product-1').category,
      productCount: catalog.products.length,
    }
  }

  if (mode === 'failure') {
    const catalogPath = store.getCatalogFilePath()
    const beforeHash = hashFile(catalogPath)
    let message = ''
    const metrics = await measureOperation(async () => {
      try {
        await store.updateProductCategory('product-0', 'child')
      } catch (error) {
        message = error.message
      }
    })
    return {
      metrics,
      message,
      unchanged: beforeHash === hashFile(catalogPath),
      tempFiles: fs.readdirSync(path.dirname(catalogPath)).filter((name) => name.endsWith('.tmp')),
    }
  }

  throw new Error(`Unknown benchmark mode: ${mode}`)
}

const main = () => {
  fs.rmSync(temporaryRoot, { recursive: true, force: true })
  fs.mkdirSync(temporaryRoot, { recursive: true })

  try {
    let fixture = createFixture()
    const singleStore = prepareStore('single', fixture)
    const fixtureBytes = fs.statSync(singleStore.catalogPath).size
    const single = runWorker('single', singleStore.modulePath)
    const singleAfter = JSON.parse(fs.readFileSync(singleStore.catalogPath, 'utf8'))
    assert.equal(singleAfter.products.length, fixture.products.length)
    assert.equal(singleAfter.products[0].category, 'child')
    assert.notEqual(singleAfter.products[0].updatedAt, fixture.products[0].updatedAt)
    assert.deepEqual(stripAllowedCategoryChanges(singleAfter.products[0]), stripAllowedCategoryChanges(fixture.products[0]))
    for (let index = 1; index < fixture.products.length; index += 1) {
      assert.deepEqual(singleAfter.products[index], fixture.products[index])
    }
    assert.equal(singleAfter.products[0].image, fixture.products[0].image)
    assert.deepEqual(singleAfter.products[0].images, fixture.products[0].images)
    assert.equal(Object.values(single.seo).every(Boolean), true)
    assert.equal(single.cacheUpdated, true)

    fs.rmSync(singleStore.root, { recursive: true, force: true })
    fixture = createFixture()
    const concurrentStore = prepareStore('concurrent', fixture)
    const concurrent = runWorker('concurrent', concurrentStore.modulePath)
    const concurrentAfter = JSON.parse(fs.readFileSync(concurrentStore.catalogPath, 'utf8'))
    assert.equal(concurrent.productCount, fixture.products.length)
    assert.equal(concurrent.firstCategory, 'child')
    assert.equal(concurrent.secondCategory, 'child')
    for (let index = 0; index < fixture.products.length; index += 1) {
      if (index < 2) {
        assert.deepEqual(stripAllowedCategoryChanges(concurrentAfter.products[index]), stripAllowedCategoryChanges(fixture.products[index]))
      } else {
        assert.deepEqual(concurrentAfter.products[index], fixture.products[index])
      }
    }

    fs.rmSync(concurrentStore.root, { recursive: true, force: true })
    fixture = createFixture({ duplicateTarget: true })
    const failureStore = prepareStore('failure', fixture)
    const failure = runWorker('failure', failureStore.modulePath)
    assert.match(failure.message, /not found uniquely/)
    assert.equal(failure.unchanged, true)
    assert.deepEqual(failure.tempFiles, [])

    console.log(JSON.stringify({ fixtureBytes, productCount, single, concurrent, failure }, null, 2))
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

if (process.argv[2] === '--worker') {
  const result = await runWorkerMode(process.argv[3], process.argv[4])
  console.log(`BENCH_RESULT=${JSON.stringify(result)}`)
} else {
  main()
}
