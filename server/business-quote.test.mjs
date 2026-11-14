import test from 'node:test'
import assert from 'node:assert/strict'
import { createBusinessQuoteMailMessages, validateBusinessQuoteFields } from './business-quote.mjs'

test('business quote requires a business id', () => {
  assert.throws(() => validateBusinessQuoteFields({
    orderType: 'Säännölliset tilaukset', products: ['Paperituotteet'], needs: '20 laatikkoa kuukaudessa',
    company: 'Yritys Oy', businessId: '', contactName: 'Testi Asiakas', email: 'asiakas@example.fi', phone: '040 123 4567', location: 'Helsinki',
  }), /pakolliset kentät/i)
})

test('business quote creates one owner notification and one customer confirmation', () => {
  const quote = {
    orderType: 'Säännölliset tilaukset', products: ['Paperituotteet'], needs: '20 laatikkoa kuukaudessa',
    company: 'Yritys Oy', businessId: '1234567-8', contactName: 'Testi Asiakas', email: 'asiakas@example.fi', phone: '040 123 4567', location: 'Helsinki',
  }
  const messages = createBusinessQuoteMailMessages({ quote, attachment: null, from: 'kauppa@example.fi', ownerRecipients: 'omistaja@example.fi' })
  assert.equal(messages.length, 2)
  assert.equal(messages[0].to, 'omistaja@example.fi')
  assert.equal(messages[1].to, quote.email)
  assert.match(messages[1].subject, /vastaanotettu/i)
})

test('business quote owner email escapes customer-provided HTML', () => {
  const quote = {
    orderType: 'Kertatilaus', products: ['Muut tuotteet'], needs: '<script>alert(1)</script>',
    company: '<b>Yritys</b>', businessId: '', contactName: 'Testi', email: 'asiakas@example.fi', phone: '123', location: 'Turku',
  }
  const [owner] = createBusinessQuoteMailMessages({ quote, attachment: null, from: 'kauppa@example.fi', ownerRecipients: 'omistaja@example.fi' })
  assert.doesNotMatch(owner.html, /<script>|<b>Yritys<\/b>/)
  assert.match(owner.html, /&lt;script&gt;/)
})
