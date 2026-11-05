import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { spawn } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testTempDir = path.resolve(__dirname, '..', 'tmp')

const passwordFields = (password) => {
  const salt = crypto.randomBytes(16).toString('hex')
  return {
    passwordSalt: salt,
    passwordHash: crypto.scryptSync(password, salt, 64).toString('hex'),
  }
}

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

const makeOrder = ({ id, customerId, paymentMethod, paymentStatus, createdAt }) => ({
  id,
  customerId,
  status: 'new',
  createdAt,
  shippedAt: null,
  paymentMethod,
  paymentStatus,
  confirmationEmailSentAt: paymentStatus === 'paid' || paymentMethod === 'invoice' ? createdAt : null,
  paytrail: paymentMethod === 'paytrail' ? { transactionId: `transaction-${id}`, stamp: `stamp-${id}` } : null,
  customer: {
    company: 'Testiyritys Oy',
    contact: 'Testi Asiakas',
    email: 'asiakas@example.test',
    phone: '0401234567',
    address: 'Toimituskatu 1',
    zip: '00100',
    city: 'Helsinki',
    deliveryDate: '2026-11-05',
  },
  items: [{
    productId: 'product-1',
    name: 'Test product',
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
})

test('customer order history returns only the signed-in customer confirmed orders without mutating data', async () => {
  fs.mkdirSync(testTempDir, { recursive: true })
  const root = fs.mkdtempSync(path.join(testTempDir, 'paperitukku-customer-orders-test-'))
  const serverDir = path.join(root, 'server')
  const dataDir = path.join(root, 'data')
  fs.cpSync(__dirname, serverDir, { recursive: true })
  fs.cpSync(path.resolve(__dirname, '..', 'config'), path.join(root, 'config'), { recursive: true })
  fs.mkdirSync(dataDir)

  const password = 'AsiakkaanSalasana123'
  const customer = {
    id: 'customer-a',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-02T10:00:00.000Z',
    approvalStatus: 'approved',
    approvedAt: '2026-01-02T10:00:00.000Z',
    firstName: 'Testi',
    lastName: 'Asiakas',
    companyName: 'Testiyritys Oy',
    businessId: '1234567-1',
    phone: '0401234567',
    email: 'asiakas@example.test',
    eInvoiceAddress: '',
    ...passwordFields(password),
  }
  const otherCustomer = {
    ...customer,
    id: 'customer-b',
    companyName: 'Toinen Oy',
    email: 'toinen@example.test',
    ...passwordFields('ToinenSalasana123'),
  }
  const orders = [
    makeOrder({ id: '12001', customerId: customer.id, paymentMethod: 'invoice', paymentStatus: 'invoice_pending', createdAt: '2026-10-01T10:00:00.000Z' }),
    makeOrder({ id: '12002', customerId: customer.id, paymentMethod: 'paytrail', paymentStatus: 'paid', createdAt: '2026-10-02T10:00:00.000Z' }),
    makeOrder({ id: '12003', customerId: customer.id, paymentMethod: 'paytrail', paymentStatus: 'pending', createdAt: '2026-10-03T10:00:00.000Z' }),
    makeOrder({ id: '12004', customerId: customer.id, paymentMethod: 'paytrail', paymentStatus: 'failed', createdAt: '2026-10-04T10:00:00.000Z' }),
    makeOrder({ id: '12005', customerId: otherCustomer.id, paymentMethod: 'paytrail', paymentStatus: 'paid', createdAt: '2026-10-05T10:00:00.000Z' }),
    makeOrder({ id: '12006', customerId: null, paymentMethod: 'paytrail', paymentStatus: 'paid', createdAt: '2026-10-06T10:00:00.000Z' }),
  ]
  const catalog = {
    categories: [{ id: 'main', slug: 'main', nameFi: 'Tuotteet', nameEn: 'Products' }],
    products: [],
  }

  fs.writeFileSync(path.join(dataDir, 'customers.json'), JSON.stringify([customer, otherCustomer], null, 2))
  fs.writeFileSync(path.join(dataDir, 'catalog.json'), JSON.stringify(catalog, null, 2))
  fs.writeFileSync(path.join(dataDir, 'customer-prices.json'), JSON.stringify({ prices: [] }, null, 2))
  fs.writeFileSync(path.join(dataDir, 'orders.json'), JSON.stringify(orders, null, 2))
  const ordersBefore = fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf8')

  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      SMTP_USER: '', SMTP_USERNAME: '', MAIL_USER: '', MAIL_USERNAME: '', GMAIL_USER: '',
      SMTP_PASS: '', SMTP_PASSWORD: '', MAIL_PASS: '', MAIL_PASSWORD: '', GMAIL_APP_PASSWORD: '', GMAIL_PASS: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  try {
    await waitForServer(baseUrl, child)

    const unauthorized = await fetch(`${baseUrl}/api/customer/orders`)
    assert.equal(unauthorized.status, 401)

    const login = await fetch(`${baseUrl}/api/customer/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: customer.email, password }),
    })
    assert.equal(login.status, 200)
    const sessionCookie = login.headers.get('set-cookie').split(';')[0]

    const response = await fetch(`${baseUrl}/api/customer/orders`, {
      headers: { Cookie: sessionCookie },
    })
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.match(response.headers.get('cache-control'), /no-store/)
    assert.deepEqual(payload.orders.map((order) => order.id), ['12002', '12001'])
    assert.equal(payload.orders[0].grossTotal, 43.93)
    assert.equal(payload.orders[0].deliveryDate, '2026-11-05')
    assert.equal(payload.orders[0].items[0].sku, 'product-1')
    assert.equal('customer' in payload.orders[0], false)
    assert.equal('customerId' in payload.orders[0], false)
    assert.equal('paytrail' in payload.orders[0], false)
    assert.equal('confirmationEmailSentAt' in payload.orders[0], false)
    assert.equal(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf8'), ordersBefore)
  } finally {
    if (child.exitCode === null) {
      child.kill()
      await new Promise((resolve) => child.once('exit', resolve))
    }
    fs.rmSync(root, { recursive: true, force: true })
  }
})
