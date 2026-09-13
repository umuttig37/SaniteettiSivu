import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const createIsolatedStore = async (priceContent = null) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paperitukku-customer-price-test-'))
  const serverDir = path.join(root, 'server')
  const dataDir = path.join(root, 'data')
  fs.mkdirSync(serverDir)
  fs.mkdirSync(dataDir)
  fs.copyFileSync(path.join(__dirname, 'customer-price-store.mjs'), path.join(serverDir, 'customer-price-store.mjs'))

  const catalogPath = path.join(dataDir, 'catalog.json')
  const customersPath = path.join(dataDir, 'customers.json')
  const pricesPath = path.join(dataDir, 'customer-prices.json')
  fs.writeFileSync(catalogPath, '{"products":[{"id":"product-1","price":10}]}', 'utf8')
  fs.writeFileSync(customersPath, '[{"id":"customer-1","email":"customer@example.test"}]', 'utf8')
  if (priceContent !== null) {
    fs.writeFileSync(pricesPath, priceContent, 'utf8')
  }

  const moduleUrl = `${pathToFileURL(path.join(serverDir, 'customer-price-store.mjs')).href}?test=${Date.now()}-${Math.random()}`
  return {
    root,
    catalogPath,
    customersPath,
    pricesPath,
    store: await import(moduleUrl),
  }
}

test('customer prices are stored separately without changing products or customers', async () => {
  const isolated = await createIsolatedStore()
  const catalogBefore = fs.readFileSync(isolated.catalogPath, 'utf8')
  const customersBefore = fs.readFileSync(isolated.customersPath, 'utf8')

  try {
    isolated.store.ensureCustomerPriceStore()
    const created = isolated.store.setCustomerPrice({ customerId: 'customer-1', productId: 'product-1', price: 8.456 })
    assert.equal(created.price, 8.46)
    assert.equal(isolated.store.getCustomerPriceMap('customer-1').get('product-1'), 8.46)

    const updated = isolated.store.setCustomerPrice({ customerId: 'customer-1', productId: 'product-1', price: 7.9 })
    assert.equal(updated.price, 7.9)
    assert.equal(updated.createdAt, created.createdAt)
    assert.equal(isolated.store.readCustomerPrices('customer-1').length, 1)

    isolated.store.deleteCustomerPrice('customer-1', 'product-1')
    assert.equal(isolated.store.getCustomerPriceMap('customer-1').has('product-1'), false)
    assert.equal(fs.readFileSync(isolated.catalogPath, 'utf8'), catalogBefore)
    assert.equal(fs.readFileSync(isolated.customersPath, 'utf8'), customersBefore)
    assert.equal(fs.readdirSync(path.dirname(isolated.pricesPath)).some((name) => name.endsWith('.tmp')), false)
  } finally {
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})

test('a broken customer price file is never replaced or rewritten', async () => {
  const invalidContent = '{ invalid customer pricing JSON'
  const isolated = await createIsolatedStore(invalidContent)
  const originalConsoleError = console.error
  const loggedErrors = []
  console.error = (...args) => loggedErrors.push(args.join(' '))

  try {
    assert.throws(() => isolated.store.ensureCustomerPriceStore(), /Customer prices could not be read/)
    assert.equal(fs.readFileSync(isolated.pricesPath, 'utf8'), invalidContent)
    assert.equal(loggedErrors.some((message) => message.includes('Existing prices were not modified')), true)
  } finally {
    console.error = originalConsoleError
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})
