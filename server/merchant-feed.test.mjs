import assert from 'node:assert/strict'
import test from 'node:test'
import {
  auditGoogleMerchantCatalog,
  buildGoogleMerchantItems,
  isArtificialSptSku,
  isValidGtin,
  renderGoogleMerchantXml,
} from './merchant-feed.mjs'

const catalog = {
  products: [
    {
      id: 'stable-1',
      slug: 'tork-testituote',
      name: 'Tork H1 testituote - 290067',
      description: 'Testi & kuvaus',
      sku: '37001',
      stock: 2,
      price: 12.5,
      image: '/media/product/tork-testituote/0',
    },
    {
      id: 'stable-2',
      slug: 'tuntematon-tuote',
      name: 'Tuntematon tuote',
      description: '',
      sku: '37002',
      stock: 0,
      price: 3,
      image: 'https://cdn.example.test/product.jpg',
    },
  ],
}

test('renders a public Google Merchant RSS feed without inline images', () => {
  const xml = renderGoogleMerchantXml({ siteUrl: 'https://suomenpaperitukku.fi', catalog })

  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/)
  assert.match(xml, /<rss xmlns:g="http:\/\/base\.google\.com\/ns\/1\.0" version="2\.0">/)
  assert.equal((xml.match(/<item>/g) ?? []).length, 2)
  assert.match(xml, /<g:link>https:\/\/suomenpaperitukku\.fi\/tuote\/tork-testituote<\/g:link>/)
  assert.match(xml, /<g:image_link>https:\/\/suomenpaperitukku\.fi\/media\/product\/tork-testituote\/0<\/g:image_link>/)
  assert.doesNotMatch(xml, /data:image/i)
  assert.match(xml, /Testi &amp; kuvaus/)
})

test('never exposes artificial SPT SKUs as MPNs', () => {
  const items = buildGoogleMerchantItems({ siteUrl: 'https://suomenpaperitukku.fi', catalog })

  assert.equal(items[0].mpn, '290067')
  assert.equal(items[1].mpn, null)
  assert.doesNotMatch(renderGoogleMerchantXml({ siteUrl: 'https://suomenpaperitukku.fi', catalog }), /<g:mpn>3700[12]<\/g:mpn>/)
  assert.equal(isArtificialSptSku('37001'), true)
  assert.equal(isArtificialSptSku('372017'), true)
  assert.equal(isArtificialSptSku('37780'), false)
  assert.equal(isArtificialSptSku('290067'), false)
})

test('uses valid GTIN checksums only', () => {
  assert.equal(isValidGtin('6417964411171'), true)
  assert.equal(isValidGtin('6417964411172'), false)
  assert.equal(isValidGtin('37001'), false)
})

test('does not assume a valid-looking 8-digit manufacturer SKU is a GTIN', () => {
  const items = buildGoogleMerchantItems({
    siteUrl: 'https://suomenpaperitukku.fi',
    catalog: {
      products: [{ ...catalog.products[0], id: 'stable-3', sku: '50000470', name: 'Nilfisk testituote' }],
    },
  })

  assert.equal(items[0].gtin, null)
})

test('excludes explicitly inactive products while keeping out-of-stock products', () => {
  const items = buildGoogleMerchantItems({
    siteUrl: 'https://suomenpaperitukku.fi',
    catalog: {
      products: [catalog.products[0], { ...catalog.products[1], active: false }],
    },
  })

  assert.equal(items.length, 1)
  assert.equal(items[0].id, 'stable-1')
})

test('maps stock and price to Merchant values', () => {
  const items = buildGoogleMerchantItems({ siteUrl: 'https://suomenpaperitukku.fi', catalog })

  assert.equal(items[0].availability, 'in_stock')
  assert.equal(items[0].price, '12.50 EUR')
  assert.equal(items[1].availability, 'out_of_stock')
  assert.equal(items[1].price, '3.00 EUR')
})

test('audit counts every current catalog product dynamically', () => {
  const audit = auditGoogleMerchantCatalog({ siteUrl: 'https://suomenpaperitukku.fi', catalog })

  assert.equal(audit.products, 2)
  assert.equal(audit.requiredFieldsComplete, 2)
  assert.equal(audit.withImage, 2)
  assert.equal(audit.artificialSkuProducts.length, 2)
})

test('a later catalog product appears without rebuilding or reloading the feed module', () => {
  const firstXml = renderGoogleMerchantXml({
    siteUrl: 'https://suomenpaperitukku.fi',
    catalog: { products: [catalog.products[0]] },
  })
  const laterXml = renderGoogleMerchantXml({
    siteUrl: 'https://suomenpaperitukku.fi',
    catalog: { products: catalog.products },
  })

  assert.equal((firstXml.match(/<item>/g) ?? []).length, 1)
  assert.equal((laterXml.match(/<item>/g) ?? []).length, 2)
  assert.match(laterXml, /<g:id>stable-2<\/g:id>/)
})

test('feed rendering and auditing never mutate the catalog', () => {
  const input = structuredClone(catalog)
  const before = structuredClone(input)

  renderGoogleMerchantXml({ siteUrl: 'https://suomenpaperitukku.fi', catalog: input })
  auditGoogleMerchantCatalog({ siteUrl: 'https://suomenpaperitukku.fi', catalog: input })

  assert.deepEqual(input, before)
})
