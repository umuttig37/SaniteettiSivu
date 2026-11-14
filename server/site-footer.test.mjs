import assert from 'node:assert/strict'
import test from 'node:test'
import { renderBusinessQuotePage } from './business-quote-page.mjs'
import { renderInvoiceComparisonPage } from './invoice-comparison-page.mjs'
import { renderSiteFooter } from './site-footer.mjs'
import { renderSpaPage } from './site-render.mjs'

test('standalone pages and SSR use the same complete site footer', () => {
  const siteUrl = 'https://example.test'
  const standaloneFooter = renderSiteFooter({ className: 'site-footer', id: 'contact' })
  const ssrFooter = renderSiteFooter()

  assert.match(renderBusinessQuotePage({ siteUrl }), /href="\/site-footer\.css"/)
  assert.ok(renderBusinessQuotePage({ siteUrl }).includes(standaloneFooter))
  assert.match(renderInvoiceComparisonPage({ siteUrl }), /href="\/site-footer\.css"/)
  assert.ok(renderInvoiceComparisonPage({ siteUrl }).includes(standaloneFooter))

  const homeHtml = renderSpaPage({
    siteUrl,
    catalog: { categories: [], products: [] },
    route: { type: 'home' },
  })
  assert.ok(homeHtml.includes(ssrFooter))

  for (const text of [
    'Suomen Paperitukku',
    'Asiakaspalvelu',
    '+358 44 978 2446',
    'info@suomenpaperitukku.fi',
    'Kirjaudu',
    '3590057-8',
    'Tilaus- ja toimitusehdot',
    '&copy; 2026 Suomen Paperitukku - Kastamonu Tmi',
  ]) {
    assert.ok(standaloneFooter.includes(text))
  }
})
