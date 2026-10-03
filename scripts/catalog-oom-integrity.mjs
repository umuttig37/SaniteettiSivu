import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { renderGoogleMerchantXml } from '../server/merchant-feed.mjs'
import { renderProductPage, renderSitemapXml } from '../server/site-render.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const baselineSource = process.argv[2]

if (!baselineSource) {
  throw new Error('Usage: node catalog-oom-integrity.mjs <baseline-catalog-store-module>')
}

const fixtureContent = fs.readFileSync(path.join(repoRoot, 'data', 'catalog.json'), 'utf8')
const roots = []

const createStore = async (moduleSource, label) => {
  const root = fs.mkdtempSync(path.join(repoRoot, `tmp-catalog-integrity-${label}-`))
  roots.push(root)
  const serverDir = path.join(root, 'server')
  const dataDir = path.join(root, 'data')
  fs.mkdirSync(serverDir)
  fs.mkdirSync(dataDir)
  fs.copyFileSync(path.resolve(moduleSource), path.join(serverDir, 'catalog-store.mjs'))
  fs.copyFileSync(path.join(repoRoot, 'server', 'catalog.seed.json'), path.join(serverDir, 'catalog.seed.json'))
  const catalogPath = path.join(dataDir, 'catalog.json')
  fs.writeFileSync(catalogPath, fixtureContent, 'utf8')
  const moduleUrl = `${pathToFileURL(path.join(serverDir, 'catalog-store.mjs')).href}?integrity=${Date.now()}-${Math.random()}`
  return { catalogPath, store: await import(moduleUrl) }
}

const productUrls = (sitemap) =>
  Array.from(sitemap.matchAll(/<loc>(.*?)<\/loc>/g), (match) => match[1]).filter((url) => url.includes('/tuote/'))

try {
  const baseline = await createStore(baselineSource, 'before')
  const current = await createStore(path.join(repoRoot, 'server', 'catalog-store.mjs'), 'after')
  const baselineCatalog = baseline.store.readCatalog()
  const currentCatalog = current.store.readCatalog()
  assert.deepEqual(currentCatalog, baselineCatalog)

  const siteUrl = 'https://suomenpaperitukku.fi'
  const baselineSitemap = renderSitemapXml({ siteUrl, catalog: baselineCatalog })
  const currentSitemap = renderSitemapXml({ siteUrl, catalog: currentCatalog })
  const baselineMerchant = renderGoogleMerchantXml({ siteUrl, catalog: baselineCatalog })
  const currentMerchant = renderGoogleMerchantXml({ siteUrl, catalog: currentCatalog })
  assert.equal(currentSitemap, baselineSitemap)
  assert.equal(currentMerchant, baselineMerchant)

  for (const product of baselineCatalog.products.slice(0, 3)) {
    const baselineHtml = renderProductPage({
      siteUrl,
      catalog: baselineCatalog,
      product,
      category: baselineCatalog.categories.find((category) => category.id === product.category),
      related: [],
    })
    const currentProduct = currentCatalog.products.find((item) => item.id === product.id)
    const currentHtml = renderProductPage({
      siteUrl,
      catalog: currentCatalog,
      product: currentProduct,
      category: currentCatalog.categories.find((category) => category.id === currentProduct.category),
      related: [],
    })
    assert.equal(currentHtml, baselineHtml)
  }

  const storedBefore = JSON.parse(fs.readFileSync(current.catalogPath, 'utf8'))
  const sitemapBeforeCategoryWrite = renderSitemapXml({ siteUrl, catalog: storedBefore })
  const merchantBeforeCategoryWrite = renderGoogleMerchantXml({ siteUrl, catalog: storedBefore })
  await current.store.addCategory({
    id: 'integrity-category',
    nameFi: 'Integrity-kategoria',
    nameEn: 'Integrity category',
  })
  const storedAfter = JSON.parse(fs.readFileSync(current.catalogPath, 'utf8'))
  const sitemapAfterCategoryWrite = renderSitemapXml({ siteUrl, catalog: storedAfter })
  const merchantAfterCategoryWrite = renderGoogleMerchantXml({ siteUrl, catalog: storedAfter })

  assert.deepEqual(storedAfter.products, storedBefore.products)
  assert.deepEqual(productUrls(sitemapAfterCategoryWrite), productUrls(sitemapBeforeCategoryWrite))
  assert.equal(merchantAfterCategoryWrite, merchantBeforeCategoryWrite)

  process.stdout.write(`${JSON.stringify({
    ok: true,
    productCount: currentCatalog.products.length,
    categoryCount: currentCatalog.categories.length,
    cacheDifferences: 0,
    productDataDifferencesAfterCategoryWrite: 0,
    sitemapProductUrlDifferences: 0,
    merchantDifferences: 0,
    comparedProductSsrPages: Math.min(3, currentCatalog.products.length),
    ssrDifferences: 0,
  })}\n`)
} finally {
  for (const root of roots) {
    fs.rmSync(root, { recursive: true, force: true })
  }
}
