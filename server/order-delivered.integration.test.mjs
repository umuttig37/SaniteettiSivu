import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { spawn } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testTempDir = path.resolve(__dirname, '..', 'tmp')

const getAvailablePort = () => new Promise((resolve, reject) => {
  const server = net.createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    server.close((error) => error ? reject(error) : resolve(port))
  })
})

const waitForServer = async (baseUrl, child) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Test server exited with code ${child.exitCode}`)
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) return
    } catch {
      // The child process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('Test server did not start in time')
}

test('admin marks only a shipped order as delivered without changing any other data', async () => {
  fs.mkdirSync(testTempDir, { recursive: true })
  const root = fs.mkdtempSync(path.join(testTempDir, 'paperitukku-order-delivered-test-'))
  const serverDir = path.join(root, 'server')
  const dataDir = path.join(root, 'data')
  fs.cpSync(__dirname, serverDir, { recursive: true })
  fs.cpSync(path.resolve(__dirname, '..', 'config'), path.join(root, 'config'), { recursive: true })
  fs.mkdirSync(dataDir)

  const shippedOrder = {
    id: '14001',
    customerId: 'customer-1',
    lang: 'fi',
    status: 'shipped',
    createdAt: '2026-11-01T10:00:00.000Z',
    shippedAt: '2026-11-02T10:00:00.000Z',
    paymentMethod: 'invoice',
    paymentStatus: 'invoice_pending',
    confirmationEmailSentAt: '2026-11-01T10:01:00.000Z',
    customer: {
      company: 'Toimitustesti Oy',
      contact: 'Testi Asiakas',
      email: 'toimitus@example.test',
      phone: '0401234567',
      address: 'Testikatu 1',
      zip: '00100',
      city: 'Helsinki',
    },
    items: [{
      productId: 'product-1',
      name: 'Testituote',
      quantity: 2,
      unitPrice: 10,
      priceUnit: 'EUR / kpl',
      selectedOptions: [],
    }],
    subtotal: 20,
    shipping: 15,
    total: 35,
    vatAmount: 8.93,
    grossTotal: 43.93,
  }
  const newOrder = { ...shippedOrder, id: '14002', status: 'new', shippedAt: null }
  const initialOrders = [shippedOrder, newOrder]
  const customers = [{ id: 'customer-1', email: 'toimitus@example.test' }]
  const catalog = { categories: [], products: [{ id: 'product-1', name: 'Testituote', sku: 'TEST-1' }] }
  const prices = { prices: [] }

  fs.writeFileSync(path.join(dataDir, 'orders.json'), JSON.stringify(initialOrders, null, 2))
  fs.writeFileSync(path.join(dataDir, 'customers.json'), JSON.stringify(customers, null, 2))
  fs.writeFileSync(path.join(dataDir, 'catalog.json'), JSON.stringify(catalog, null, 2))
  fs.writeFileSync(path.join(dataDir, 'customer-prices.json'), JSON.stringify(prices, null, 2))
  const customersBefore = fs.readFileSync(path.join(dataDir, 'customers.json'), 'utf8')
  const catalogBefore = fs.readFileSync(path.join(dataDir, 'catalog.json'), 'utf8')
  const pricesBefore = fs.readFileSync(path.join(dataDir, 'customer-prices.json'), 'utf8')

  const adminUser = 'delivery-admin'
  const adminPass = 'DeliveryAdminPassword123!'
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      ADMIN_USER: adminUser,
      ADMIN_PASS: adminPass,
      SMTP_USER: '', SMTP_USERNAME: '', MAIL_USER: '', MAIL_USERNAME: '', GMAIL_USER: '',
      SMTP_PASS: '', SMTP_PASSWORD: '', MAIL_PASS: '', MAIL_PASSWORD: '', GMAIL_APP_PASSWORD: '', GMAIL_PASS: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  try {
    await waitForServer(baseUrl, child)

    const unauthorized = await fetch(`${baseUrl}/api/orders/${shippedOrder.id}/delivered`, { method: 'POST' })
    assert.equal(unauthorized.status, 401)
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf8')), initialOrders)

    const adminLogin = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: adminUser, pass: adminPass }),
    })
    assert.equal(adminLogin.status, 200)
    const adminCookie = adminLogin.headers.get('set-cookie').split(';')[0]

    const invalidTransition = await fetch(`${baseUrl}/api/orders/${newOrder.id}/delivered`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    })
    assert.equal(invalidTransition.status, 409)

    const response = await fetch(`${baseUrl}/api/orders/${shippedOrder.id}/delivered`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    })
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.order.status, 'delivered')

    const storedOrders = JSON.parse(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf8'))
    const deliveredOrder = storedOrders.find((order) => order.id === shippedOrder.id)
    assert.deepEqual(deliveredOrder, { ...shippedOrder, status: 'delivered' })
    assert.deepEqual(storedOrders.find((order) => order.id === newOrder.id), newOrder)
    assert.equal(fs.readFileSync(path.join(dataDir, 'customers.json'), 'utf8'), customersBefore)
    assert.equal(fs.readFileSync(path.join(dataDir, 'catalog.json'), 'utf8'), catalogBefore)
    assert.equal(fs.readFileSync(path.join(dataDir, 'customer-prices.json'), 'utf8'), pricesBefore)

    const repeatedResponse = await fetch(`${baseUrl}/api/orders/${shippedOrder.id}/delivered`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    })
    const repeatedPayload = await repeatedResponse.json()
    assert.equal(repeatedResponse.status, 200)
    assert.equal(repeatedPayload.alreadyDelivered, true)
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf8')), storedOrders)
  } finally {
    if (child.exitCode === null) {
      child.kill()
      await new Promise((resolve) => child.once('exit', resolve))
    }
    fs.rmSync(root, { recursive: true, force: true })
  }
})
