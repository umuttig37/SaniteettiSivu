import assert from 'node:assert/strict'
import test from 'node:test'
import nodemailer from 'nodemailer'
import {
  createMatOrderMailMessages,
  decodePrivateAttachment,
  getLowestMatPrice,
  getMinimumPricesBySize,
  matServiceConfig,
  resolveMatSelection,
  resolveMatSelections,
} from './mat-service.mjs'
import { renderMatServicePage, renderRobotsTxt, renderSitemapXml } from './site-render.mjs'

const cases = [
  [{ size: '85x150', color: 'gray', interval: 'monthly', quantity: 1 }, 1.99, 1.99],
  [{ size: '115x200', color: 'brown', interval: 'twiceMonthly', quantity: 1 }, 6.96, 6.96],
  [{ size: '115x200', color: 'brown', interval: 'twiceMonthly', quantity: 3 }, 6.96, 20.88],
  [{ size: '115x240', color: 'gray', interval: 'weekly', quantity: 2 }, 10.05, 20.10],
  [{ size: '150x250', color: 'darkgray', interval: 'monthly', quantity: 2 }, 8.29, 16.58],
]

const expectedNormalPrices = {
  '85x150': {
    red: [7.30, 4.35, 2.39],
    brown: [7.30, 4.35, 2.39],
    gray: [6.90, 3.50, 1.99],
    darkgray: [8.29, 4.60, 3.39],
  },
  '115x200': {
    red: [11.90, 6.96, 3.99],
    brown: [11.90, 6.96, 3.99],
    gray: [9.90, 5.96, 3.39],
    darkgray: [12.63, 6.99, 4.00],
  },
  '115x240': {
    brown: [14.29, 9.00, 4.29],
    gray: [10.05, 7.10, 3.79],
    darkgray: [15.90, 9.90, 5.90],
  },
  '85x250': {
    gray: [9.59, 5.90, 3.35],
    darkgray: [12.63, 6.99, 4.00],
  },
  '150x250': {
    brown: [19.90, 14.89, 7.29],
    gray: [14.49, 9.90, 5.69],
    darkgray: [22.10, 17.89, 8.29],
  },
}

const expectedDesignPrices = {
  '85x150': [13.80, 9.20, 6.10],
  '115x200': [19.90, 12.15, 8.99],
  '115x240': [24.55, 14.90, 10.35],
  '115x300': [22.55, 12.75, 11.95],
  '150x200': [26.75, 17.20, 12.25],
  '150x250': [30.55, 18.95, 13.90],
}

const expectedIndustrialPrices = {
  '85x150': [5.93, 3.79],
  '115x200': [6.91, 4.25],
  '115x240': [10.48, 6.54],
}

const intervalTuple = (prices) => [prices.weekly, prices.twiceMonthly, prices.monthly]

test('mat service resolves the required public price examples', () => {
  for (const [input, expectedUnit, expectedTotal] of cases) {
    const result = resolveMatSelection(input)
    assert.ok(result)
    assert.equal(result.unitPrice, expectedUnit)
    assert.equal(result.weeklyTotal, expectedTotal)
  }
})

test('all normal mat prices match the SPT sales prices', () => {
  assert.deepEqual(
    Object.fromEntries(matServiceConfig.sizes.map((size) => [
      size.id,
      Object.fromEntries(Object.entries(size.prices).map(([color, prices]) => [color, intervalTuple(prices)])),
    ])),
    expectedNormalPrices,
  )
})

test('design mat sizes and prices match the sales price table', () => {
  const designSizes = matServiceConfig.services.design.sizes
  assert.equal(designSizes.some((size) => size.id === '85x250'), false)
  assert.deepEqual(
    Object.fromEntries(designSizes.map((size) => [size.id, intervalTuple(size.intervalPrices)])),
    expectedDesignPrices,
  )

  for (const [size, prices] of Object.entries(expectedDesignPrices)) {
    for (const [index, interval] of ['weekly', 'twiceMonthly', 'monthly'].entries()) {
      const result = resolveMatSelection({
        serviceType: 'design',
        size,
        color: 'vivi-red',
        interval,
        quantity: 1,
      })
      assert.ok(result)
      assert.equal(result.unitPrice, prices[index])
    }
  }
})

test('design and industrial mats resolve from the shared service config', () => {
  assert.equal(matServiceConfig.services.industrial.enabled, true)
  assert.ok(matServiceConfig.services.industrial.sizes || matServiceConfig.services.industrial.sizeIds)
  const design = resolveMatSelection({
    serviceType: 'design',
    size: '150x200',
    color: 'vivi-red',
    interval: 'weekly',
    quantity: 3,
  })
  assert.ok(design)
  assert.equal(design.serviceLabel, 'Designmatto')
  assert.equal(design.unitPrice, 26.75)
  assert.equal(design.weeklyTotal, 80.25)

  const industrial = resolveMatSelection({
    serviceType: 'industrial',
    size: '115x240',
    color: 'industrial-dark',
    interval: 'weekly',
    quantity: 2,
  })
  assert.ok(industrial)
  assert.equal(industrial.serviceLabel, 'Teollisuusmatto')
  assert.equal(industrial.quoteOnly, false)
  assert.equal(industrial.unitPrice, 10.48)
  assert.equal(industrial.weeklyTotal, 20.96)
  assert.deepEqual(
    Object.fromEntries(matServiceConfig.services.industrial.sizes.map((size) => [
      size.id,
      [size.intervalPrices.weekly, size.intervalPrices.twiceMonthly],
    ])),
    expectedIndustrialPrices,
  )
  for (const [size, prices] of Object.entries(expectedIndustrialPrices)) {
    for (const [index, interval] of ['weekly', 'twiceMonthly'].entries()) {
      const result = resolveMatSelection({
        serviceType: 'industrial',
        size,
        color: 'industrial-dark',
        interval,
        quantity: 1,
      })
      assert.ok(result)
      assert.equal(result.unitPrice, prices[index])
    }
  }
  assert.deepEqual(matServiceConfig.services.industrial.intervalIds, ['weekly', 'twiceMonthly'])
  assert.equal(resolveMatSelection({ serviceType: 'industrial', size: '115x240', color: 'industrial-dark', interval: 'monthly', quantity: 1 }), null)
})

test('multiple mat selections are validated and priced independently', () => {
  const selections = resolveMatSelections({
    selections: [
      { serviceType: 'mat', size: '85x150', color: 'gray', interval: 'monthly', quantity: 2 },
      { serviceType: 'design', size: '150x200', color: 'vivi-red', interval: 'weekly', quantity: 1 },
      { serviceType: 'industrial', size: '115x240', color: 'industrial-dark', interval: 'twiceMonthly', quantity: 3 },
    ],
  })
  assert.ok(selections)
  assert.equal(selections.length, 3)
  assert.deepEqual(selections.map((selection) => selection.weeklyTotal), [3.98, 26.75, 19.62])
})

test('multiple mat selections reject an invalid item and excessive item counts', () => {
  assert.equal(resolveMatSelections({ selections: [
    { serviceType: 'mat', size: '85x150', color: 'gray', interval: 'monthly', quantity: 1 },
    { serviceType: 'mat', size: '85x250', color: 'red', interval: 'monthly', quantity: 1 },
  ] }), null)
  assert.equal(resolveMatSelections({ selections: [] }), null)
  assert.equal(resolveMatSelections({ selections: Array.from({ length: 21 }, () => cases[0][0]) }), null)
})

test('lowest and starting prices are derived from the shared price config', () => {
  assert.equal(getLowestMatPrice(), 1.99)
  const size = matServiceConfig.sizes.find((item) => item.id === '85x150')
  assert.ok(size)
  assert.deepEqual(getMinimumPricesBySize(size), {
    weekly: 6.90,
    twiceMonthly: 3.50,
    monthly: 1.99,
  })
})

test('mat order creates one owner email and one customer confirmation email', async () => {
  const messages = createMatOrderMailMessages({
    from: 'Suomen Paperitukku <info@suomenpaperitukku.fi>',
    ownerRecipients: ['owner@example.com'],
    customerEmail: 'customer@example.com',
    ownerHtml: '<p>Owner order details</p>',
    customerHtml: '<p>Customer confirmation</p>',
  })

  assert.equal(messages.length, 2)
  assert.equal(messages[0].to, 'owner@example.com')
  assert.equal(messages[0].replyTo, 'customer@example.com')
  assert.equal(messages[0].subject, 'Lindström mattopalvelun uusi tilauspyyntö')
  assert.equal(messages[1].to, 'customer@example.com')
  assert.equal(messages[1].subject, 'Mattopalvelun tilauspyyntö vastaanotettu')

  const transporter = nodemailer.createTransport({ jsonTransport: true })
  const sentMessages = await Promise.all(messages.map((message) => transporter.sendMail(message)))
  assert.equal(sentMessages.length, 2)
  assert.equal(JSON.parse(sentMessages[0].message).to[0].address, 'owner@example.com')
  assert.equal(JSON.parse(sentMessages[1].message).to[0].address, 'customer@example.com')
})

test('unavailable color and invalid quantity combinations are rejected', () => {
  assert.equal(resolveMatSelection({ size: '85x250', color: 'red', interval: 'monthly', quantity: 1 }), null)
  assert.equal(resolveMatSelection({ size: '85x150', color: 'gray', interval: 'monthly', quantity: 0 }), null)
  assert.equal(resolveMatSelection({ serviceType: 'design', size: '85x150', color: 'gray', interval: 'monthly', quantity: 1 }), null)
  assert.equal(resolveMatSelection({ serviceType: 'industrial', size: '85x150', color: 'vivi-red', interval: 'monthly', quantity: 1 }), null)
})

test('private attachment accepts matching PDF data and sanitizes filename', () => {
  const attachment = decodePrivateAttachment({
    name: '../../lasku test.pdf',
    type: 'application/pdf',
    base64: Buffer.from('%PDF-1.7\nexample').toString('base64'),
  })
  assert.equal(attachment.filename, 'lasku_test.pdf')
  assert.equal(attachment.contentType, 'application/pdf')
})

test('private attachment rejects spoofed file content', () => {
  assert.throws(
    () => decodePrivateAttachment({
      name: 'lasku.pdf',
      type: 'application/pdf',
      base64: Buffer.from('not a pdf').toString('base64'),
    }),
    /sisältö ei vastaa/,
  )
})

test('public mat service page is fully indexable in server-rendered HTML', () => {
  const siteUrl = 'https://suomenpaperitukku.fi'
  const html = renderMatServicePage({ siteUrl })
  assert.match(html, /<title>Lindström-vaihtomatot yrityksille alk\. 1,99 €\/vk \| Suomen Paperitukku<\/title>/)
  assert.match(html, /<meta name="description" content="Lindström-vaihtomatot ja mattovuokraus yrityksille alk\. 1,99 €\/vk \+ alv\./)
  assert.match(html, /<link rel="canonical" href="https:\/\/suomenpaperitukku\.fi\/vaihtomatot-yrityksille"/)
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1)
  assert.match(html, /<h1>Lindstr&ouml;m-vaihtomatot yrityksille<\/h1>/)
  assert.match(html, /Lindstr&ouml;m-vaihtomattojen hinnat yrityksille/)
  assert.match(html, /1,99 &euro;/)
  assert.match(html, /3,50 &euro;/)
  assert.match(html, /6,90 &euro;/)
  assert.match(html, /class="mat-price-cards"/)
  assert.doesNotMatch(html, /class="mat-price-table"/)
  assert.match(html, /Usein kysytty&auml; vaihtomatoista/)
  assert.doesNotMatch(html, /mat-compare/)
  assert.doesNotMatch(html, /Onko yrityksell&auml;si jo Lindstr&ouml;min mattopalvelu/)
  assert.doesNotMatch(html, /mat-service-area/)
  assert.doesNotMatch(html, /footer-text-link" href="\/vaihtomatot-yrityksille"/)
  assert.match(html, /"@type":"Service"/)
  assert.match(html, /"@type":"FAQPage"/)
  assert.doesNotMatch(html, /noindex/)
  assert.match(html, /window\.__INITIAL_CATALOG__ = \{"categories":\[\],"products":\[\]\}/)
})

test('sitemap and robots expose the canonical mat service URL', () => {
  const siteUrl = 'https://suomenpaperitukku.fi'
  const sitemap = renderSitemapXml({ siteUrl, catalog: { categories: [], products: [] } })
  assert.match(sitemap, /<loc>https:\/\/suomenpaperitukku\.fi\/vaihtomatot-yrityksille<\/loc>/)
  const robots = renderRobotsTxt({ siteUrl })
  assert.match(robots, /Allow: \//)
  assert.doesNotMatch(robots, /Disallow: \/vaihtomatot-yrityksille/)
})
