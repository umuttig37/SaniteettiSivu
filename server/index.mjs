import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import nodemailer from 'nodemailer'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const port = Number(process.env.API_PORT ?? 8787)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '..', 'data')
const ordersFile = path.join(dataDir, 'orders.json')

const smtpUser = process.env.SMTP_USER ?? ''
const smtpPass = process.env.SMTP_PASS ?? ''
const mailFrom = process.env.MAIL_FROM ?? smtpUser
const ownerNotificationEmail = process.env.MAIL_TO ?? 'umut.uygur30@gmail.com'
const fallbackOwnerEmail = 'umut.uygur30@gmail.com'
const ownerNotificationRecipients = Array.from(new Set([ownerNotificationEmail.trim(), fallbackOwnerEmail].filter(Boolean)))
const adminUser = process.env.ADMIN_USER ?? 'admin'
const adminPass = process.env.ADMIN_PASS ?? 'saniteetti123'

app.use(express.json({ limit: '2mb' }))

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
  if (!Array.isArray(parsed)) {
    return []
  }
  return parsed
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
    quantity: 'Määrä',
    price: 'Hinta',
    subtotal: 'Välisummaa',
    shipping: 'Toimitus',
    total: 'Yhteensä',
    deliveryAddress: 'Toimitusosoite',
    newOrder: 'Uusi tilaus',
    company: 'Yritys',
    contact: 'Yhteyshenkilö',
    email: 'Sähköposti',
    phone: 'Puhelin',
    shippedTitle: 'Tilauksesi on matkalla',
    shippedBody: 'Tilaus on nyt lähetetty',
    shippedThanks: 'Kiitos tilauksesta Suomen Paperitukulta.',
    questions: 'Jos sinulla on kysyttävää tilauksesta, vastaathan tähän viestiin.',
    regards: 'Ystävällisin terveisin',
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

const buildOrderRows = (items, lang) =>
  items
    .map(
      (item) =>
        `<tr>
          <td style="padding:8px;border:1px solid #d9e2f2;">${item.name}</td>
          <td style="padding:8px;border:1px solid #d9e2f2;text-align:center;">${item.quantity}</td>
          <td style="padding:8px;border:1px solid #d9e2f2;text-align:right;">${euro(item.unitPrice)} €</td>
        </tr>`
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
    <tbody>${buildOrderRows(order.items, lang)}</tbody>
  </table>
  <p style="margin:14px 0 6px;">${t.subtotal}: <strong>${euro(order.subtotal)} €</strong></p>
  <p style="margin:0 0 6px;">${t.shipping}: <strong>${euro(order.shipping)} €</strong></p>
  <p style="margin:0 0 14px;">${t.total}: <strong>${euro(order.total)} €</strong></p>
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
    <tbody>${buildOrderRows(order.items, lang)}</tbody>
  </table>
  <p style="margin:14px 0 6px;">${t.total}: <strong>${euro(order.total)} €</strong></p>
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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/orders', (req, res) => {
  if (!isValidAdmin(req)) {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }
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

app.post('/api/orders/:orderId/shipped', async (req, res) => {
  if (!isValidAdmin(req)) {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }
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

ensureOrdersStore()
app.listen(port, () => {
  console.log(`Order API running on http://localhost:${port}`)
})
