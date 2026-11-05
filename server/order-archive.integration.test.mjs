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

const makeOrder = ({ id, customerId, paymentStatus = 'invoice_pending' }) => ({
  id,
  customerId,
  lang: 'fi',
  status: 'new',
  createdAt: `2026-11-0${Number(id.slice(-1))}T10:00:00.000Z`,
  shippedAt: null,
  paymentMethod: paymentStatus === 'invoice_pending' ? 'invoice' : 'paytrail',
  paymentStatus,
  confirmationEmailSentAt: '2026-11-01T10:01:00.000Z',
  customer: {
    company: 'Arkistotesti Oy',
    contact: 'Testi Asiakas',
    email: 'arkisto@example.test',
    phone: '0401234567',
    address: 'Testikatu 1',
    zip: '00100',
    city: 'Helsinki',
    deliveryDate: '2026-11-10',
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
})

test('admin archive keeps the complete order stored and hides it from active customer history', async () => {
  fs.mkdirSync(testTempDir, { recursive: true })
  const root = fs.mkdtempSync(path.join(testTempDir, 'paperitukku-order-archive-test-'))
  const serverDir = path.join(root, 'server')
  const dataDir = path.join(root, 'data')
  fs.cpSync(__dirname, serverDir, { recursive: true })
  fs.cpSync(path.resolve(__dirname, '..', 'config'), path.join(root, 'config'), { recursive: true })
  fs.mkdirSync(dataDir)

  const customerPassword = 'AsiakkaanSalasana123'
  const customer = {
    id: 'archive-customer',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-02T10:00:00.000Z',
    approvalStatus: 'approved',
    approvedAt: '2026-01-02T10:00:00.000Z',
    firstName: 'Testi',
    lastName: 'Asiakas',
    companyName: 'Arkistotesti Oy',
    businessId: '1234567-1',
    phone: '0401234567',
    email: 'arkisto@example.test',
    eInvoiceAddress: '',
    ...passwordFields(customerPassword),
  }
  const targetOrder = makeOrder({ id: '13001', customerId: customer.id })
  const retainedOrder = makeOrder({ id: '13002', customerId: customer.id })
  const interruptedOrder = makeOrder({ id: '13003', customerId: customer.id, paymentStatus: 'pending' })
  const initialOrders = [targetOrder, retainedOrder, interruptedOrder]

  fs.writeFileSync(path.join(dataDir, 'customers.json'), JSON.stringify([customer], null, 2))
  fs.writeFileSync(path.join(dataDir, 'catalog.json'), JSON.stringify({ categories: [], products: [] }, null, 2))
  fs.writeFileSync(path.join(dataDir, 'customer-prices.json'), JSON.stringify({ prices: [] }, null, 2))
  fs.writeFileSync(path.join(dataDir, 'orders.json'), JSON.stringify(initialOrders, null, 2))

  const adminUser = 'archive-admin'
  const adminPass = 'ArchiveAdminPassword123!'
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

    const unauthorized = await fetch(`${baseUrl}/api/orders/${targetOrder.id}/archive`, { method: 'POST' })
    assert.equal(unauthorized.status, 401)
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf8')), initialOrders)

    const adminLogin = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: adminUser, pass: adminPass }),
    })
    assert.equal(adminLogin.status, 200)
    const adminCookie = adminLogin.headers.get('set-cookie').split(';')[0]

    const archiveResponse = await fetch(`${baseUrl}/api/orders/${targetOrder.id}/archive`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    })
    const archivePayload = await archiveResponse.json()
    assert.equal(archiveResponse.status, 200)
    assert.equal(archivePayload.ok, true)
    assert.equal(archivePayload.order.archivedBy, adminUser)
    assert.equal(Number.isNaN(Date.parse(archivePayload.order.archivedAt)), false)

    const storedAfterArchive = JSON.parse(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf8'))
    assert.equal(storedAfterArchive.length, initialOrders.length)
    const archivedOrder = storedAfterArchive.find((order) => order.id === targetOrder.id)
    const { archivedAt, archivedBy, ...storedOriginalFields } = archivedOrder
    assert.equal(archivedBy, adminUser)
    assert.equal(Number.isNaN(Date.parse(archivedAt)), false)
    assert.deepEqual(storedOriginalFields, targetOrder)
    assert.deepEqual(storedAfterArchive.find((order) => order.id === retainedOrder.id), retainedOrder)
    assert.deepEqual(storedAfterArchive.find((order) => order.id === interruptedOrder.id), interruptedOrder)

    const adminOrdersResponse = await fetch(`${baseUrl}/api/orders`, { headers: { Cookie: adminCookie } })
    const adminOrdersPayload = await adminOrdersResponse.json()
    assert.equal(adminOrdersResponse.status, 200)
    assert.equal(adminOrdersPayload.orders.find((order) => order.id === targetOrder.id).archivedAt, archivedAt)

    const customerLogin = await fetch(`${baseUrl}/api/customer/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: customer.email, password: customerPassword }),
    })
    assert.equal(customerLogin.status, 200)
    const customerCookie = customerLogin.headers.get('set-cookie').split(';')[0]
    const customerOrdersResponse = await fetch(`${baseUrl}/api/customer/orders`, {
      headers: { Cookie: customerCookie },
    })
    const customerOrdersPayload = await customerOrdersResponse.json()
    assert.deepEqual(customerOrdersPayload.orders.map((order) => order.id), [retainedOrder.id])

    const ordersFileAfterFirstArchive = fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf8')
    const repeatedArchive = await fetch(`${baseUrl}/api/orders/${targetOrder.id}/archive`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    })
    const repeatedPayload = await repeatedArchive.json()
    assert.equal(repeatedArchive.status, 200)
    assert.equal(repeatedPayload.alreadyArchived, true)
    assert.equal(repeatedPayload.order.archivedAt, archivedAt)
    assert.equal(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf8'), ordersFileAfterFirstArchive)

    const restoreResponse = await fetch(`${baseUrl}/api/orders/${targetOrder.id}/restore`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    })
    const restorePayload = await restoreResponse.json()
    assert.equal(restoreResponse.status, 200)
    assert.equal(restorePayload.ok, true)
    assert.equal('archivedAt' in restorePayload.order, false)
    assert.equal('archivedBy' in restorePayload.order, false)
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf8')), initialOrders)

    const restoredCustomerOrdersResponse = await fetch(`${baseUrl}/api/customer/orders`, {
      headers: { Cookie: customerCookie },
    })
    const restoredCustomerOrdersPayload = await restoredCustomerOrdersResponse.json()
    assert.deepEqual(restoredCustomerOrdersPayload.orders.map((order) => order.id), [retainedOrder.id, targetOrder.id])

    const ordersFileAfterRestore = fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf8')
    const repeatedRestore = await fetch(`${baseUrl}/api/orders/${targetOrder.id}/restore`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    })
    const repeatedRestorePayload = await repeatedRestore.json()
    assert.equal(repeatedRestore.status, 200)
    assert.equal(repeatedRestorePayload.alreadyActive, true)
    assert.equal(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf8'), ordersFileAfterRestore)
  } finally {
    if (child.exitCode === null) {
      child.kill()
      await new Promise((resolve) => child.once('exit', resolve))
    }
    fs.rmSync(root, { recursive: true, force: true })
  }
})
