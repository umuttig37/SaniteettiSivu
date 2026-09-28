import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { spawn } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testTempDir = path.resolve(__dirname, '..', 'tmp')
const genericResetMessage = 'Jos sähköpostiosoitteella löytyy tili, lähetimme ohjeet salasanan vaihtamiseen.'

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
      if (response.ok) {
        return
      }
    } catch {
      // The child process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('Test server did not start in time')
}

const requestJson = async (baseUrl, pathname, options = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, options)
  const payload = await response.json()
  return { response, payload }
}

test('password reset and logged-in password change preserve customer pricing, orders and products', async () => {
  fs.mkdirSync(testTempDir, { recursive: true })
  const root = fs.mkdtempSync(path.join(testTempDir, 'paperitukku-password-auth-test-'))
  const serverDir = path.join(root, 'server')
  const dataDir = path.join(root, 'data')
  fs.cpSync(__dirname, serverDir, { recursive: true })
  fs.mkdirSync(dataDir)

  const oldPassword = 'VanhaSalasana123'
  const resetPassword = 'ResetSalasana456'
  const finalPassword = 'LopullinenSalasana789'
  const customerA = {
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
    eInvoiceAddress: '003712345678',
    defaultShippingAddress: { streetAddress: 'Toimituskatu 1', postalCode: '00100', city: 'Helsinki', country: 'FI' },
    defaultBillingCompany: 'Testiyritys Oy',
    defaultBillingAddress: { streetAddress: 'Laskukatu 2', postalCode: '00200', city: 'Helsinki', country: 'FI' },
    ...passwordFields(oldPassword),
  }
  const customerB = {
    ...customerA,
    id: 'customer-b',
    email: 'toinen@example.test',
    companyName: 'Toinen Oy',
    ...passwordFields('ToinenSalasana123'),
  }
  const catalog = {
    categories: [{ id: 'main', slug: 'main', nameFi: 'Tuotteet', nameEn: 'Products' }, { id: 'muut', slug: 'muut', nameFi: 'Muut', nameEn: 'Other' }],
    products: [{
      id: 'product-1', slug: 'test-product', name: 'Test product', category: 'main', price: 10, priceUnit: '€ / kpl', sku: 'TEST-1', stock: 5,
      image: '/product.svg', images: ['/product.svg'], description: 'Test product', featured: false, featuredRank: 999, optionGroups: [],
      seoTitle: 'Test product | Suomen Paperitukku', metaDescription: 'Test product', searchKeywords: ['test'],
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }],
  }
  const prices = { prices: [{ customerId: customerA.id, productId: 'product-1', price: 7.5, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }] }
  const orders = [{ id: '12001', customerId: customerA.id, status: 'delivered', createdAt: '2026-01-05T00:00:00.000Z', items: [] }]

  fs.writeFileSync(path.join(dataDir, 'customers.json'), JSON.stringify([customerA, customerB], null, 2))
  fs.writeFileSync(path.join(dataDir, 'catalog.json'), JSON.stringify(catalog, null, 2))
  fs.writeFileSync(path.join(dataDir, 'customer-prices.json'), JSON.stringify(prices, null, 2))
  fs.writeFileSync(path.join(dataDir, 'orders.json'), JSON.stringify(orders, null, 2))

  const protectedFiles = ['catalog.json', 'customer-prices.json', 'orders.json']
  const beforeProtected = new Map(protectedFiles.map((name) => [name, fs.readFileSync(path.join(dataDir, name), 'utf8')]))
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
  let serverStderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => {
    serverStderr += chunk
  })

  try {
    await waitForServer(baseUrl, child)

    const wrongLogin = await requestJson(baseUrl, '/api/customer/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: customerA.email, password: 'wrong' }),
    })
    assert.equal(wrongLogin.response.status, 401)

    const oldLogin = await requestJson(baseUrl, '/api/customer/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: customerA.email, password: oldPassword }),
    })
    assert.equal(oldLogin.response.status, 200)
    assert.equal(oldLogin.payload.customer.id, customerA.id)
    const sessionCookie = oldLogin.response.headers.get('set-cookie').split(';')[0]

    const pricedCatalogBefore = await requestJson(baseUrl, '/api/catalog', { headers: { Cookie: sessionCookie } })
    assert.equal(pricedCatalogBefore.payload.products[0].price, 7.5)

    const existingResetRequest = await requestJson(baseUrl, '/api/customer/password-reset/request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: '  ASIAKAS@EXAMPLE.TEST  ' }),
    })
    const missingResetRequest = await requestJson(baseUrl, '/api/customer/password-reset/request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'missing@example.test' }),
    })
    assert.equal(existingResetRequest.response.status, 200)
    assert.equal(missingResetRequest.response.status, 200)
    assert.equal(existingResetRequest.payload.message, genericResetMessage)
    assert.equal(missingResetRequest.payload.message, genericResetMessage)

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const repeatedRequest = await requestJson(baseUrl, '/api/customer/password-reset/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: customerA.email }),
      })
      assert.equal(repeatedRequest.response.status, 200)
      assert.equal(repeatedRequest.payload.message, genericResetMessage)
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal((serverStderr.match(/Password reset email failed/g) ?? []).length, 3)

    const resetStoreUrl = `${pathToFileURL(path.join(serverDir, 'password-reset-store.mjs')).href}?integration=${Date.now()}`
    const resetStore = await import(resetStoreUrl)
    const token = await resetStore.createPasswordResetToken(customerA.id)

    const resetPageResponse = await fetch(`${baseUrl}/tili/vaihda-salasana?token=${encodeURIComponent(token)}`)
    const resetPageHtml = await resetPageResponse.text()
    assert.equal(resetPageResponse.status, 200)
    assert.equal(resetPageHtml.includes(token), false)
    assert.match(resetPageHtml, /<meta name="robots" content="noindex,nofollow,noarchive"/)

    const mismatch = await requestJson(baseUrl, '/api/customer/password-reset/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: resetPassword, passwordConfirm: 'different' }),
    })
    assert.equal(mismatch.response.status, 400)
    assert.ok(resetStore.validatePasswordResetToken(token))

    const tooShort = await requestJson(baseUrl, '/api/customer/password-reset/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: 'short', passwordConfirm: 'short' }),
    })
    assert.equal(tooShort.response.status, 400)
    assert.ok(resetStore.validatePasswordResetToken(token))

    const reset = await requestJson(baseUrl, '/api/customer/password-reset/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, customerId: customerB.id, password: resetPassword, passwordConfirm: resetPassword }),
    })
    assert.equal(reset.response.status, 200)
    assert.equal(await resetStore.consumePasswordResetToken(token), null)

    const reused = await requestJson(baseUrl, '/api/customer/password-reset/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: finalPassword, passwordConfirm: finalPassword }),
    })
    assert.equal(reused.response.status, 400)

    const oldLoginAfterReset = await requestJson(baseUrl, '/api/customer/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: customerA.email, password: oldPassword }),
    })
    assert.equal(oldLoginAfterReset.response.status, 401)
    const resetLogin = await requestJson(baseUrl, '/api/customer/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: customerA.email, password: resetPassword }),
    })
    assert.equal(resetLogin.response.status, 200)

    const sessionAfterReset = await requestJson(baseUrl, '/api/customer/session', { headers: { Cookie: sessionCookie } })
    assert.equal(sessionAfterReset.response.status, 200)
    assert.equal(sessionAfterReset.payload.customer.id, customerA.id)

    const wrongCurrent = await requestJson(baseUrl, '/api/customer/password/change', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ currentPassword: 'wrong', password: finalPassword, passwordConfirm: finalPassword }),
    })
    assert.equal(wrongCurrent.response.status, 400)

    const loggedInMismatch = await requestJson(baseUrl, '/api/customer/password/change', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ currentPassword: resetPassword, password: finalPassword, passwordConfirm: 'different' }),
    })
    assert.equal(loggedInMismatch.response.status, 400)

    const changed = await requestJson(baseUrl, '/api/customer/password/change', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ currentPassword: resetPassword, password: finalPassword, passwordConfirm: finalPassword }),
    })
    assert.equal(changed.response.status, 200)

    const sessionAfterChange = await requestJson(baseUrl, '/api/customer/session', { headers: { Cookie: sessionCookie } })
    assert.equal(sessionAfterChange.response.status, 200)
    const finalLogin = await requestJson(baseUrl, '/api/customer/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: customerA.email, password: finalPassword }),
    })
    assert.equal(finalLogin.response.status, 200)
    assert.equal(finalLogin.payload.customer.id, customerA.id)

    const pricedCatalogAfter = await requestJson(baseUrl, '/api/catalog', { headers: { Cookie: sessionCookie } })
    assert.equal(pricedCatalogAfter.payload.products[0].price, 7.5)

    const storedCustomers = JSON.parse(fs.readFileSync(path.join(dataDir, 'customers.json'), 'utf8'))
    const storedA = storedCustomers.find((customer) => customer.id === customerA.id)
    const storedB = storedCustomers.find((customer) => customer.id === customerB.id)
    const { passwordHash: beforeHash, passwordSalt: beforeSalt, ...beforeStable } = customerA
    const { passwordHash: afterHash, passwordSalt: afterSalt, ...afterStable } = storedA
    assert.notEqual(afterHash, beforeHash)
    assert.notEqual(afterSalt, beforeSalt)
    assert.deepEqual(afterStable, beforeStable)
    assert.deepEqual(storedB, customerB)

    for (const [name, content] of beforeProtected) {
      assert.equal(fs.readFileSync(path.join(dataDir, name), 'utf8'), content)
    }
  } finally {
    if (child.exitCode === null) {
      child.kill()
      await new Promise((resolve) => child.once('exit', resolve))
    }
    fs.rmSync(root, { recursive: true, force: true })
  }
})
