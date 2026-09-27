import assert from 'node:assert/strict'
import test from 'node:test'
import { forceGuestCardCheckout } from './checkout-guards.mjs'

test('guest checkout is always card-only and ignores submitted invoice details', () => {
  const input = {
    paymentMethod: 'invoice',
    deliveryAddress: {
      streetAddress: 'Toimituskatu 1',
      postalCode: '00100',
      city: 'Helsinki',
      country: 'FI',
    },
    billingCompany: 'Vaarallinen laskutusarvo',
    billingAddress: {
      streetAddress: 'Laskukatu 2',
      postalCode: '00200',
      city: 'Espoo',
      country: 'FI',
    },
    eInvoiceAddress: '003712345678',
  }
  const before = structuredClone(input)
  const result = forceGuestCardCheckout(input, 'Malliyritys Oy')

  assert.equal(result.paymentMethod, 'card')
  assert.equal(result.billingCompany, 'Malliyritys Oy')
  assert.deepEqual(result.billingAddress, input.deliveryAddress)
  assert.equal(result.eInvoiceAddress, '')
  assert.deepEqual(input, before)
})
