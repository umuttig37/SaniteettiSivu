import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const createIsolatedStore = async (customers) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paperitukku-customer-test-'))
  const serverDir = path.join(root, 'server')
  const dataDir = path.join(root, 'data')
  fs.mkdirSync(serverDir, { recursive: true })
  fs.mkdirSync(dataDir, { recursive: true })
  fs.copyFileSync(path.join(__dirname, 'customer-store.mjs'), path.join(serverDir, 'customer-store.mjs'))
  const customersPath = path.join(dataDir, 'customers.json')
  fs.writeFileSync(customersPath, JSON.stringify(customers, null, 2), 'utf8')
  const moduleUrl = `${pathToFileURL(path.join(serverDir, 'customer-store.mjs')).href}?test=${Date.now()}-${Math.random()}`

  return {
    root,
    customersPath,
    store: await import(moduleUrl),
  }
}

const baseCustomer = {
  id: 'customer-1',
  createdAt: '2026-01-02T10:00:00.000Z',
  updatedAt: '2026-01-02T10:00:00.000Z',
  approvalStatus: 'approved',
  approvedAt: '2026-01-03T10:00:00.000Z',
  firstName: 'Vanha',
  lastName: 'Asiakas',
  companyName: 'Vanha Yritys Oy',
  businessId: '1234567-1',
  phone: '0401234567',
  email: 'vanha@example.test',
  passwordHash: 'aabbccdd',
  passwordSalt: '11223344',
  defaultShippingAddress: {
    streetAddress: 'Toimituskatu 1',
    postalCode: '00100',
    city: 'Helsinki',
    country: 'FI',
  },
  defaultBillingCompany: 'Vanha Yritys Oy',
  defaultBillingAddress: {
    streetAddress: 'Laskukatu 2',
    postalCode: '00200',
    city: 'Helsinki',
    country: 'FI',
  },
}

test('old customers remain readable without rewriting the customer file', async () => {
  const isolated = await createIsolatedStore([baseCustomer])
  const before = fs.readFileSync(isolated.customersPath, 'utf8')

  try {
    const customer = isolated.store.readCustomers()[0]
    assert.equal(isolated.store.toPublicCustomer(customer).eInvoiceAddress, '')
    assert.equal(fs.readFileSync(isolated.customersPath, 'utf8'), before)
  } finally {
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})

test('admin customer update changes only the selected profile fields and updatedAt', async () => {
  const untouchedCustomer = {
    ...baseCustomer,
    id: 'customer-2',
    email: 'toinen@example.test',
  }
  const isolated = await createIsolatedStore([baseCustomer, untouchedCustomer])

  try {
    const updated = isolated.store.updateCustomerProfile('customer-1', {
      firstName: 'Uusi',
      lastName: 'Nimi',
      companyName: 'Uusi Yritys Oy',
      businessId: '7654321-0',
      phone: '0507654321',
      email: 'uusi@example.test',
      eInvoiceAddress: '003712345671',
      passwordHash: 'must-not-be-used',
      createdAt: 'must-not-be-used',
    })

    assert.equal(updated.id, baseCustomer.id)
    assert.equal(updated.createdAt, baseCustomer.createdAt)
    assert.equal(updated.passwordHash, baseCustomer.passwordHash)
    assert.equal(updated.passwordSalt, baseCustomer.passwordSalt)
    assert.equal(updated.approvalStatus, baseCustomer.approvalStatus)
    assert.equal(updated.approvedAt, baseCustomer.approvedAt)
    assert.deepEqual(updated.defaultShippingAddress, baseCustomer.defaultShippingAddress)
    assert.deepEqual(updated.defaultBillingAddress, baseCustomer.defaultBillingAddress)
    assert.equal(updated.eInvoiceAddress, '003712345671')

    const stored = JSON.parse(fs.readFileSync(isolated.customersPath, 'utf8'))
    assert.deepEqual(stored.find((customer) => customer.id === 'customer-2'), untouchedCustomer)
  } finally {
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})
