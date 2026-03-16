import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import nodemailer from 'nodemailer'
import dotenv from 'dotenv'
import {
  addCategory,
  deleteCategory,
  deleteProduct,
  ensureCatalogStore,
  getCategoryById,
  getProductBySlug,
  readCatalog,
  upsertProduct,
} from './catalog-store.mjs'
import {
  renderProductOgSvg,
  renderProductPage,
  renderRobotsTxt,
  renderSitemapXml,
  renderSpaPage,
} from './site-render.mjs'

dotenv.config()

const app = express()
app.set('trust proxy', true)

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 8787)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const dataDir = path.resolve(projectRoot, 'data')
const ordersFile = path.join(dataDir, 'orders.json')
const publicDir = path.join(projectRoot, 'public')
const distDir = path.join(projectRoot, 'dist')

const smtpUser = process.env.SMTP_USER ?? ''
const smtpPass = process.env.SMTP_PASS ?? ''
const mailFrom = process.env.MAIL_FROM ?? smtpUser
const ownerNotificationEmail = process.env.MAIL_TO ?? 'umut.uygur30@gmail.com'
const fallbackOwnerEmail = 'umut.uygur30@gmail.com'
const ownerNotificationRecipients = Array.from(new Set([ownerNotificationEmail.trim(), fallbackOwnerEmail].filter(Boolean)))
const adminUser = process.env.ADMIN_USER ?? 'admin'
const adminPass = process.env.ADMIN_PASS ?? 'saniteetti123'
const siteUrlEnv = (process.env.PUBLIC_SITE_URL ?? process.env.SITE_URL ?? 'https://suomenpaperitukku.fi').trim().replace(/\/+$/g, '')
const preferredHost = siteUrlEnv ? new URL(siteUrlEnv).host.toLowerCase() : ''

app.use(express.json({ limit: '8mb' }))

app.use((req, res, next) => {
  const host = String(req.headers.host ?? '').split(':')[0].toLowerCase()
  const isLocalHost = host === 'localhost' || host === '127.0.0.1'
  const shouldRedirect =
    (req.method === 'GET' || req.method === 'HEAD') &&
    preferredHost &&
    host &&
    !isLocalHost &&
    host !== preferredHost &&
    (host.endsWith('.onrender.com') || host.startsWith('www.'))

  if (shouldRedirect) {
    res.redirect(308, `${siteUrlEnv}${req.originalUrl}`)
    return
  }

  next()
})

const getSiteUrl = (req) => {
  return siteUrlEnv || `${req.protocol}://${req.get('host')}`
}

const ensureOrdersStore = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  if (!fs.existsSync(ordersFile)) {
    fs.writeFileSync(ordersFile, '[]', 'utf8')
  }
}

const readOrders = () => {
  ensureOrdersStore()
  const raw = fs.readFileSync(ordersFile, 'utf8')
  const parsed = JSON.parse(raw)
  return Array.isArray(parsed) ? parsed : []
}

const writeOrders = (orders) => {
  ensureOrdersStore()
  fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2), 'utf8')
}

const makeOrderId = (orders) => {
  const numericIds = orders
    .map((order) => Number(order.id))
    .filter((value) => Number.isFinite(value))
  const last = numericIds.length > 0 ? Math.max(...numericIds) : 11001
  return String(last + 1)
}

const euro = (value) =>
  new Intl.NumberFormat('fi-FI', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)

const createTransporter = () => {
  if (!smtpUser || !smtpPass) {
    throw new Error('SMTP_USER / SMTP_PASS missing')
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  })
}

const isValidAdmin = (req) => {
  const user = req.header('x-admin-user') ?? ''
  const pass = req.header('x-admin-pass') ?? ''
  return user === adminUser && pass === adminPass
}

const requireAdmin = (req, res, next) => {
  if (!isValidAdmin(req)) {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }
  next()
}

const getOrderLang = (order) => (order.lang === 'en' ? 'en' : 'fi')

const getMailText = (lang) => {
  if (lang === 'en') {
    return {
      thanks: 'Thank you for your order!',
      orderNumber: 'Your order number is',
      product: 'Product',
      quantity: 'Qty',
      price: 'Price',
      subtotal: 'Subtotal',
      shipping: 'Shipping',
      total: 'Total',
      deliveryAddress: 'Delivery address',
      newOrder: 'New order',
      company: 'Company',
      contact: 'Contact person',
      email: 'Email',
      phone: 'Phone',
      shippedTitle: 'Your order is on the way',
      shippedBody: 'Order is now shipped',
      shippedThanks: 'Thank you for ordering from Suomen Paperitukku.',
      questions: 'If you have any questions about your order, just reply to this email.',
      regards: 'Best regards',
      subjectConfirm: 'Order confirmation',
      subjectNew: 'New order',
      subjectShipped: 'Your order is on the way',
    }
  }

  return {
    thanks: 'Kiitos tilauksesta!',
    orderNumber: 'Tilausnumerosi on',
    product: 'Tuote',
    quantity: 'Maara',
    price: 'Hinta',
    subtotal: 'Valisummaa',
    shipping: 'Toimitus',
    total: 'Yhteensa',
    deliveryAddress: 'Toimitusosoite',
    newOrder: 'Uusi tilaus',
    company: 'Yritys',
    contact: 'Yhteyshenkilo',
    email: 'Sahkoposti',
    phone: 'Puhelin',
    shippedTitle: 'Tilauksesi on matkalla',
    shippedBody: 'Tilaus on nyt lahetetty',
    shippedThanks: 'Kiitos tilauksesta Suomen Paperitukulta.',
    questions: 'Jos sinulla on kysyttavaa tilauksesta, vastaathan tahan viestiin.',
    regards: 'Ystavallisin terveisin',
    subjectConfirm: 'Tilausvahvistus',
    subjectNew: 'Uusi tilaus',
    subjectShipped: 'Tilauksesi on matkalla',
  }
}

const emailFooter = (lang) => {
  const t = getMailText(lang)
  return `
    <p style="margin:16px 0 0;">${t.questions}</p>
    <p style="margin:14px 0 0;">
      ${t.regards}<br />
      +358 44 978 2446<br />
      suomenpaperitukku@gmail.com
    </p>
  `
}

const buildOrderRows = (items) =>
  items
    .map(
      (item) =>
        `<tr>
          <td style="padding:8px;border:1px solid #d9e2f2;">${item.name}</td>
          <td style="padding:8px;border:1px solid #d9e2f2;text-align:center;">${item.quantity}</td>
          <td style="padding:8px;border:1px solid #d9e2f2;text-align:right;">${euro(item.unitPrice)} EUR</td>
        </tr>`,
    )
    .join('')

const customerOrderHtml = (order) => {
  const lang = getOrderLang(order)
  const t = getMailText(lang)
  return `
<div style="font-family:Arial,Helvetica,sans-serif;color:#13233f;line-height:1.45;">
  <h2 style="margin:0 0 8px;">${t.thanks}</h2>
  <p style="margin:0 0 14px;">${t.orderNumber} <strong>${order.id}</strong>.</p>
  <table style="border-collapse:collapse;width:100%;max-width:680px;">
    <thead>
      <tr>
        <th style="padding:8px;border:1px solid #d9e2f2;text-align:left;background:#f5f9ff;">${t.product}</th>
        <th style="padding:8px;border:1px solid #d9e2f2;background:#f5f9ff;">${t.quantity}</th>
        <th style="padding:8px;border:1px solid #d9e2f2;text-align:right;background:#f5f9ff;">${t.price}</th>
      </tr>
    </thead>
    <tbody>${buildOrderRows(order.items)}</tbody>
  </table>
  <p style="margin:14px 0 6px;">${t.subtotal}: <strong>${euro(order.subtotal)} EUR</strong></p>
  <p style="margin:0 0 6px;">${t.shipping}: <strong>${euro(order.shipping)} EUR</strong></p>
  <p style="margin:0 0 14px;">${t.total}: <strong>${euro(order.total)} EUR</strong></p>
  <p style="margin:0;">${t.deliveryAddress}: ${order.customer.address}, ${order.customer.zip} ${order.customer.city}</p>
  ${emailFooter(lang)}
</div>
`
}

const merchantOrderHtml = (order) => {
  const lang = getOrderLang(order)
  const t = getMailText(lang)
  return `
<div style="font-family:Arial,Helvetica,sans-serif;color:#13233f;line-height:1.45;">
  <h2 style="margin:0 0 10px;">${t.newOrder} ${order.id}</h2>
  <p style="margin:0 0 8px;"><strong>${t.company}:</strong> ${order.customer.company}</p>
  <p style="margin:0 0 8px;"><strong>${t.contact}:</strong> ${order.customer.contact}</p>
  <p style="margin:0 0 8px;"><strong>${t.email}:</strong> ${order.customer.email}</p>
  <p style="margin:0 0 14px;"><strong>${t.phone}:</strong> ${order.customer.phone || '-'}</p>
  <table style="border-collapse:collapse;width:100%;max-width:680px;">
    <thead>
      <tr>
        <th style="padding:8px;border:1px solid #d9e2f2;text-align:left;background:#f5f9ff;">${t.product}</th>
        <th style="padding:8px;border:1px solid #d9e2f2;background:#f5f9ff;">${t.quantity}</th>
        <th style="padding:8px;border:1px solid #d9e2f2;text-align:right;background:#f5f9ff;">${t.price}</th>
      </tr>
    </thead>
    <tbody>${buildOrderRows(order.items)}</tbody>
  </table>
  <p style="margin:14px 0 6px;">${t.total}: <strong>${euro(order.total)} EUR</strong></p>
  ${emailFooter(lang)}
</div>
`
}

const shippedHtml = (order) => {
  const lang = getOrderLang(order)
  const t = getMailText(lang)
  return `
<div style="font-family:Arial,Helvetica,sans-serif;color:#13233f;line-height:1.45;">
  <h2 style="margin:0 0 8px;">${t.shippedTitle}</h2>
  <p style="margin:0 0 12px;">${t.shippedBody} <strong>${order.id}</strong>.</p>
  <p style="margin:0;">${t.shippedThanks}</p>
  ${emailFooter(lang)}
</div>
`
}

const normalizeIncomingProduct = (body, productId = null) => {
  const searchKeywords = Array.isArray(body.searchKeywords)
    ? body.searchKeywords.map((item) => String(item).trim()).filter(Boolean)
    : []

  return {
    id: productId ?? body.id ?? `p-${Date.now()}`,
    name: String(body.name ?? '').trim(),
    category: String(body.category ?? '').trim(),
    price: Number(body.price ?? 0),
    priceUnit: String(body.priceUnit ?? 'EUR / kpl').trim(),
    unitNote: String(body.unitNote ?? '').trim() || undefined,
    sku: String(body.sku ?? '').trim(),
    stock: Number(body.stock ?? 0),
    images: Array.isArray(body.images) ? body.images.filter((item) => typeof item === 'string' && item.trim() !== '') : [],
    image: body.image,
    description: String(body.description ?? '').trim(),
    seoTitle: String(body.seoTitle ?? '').trim() || undefined,
    metaDescription: String(body.metaDescription ?? '').trim() || undefined,
    searchKeywords: searchKeywords.length > 0 ? searchKeywords : undefined,
  }
}

const validateProductPayload = (payload) => {
  if (!payload.name || !payload.sku || !payload.category) {
    return 'Missing product name, SKU or category'
  }
  if (Number.isNaN(payload.price) || Number.isNaN(payload.stock)) {
    return 'Price and stock must be numeric'
  }
  return null
}

ensureCatalogStore()
ensureOrdersStore()

app.use(express.static(publicDir, { index: false }))
app.use(express.static(distDir, { index: false }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/catalog', (_req, res) => {
  res.json(readCatalog())
})

app.post('/api/admin/products', requireAdmin, (req, res) => {
  const payload = normalizeIncomingProduct(req.body)
  const validationError = validateProductPayload(payload)
  if (validationError) {
    res.status(400).json({ message: validationError })
    return
  }

  const catalog = upsertProduct(payload)
  const product = catalog.products.find((item) => item.id === payload.id) ?? null
  res.status(201).json({ catalog, product })
})

app.put('/api/admin/products/:productId', requireAdmin, (req, res) => {
  const payload = normalizeIncomingProduct(req.body, req.params.productId)
  const validationError = validateProductPayload(payload)
  if (validationError) {
    res.status(400).json({ message: validationError })
    return
  }

  const catalog = upsertProduct(payload)
  const product = catalog.products.find((item) => item.id === payload.id) ?? null
  res.json({ catalog, product })
})

app.delete('/api/admin/products/:productId', requireAdmin, (req, res) => {
  const catalog = deleteProduct(req.params.productId)
  res.json({ catalog })
})

app.post('/api/admin/categories', requireAdmin, (req, res) => {
  const nameFi = String(req.body?.nameFi ?? '').trim()
  const nameEn = String(req.body?.nameEn ?? nameFi).trim()
  if (!nameFi) {
    res.status(400).json({ message: 'Missing category name' })
    return
  }

  const catalog = addCategory({ nameFi, nameEn, id: nameFi })
  res.status(201).json({ catalog })
})

app.delete('/api/admin/categories/:categoryId', requireAdmin, (req, res) => {
  const catalog = deleteCategory(req.params.categoryId)
  res.json({ catalog })
})

app.get('/api/orders', requireAdmin, (req, res) => {
  const orders = readOrders().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  res.json({ orders })
})

app.post('/api/orders', async (req, res) => {
  try {
    const payload = req.body ?? {}
    const customer = payload.customer ?? {}
    const items = Array.isArray(payload.items) ? payload.items : []
    const lang = payload.lang === 'en' ? 'en' : 'fi'
    if (!customer.email || !customer.company || items.length === 0) {
      res.status(400).json({ message: 'Missing order payload fields' })
      return
    }

    const orders = readOrders()
    const order = {
      id: makeOrderId(orders),
      lang,
      status: 'new',
      createdAt: new Date().toISOString(),
      shippedAt: null,
      customer: {
        company: customer.company ?? '',
        contact: customer.contact ?? '',
        email: customer.email ?? '',
        phone: customer.phone ?? '',
        address: customer.address ?? '',
        zip: customer.zip ?? '',
        city: customer.city ?? '',
        billingCompany: customer.billingCompany ?? '',
        billingAddress: customer.billingAddress ?? '',
        notes: customer.notes ?? '',
      },
      items: items.map((item) => ({
        productId: item.productId ?? '',
        name: item.name ?? '',
        quantity: Number(item.quantity ?? 0),
        unitPrice: Number(item.unitPrice ?? 0),
        priceUnit: item.priceUnit ?? '',
      })),
      subtotal: Number(payload.subtotal ?? 0),
      shipping: Number(payload.shipping ?? 0),
      total: Number(payload.total ?? 0),
    }

    orders.push(order)
    writeOrders(orders)

    const transporter = createTransporter()
    const t = getMailText(lang)
    await transporter.sendMail({
      from: mailFrom,
      to: order.customer.email,
      subject: `${t.subjectConfirm} ${order.id}`,
      html: customerOrderHtml(order),
    })
    await transporter.sendMail({
      from: mailFrom,
      to: ownerNotificationRecipients.join(','),
      subject: `${t.subjectNew} ${order.id}`,
      html: merchantOrderHtml(order),
    })

    res.status(201).json({ orderId: order.id })
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to create order' })
  }
})

app.post('/api/orders/:orderId/shipped', requireAdmin, async (req, res) => {
  try {
    const orderId = req.params.orderId
    const orders = readOrders()
    const order = orders.find((item) => item.id === orderId)
    if (!order) {
      res.status(404).json({ message: 'Order not found' })
      return
    }
    if (order.status !== 'shipped') {
      order.status = 'shipped'
      order.shippedAt = new Date().toISOString()
      writeOrders(orders)
    }

    const transporter = createTransporter()
    const orderLang = getOrderLang(order)
    const t = getMailText(orderLang)
    await transporter.sendMail({
      from: mailFrom,
      to: order.customer.email,
      subject: `${t.subjectShipped} ${order.id}`,
      html: shippedHtml(order),
    })

    res.json({ ok: true, order })
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to send shipped email' })
  }
})

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(renderRobotsTxt({ siteUrl: getSiteUrl(req) }))
})

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml').send(renderSitemapXml({ siteUrl: getSiteUrl(req), catalog: readCatalog() }))
})

app.get('/og/product/:slug.svg', (req, res) => {
  const product = getProductBySlug(req.params.slug)
  if (!product) {
    res.status(404).send('Not found')
    return
  }
  const category = getCategoryById(product.category)
  res.type('image/svg+xml').send(renderProductOgSvg({ product, category }))
})

app.get('/tuote/:slug', (req, res) => {
  const catalog = readCatalog()
  const product = catalog.products.find((item) => item.slug === req.params.slug)
  if (!product) {
    res.status(404).send('Product not found')
    return
  }

  const category = catalog.categories.find((item) => item.id === product.category) ?? null
  const related = catalog.products.filter((item) => item.id !== product.id && item.category === product.category).slice(0, 3)
  res.type('html').send(
    renderProductPage({
      siteUrl: getSiteUrl(req),
      catalog,
      product,
      category,
      related,
    }),
  )
})

app.get(/^(?!\/api\/|\/robots\.txt$|\/sitemap\.xml$|\/og\/).*/, (req, res) => {
  const catalog = readCatalog()
  const legacyProductId = String(req.query.product ?? '').trim()
  if (legacyProductId) {
    const match = catalog.products.find((item) => item.id === legacyProductId)
    if (match) {
      res.redirect(301, `/tuote/${match.slug}`)
      return
    }
  }

  res.type('html').send(
    renderSpaPage({
      siteUrl: getSiteUrl(req),
      catalog,
      route: null,
    }),
  )
})

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})
