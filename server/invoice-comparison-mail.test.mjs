import assert from 'node:assert/strict'
import test from 'node:test'
import { createInvoiceComparisonMailMessages } from './invoice-comparison-mail.mjs'

test('invoice comparison creates exactly one customer confirmation and one internal notification', () => {
  const record = {
    id: 'request-123',
    createdAt: '2026-10-03T12:00:00.000Z',
    company: 'Testiyritys Oy',
    contactName: 'Testi Henkilö',
    email: 'customer@example.com',
    phone: '040 123 4567',
    message: 'Testiviesti',
    attachment: {
      originalName: 'lasku.pdf',
      mimeType: 'application/pdf',
      size: 1234,
    },
  }

  const messages = createInvoiceComparisonMailMessages({
    record,
    attachmentPath: 'C:\\private\\uploads\\random.pdf',
    from: 'Suomen Paperitukku <info@suomenpaperitukku.fi>',
    notificationEmail: 'info@suomenpaperitukku.fi',
  })

  assert.equal(messages.length, 2)
  assert.equal(messages[0].to, record.email)
  assert.equal(messages[1].to, 'info@suomenpaperitukku.fi')
  assert.equal(messages.some((message) => message.cc || message.bcc), false)
  assert.equal(messages[0].attachments, undefined)
  assert.deepEqual(messages[1].attachments, [{
    filename: 'lasku.pdf',
    path: 'C:\\private\\uploads\\random.pdf',
    contentType: 'application/pdf',
  }])
  assert.equal(messages[0].subject, 'Laskusi on vastaanotettu | Suomen Paperitukku')
  assert.match(messages[0].html, /Hei Testi!/)
  assert.match(messages[0].html, /Lasku vastaanotettu/)
  assert.match(messages[0].html, /Tavoitteemme on pienent&auml;&auml; yrityksesi nykyisi&auml; hankintakuluja merkitt&auml;v&auml;sti\./)
  assert.match(messages[0].html, /Vertailu on t&auml;ysin ilmainen eik&auml; sido mihink&auml;&auml;n\./)
  assert.match(messages[0].html, /Jos tarvitsemme laskuun liittyen lis&auml;tietoja, olemme sinuun yhteydess&auml;\./)
  assert.match(messages[1].subject, /uusi laskuvertailupyyntö/i)
})

test('invoice comparison email content escapes customer-provided HTML', () => {
  const messages = createInvoiceComparisonMailMessages({
    record: {
      id: 'request-456',
      createdAt: '2026-10-03T12:00:00.000Z',
      company: '<script>alert(1)</script>',
      contactName: '<b>Nimi</b>',
      email: 'customer@example.com',
      phone: '040 123 4567',
      message: '<img src=x onerror=alert(1)>',
      attachment: {
        originalName: 'lasku.png',
        mimeType: 'image/png',
        size: 1234,
      },
    },
    attachmentPath: 'C:\\private\\uploads\\random.png',
    from: 'Suomen Paperitukku <info@suomenpaperitukku.fi>',
    notificationEmail: 'info@suomenpaperitukku.fi',
  })

  assert.doesNotMatch(messages[0].html, /<script>/i)
  assert.doesNotMatch(messages[1].html, /<img src=x/i)
  assert.match(messages[0].html, /&lt;b&gt;Nimi&lt;\/b&gt;/)
  assert.match(messages[1].html, /&lt;img src=x onerror=alert\(1\)&gt;/)
})
