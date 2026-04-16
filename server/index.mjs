import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
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
  readPublicCatalog,
  reorderCategories,
  updateCategory,
  upsertProduct,
  getProductMediaAsset,
} from './catalog-store.mjs'
import {
  renderProductOgSvg,
  renderProductPage,
  renderRobotsTxt,
  renderSitemapXml,
  renderSpaPage,
} from './site-render.mjs'
import {
  approveCustomer,
  businessIdToVatId,
  createCustomer,
  deleteCustomer,
  ensureCustomerStore,
  getCustomerByEmail,
  getCustomerById,
  isCustomerApproved,
  isValidBusinessId,
  normalizeBusinessId,
  readCustomers,
  toAdminCustomer,
  toPublicCustomer,
  updateCustomerAddresses,
  verifyPassword,
} from './customer-store.mjs'
import {
  collectCheckoutParams,
  getPaytrailConfig,
  requestPaytrail,
  validatePaytrailHmac,
} from './paytrail.mjs'
import {
  getConfiguredPaytrailSiteUrl,
  getConfiguredSiteUrl,
  getPublicSiteUrlFromEnv,
  getRequestPublicSiteUrl,
  getRequestSiteUrl,
  isPublicHttpsUrl,
  readFirstEnvValue,
} from './env-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const envFiles = [
  '.env.local',
  `.env.${process.env.NODE_ENV || 'development'}`,
  '.env',
]

for (const envFile of envFiles) {
  const envPath = path.join(projectRoot, envFile)
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false })
  }
}

const app = express()
app.set('trust proxy', true)

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 8787)
const dataDir = path.resolve(projectRoot, 'data')
const ordersFile = path.join(dataDir, 'orders.json')
const publicDir = path.join(projectRoot, 'public')
const distDir = path.join(projectRoot, 'dist')

const smtpUser = readFirstEnvValue(process.env, ['SMTP_USER', 'SMTP_USERNAME', 'MAIL_USER', 'MAIL_USERNAME', 'GMAIL_USER'])
const smtpPass = readFirstEnvValue(process.env, ['SMTP_PASS', 'SMTP_PASSWORD', 'MAIL_PASS', 'MAIL_PASSWORD', 'GMAIL_APP_PASSWORD', 'GMAIL_PASS'])
const smtpHost = readFirstEnvValue(process.env, ['SMTP_HOST', 'MAIL_HOST'])
const smtpName = readFirstEnvValue(process.env, ['SMTP_NAME', 'MAIL_NAME'])
const smtpPort = Number.parseInt(readFirstEnvValue(process.env, ['SMTP_PORT', 'MAIL_PORT']), 10)
const smtpSecureEnv = readFirstEnvValue(process.env, ['SMTP_SECURE', 'MAIL_SECURE']).toLowerCase()
const mailFrom = readFirstEnvValue(process.env, ['MAIL_FROM', 'SMTP_FROM']) || smtpUser
const ownerNotificationEmail = readFirstEnvValue(process.env, ['MAIL_TO', 'OWNER_EMAIL', 'ORDER_NOTIFICATION_EMAIL']) || 'umut.uygur30@gmail.com'
const fallbackOwnerEmail = 'umut.uygur30@gmail.com'
const ownerNotificationRecipients = Array.from(new Set([ownerNotificationEmail.trim(), fallbackOwnerEmail].filter(Boolean)))
const adminUser = readFirstEnvValue(process.env, ['ADMIN_USER', 'ADMIN_USERNAME', 'ADMIN_EMAIL'])
const adminPass = readFirstEnvValue(process.env, ['ADMIN_PASS', 'ADMIN_PASSWORD'])
const siteUrlEnv = getConfiguredSiteUrl(process.env)
const publicSiteUrlEnv = getPublicSiteUrlFromEnv(process.env)
const paytrailSiteUrlEnv = getConfiguredPaytrailSiteUrl(process.env) || publicSiteUrlEnv
const customerPortalUrl = siteUrlEnv || publicSiteUrlEnv || 'https://suomenpaperitukku.fi'
const preferredHost = siteUrlEnv ? new URL(siteUrlEnv).host.toLowerCase() : ''
const adminSessionCookieName = 'spt_admin_session'
const adminSessionMaxAgeMs = 1000 * 60 * 60 * 12
const customerSessionCookieName = 'spt_customer_session'
const customerSessionMaxAgeMs = 1000 * 60 * 60 * 24 * 30
const adminSessions = new Map()
const customerSessions = new Map()
const paytrailConfig = getPaytrailConfig(process.env)
const paytrailConfigErrorMessage =
  'Paytrail is not configured on the server. Set PAYTRAIL_ACCOUNT_ID (or PAYTRAIL_MERCHANT_ID) and PAYTRAIL_SECRET.'
const paytrailSiteUrlErrorMessage =
  'Paytrail requires a public HTTPS URL for redirects and callbacks. Set PAYTRAIL_SITE_URL (or SITE_URL) to your public site URL or HTTPS tunnel URL.'
const shippingFee = 15
const freeShippingThreshold = 300
const vatMultiplier = 1.255

if (!smtpUser || !smtpPass) {
  console.warn('[mail] SMTP credentials are missing, so welcome and order emails are disabled. Set SMTP_USER/SMTP_PASS or aliases such as SMTP_USERNAME/SMTP_PASSWORD.')
}

const setStaticAssetHeaders = (res, filePath) => {
  const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/')

  if (relativePath.startsWith('dist/assets/')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    return
  }

  if (
    relativePath === 'public/brand-logo.png' ||
    relativePath === 'public/favicon.svg' ||
    relativePath.startsWith('public/products/')
  ) {
    res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400')
    return
  }

  if (relativePath.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache')
  }
}

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
  return publicSiteUrlEnv || getRequestSiteUrl(req)
}

const getPaytrailSiteUrl = (req) => {
  return paytrailSiteUrlEnv || getRequestPublicSiteUrl(req) || getSiteUrl(req)
}

const isPaytrailPublicUrlAllowed = (value) => isPublicHttpsUrl(value)

const getSpaRouteFromRequest = (req) => {
  const pathname = String(req.path ?? '').replace(/\/+$/g, '') || '/'
  const guestCheckout = String(req.query?.guest ?? '').trim() === '1'
  const authMode = String(req.query?.mode ?? '').trim() === 'register' ? 'register' : 'login'
  const nextPath = String(req.query?.next ?? '').trim() || null
  const paytrailMatch = pathname.match(/^\/kassa\/paytrail\/(success|cancel)$/)

  if (pathname === '/ostoskori') {
    return {
      type: 'cart',
      guestCheckout: false,
      authMode: 'login',
      nextPath: null,
      paytrailResult: null,
    }
  }

  if (pathname === '/kassa') {
    return {
      type: 'checkout',
      guestCheckout,
      authMode: 'login',
      nextPath: null,
      paytrailResult: null,
    }
  }

  if (pathname === '/tili') {
    return {
      type: 'auth',
      guestCheckout: false,
      authMode,
      nextPath,
      paytrailResult: null,
    }
  }

  if (pathname === '/ehdot') {
    return {
      type: 'terms',
      guestCheckout: false,
      authMode: 'login',
      nextPath: null,
      paytrailResult: null,
    }
  }

  if (paytrailMatch) {
    return {
      type: 'paytrail-return',
      guestCheckout,
      authMode: 'login',
      nextPath: null,
      paytrailResult: paytrailMatch[1],
    }
  }

  return null
}

const parseCookies = (cookieHeader) => {
  const cookieSource = String(cookieHeader ?? '')
  if (!cookieSource) {
    return {}
  }

  return cookieSource.split(';').reduce((acc, part) => {
    const separatorIndex = part.indexOf('=')
    if (separatorIndex <= 0) {
      return acc
    }

    const key = part.slice(0, separatorIndex).trim()
    const value = part.slice(separatorIndex + 1).trim()
    if (!key) {
      return acc
    }

    acc[key] = decodeURIComponent(value)
    return acc
  }, {})
}

const isSecureRequest = (req) =>
  req.secure || String(req.headers['x-forwarded-proto'] ?? '').toLowerCase() === 'https'

const buildSessionCookie = (req, cookieName, value, maxAgeMs) => {
  const parts = [
    `${cookieName}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ]

  if (isSecureRequest(req)) {
    parts.push('Secure')
  }

  return parts.join('; ')
}

const clearSessionCookie = (req, cookieName) => {
  const parts = [
    `${cookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ]

  if (isSecureRequest(req)) {
    parts.push('Secure')
  }

  return parts.join('; ')
}

const cleanupExpiredAdminSessions = () => {
  const now = Date.now()
  for (const [sessionId, session] of adminSessions.entries()) {
    if (session.expiresAt <= now) {
      adminSessions.delete(sessionId)
    }
  }
}

const cleanupExpiredCustomerSessions = () => {
  const now = Date.now()
  for (const [sessionId, session] of customerSessions.entries()) {
    if (session.expiresAt <= now) {
      customerSessions.delete(sessionId)
    }
  }
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

const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100

const grossFromNet = (value) => roundCurrency(Number(value) * vatMultiplier)

const vatFromNet = (value) => roundCurrency(grossFromNet(value) - Number(value))

const deliveryCost = (subtotal) => (subtotal >= freeShippingThreshold ? 0 : shippingFee)

const getOrderContactName = (customer) =>
  [customer?.firstName, customer?.lastName]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' ')

const normalizeSelectedOptions = (selectedOptions) =>
  Array.isArray(selectedOptions)
    ? selectedOptions
        .map((item) => {
          const groupName = String(item?.groupName ?? '').trim()
          const valueLabel = String(item?.valueLabel ?? '').trim()
          if (!groupName || !valueLabel) {
            return null
          }
          return {
            groupId: String(item?.groupId ?? '').trim() || groupName,
            groupName,
            valueId: String(item?.valueId ?? '').trim() || valueLabel,
            valueLabel,
            valueDetail: String(item?.valueDetail ?? '').trim() || undefined,
            valuePrice: Number.isFinite(Number(item?.valuePrice)) ? Number(item.valuePrice) : undefined,
          }
        })
        .filter(Boolean)
    : []

const getResolvedUnitPrice = (product, selectedOptions) =>
  normalizeSelectedOptions(selectedOptions).find((item) => item.valuePrice !== undefined)?.valuePrice ?? Number(product.price ?? 0)

const getCatalogOrderItems = (rawItems) => {
  const catalog = readCatalog()

  return (Array.isArray(rawItems) ? rawItems : []).reduce((acc, rawItem) => {
    const productId = String(rawItem?.productId ?? '').trim()
    const product = catalog.products.find((item) => item.id === productId)
    const quantity = Math.max(1, Number.parseInt(String(rawItem?.quantity ?? 0), 10) || 0)

    if (!product || quantity <= 0) {
      return acc
    }

    const selectedOptions = normalizeSelectedOptions(rawItem?.selectedOptions)
    const unitPrice = roundCurrency(getResolvedUnitPrice(product, selectedOptions))

    acc.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      quantity,
      unitPrice,
      priceUnit: product.priceUnit,
      selectedOptions,
    })

    return acc
  }, [])
}

const getOrderTotals = (items) => {
  const subtotal = roundCurrency(items.reduce((sum, item) => sum + Number(item.unitPrice) * Number(item.quantity), 0))
  const shipping = subtotal > 0 ? deliveryCost(subtotal) : 0
  const total = roundCurrency(subtotal + shipping)

  return {
    subtotal,
    shipping,
    total,
    vatAmount: vatFromNet(total),
    grossSubtotal: grossFromNet(subtotal),
    grossShipping: grossFromNet(shipping),
    grossTotal: grossFromNet(total),
  }
}

const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase()

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value))

const normalizePostalCode = (value) => String(value ?? '').replace(/\D/g, '').slice(0, 5)

const isValidPostalCode = (value) => /^\d{5}$/.test(normalizePostalCode(value))

const normalizePhone = (value) => {
  const trimmed = String(value ?? '').trim()
  const hasLeadingPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '').slice(0, 15)
  return hasLeadingPlus && digits ? `+${digits}` : digits
}

const isValidPhone = (value) => {
  const digitCount = String(value ?? '').replace(/\D/g, '').length
  return digitCount >= 7 && digitCount <= 15
}

const splitContactName = (value) => {
  const parts = String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (parts.length === 0) {
    return { firstName: '', lastName: '' }
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' }
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

const normalizeCheckoutInput = (payload = {}) => {
  const deliveryStreetAddress = String(payload?.deliveryAddress ?? '').trim()
  const deliveryPostalCode = normalizePostalCode(payload?.deliveryZip)
  const deliveryCity = String(payload?.deliveryCity ?? '').trim()
  const deliveryAddress = {
    streetAddress: deliveryStreetAddress,
    postalCode: deliveryPostalCode,
    city: deliveryCity,
    country: 'FI',
  }

  const billingAddress = {
    streetAddress: String(payload?.billingAddress ?? '').trim() || deliveryStreetAddress,
    postalCode: normalizePostalCode(payload?.billingZip) || deliveryPostalCode,
    city: String(payload?.billingCity ?? '').trim() || deliveryCity,
    country: 'FI',
  }

  return {
    deliveryAddress,
    billingCompany: String(payload?.billingCompany || payload?.company || '').trim(),
    billingAddress,
    notes: String(payload?.notes ?? '').trim(),
    paymentMethod: payload?.paymentMethod === 'card' ? 'card' : 'invoice',
  }
}

const normalizeGuestCustomerInput = (payload = {}) => {
  const companyName = String(payload?.company ?? '').trim()
  const contactName = String(payload?.contact ?? '').trim()
  const { firstName, lastName } = splitContactName(contactName)

  return {
    id: null,
    companyName,
    contactName,
    firstName,
    lastName,
    businessId: normalizeBusinessId(payload?.businessId ?? ''),
    phone: normalizePhone(payload?.phone),
    email: normalizeEmail(payload?.email),
  }
}

const validateCheckoutInput = (checkout) => {
  if (!checkout.deliveryAddress.streetAddress || !checkout.deliveryAddress.city) {
    return 'Delivery address and city are required.'
  }

  if (!isValidPostalCode(checkout.deliveryAddress.postalCode)) {
    return 'Delivery postal code must contain 5 digits.'
  }

  if (checkout.paymentMethod === 'card') {
    return ''
  }

  if (!checkout.billingCompany) {
    return 'Billing company is required.'
  }

  if (!checkout.billingAddress.streetAddress || !checkout.billingAddress.city) {
    return 'Billing address and city are required.'
  }

  if (!isValidPostalCode(checkout.billingAddress.postalCode)) {
    return 'Billing postal code must contain 5 digits.'
  }

  return ''
}

const validateGuestCustomerInput = (guestCustomer) => {
  if (!guestCustomer.companyName || !guestCustomer.contactName || !guestCustomer.email || !guestCustomer.phone) {
    return 'Company, contact name, email and phone are required.'
  }

  if (!isValidEmail(guestCustomer.email)) {
    return 'Enter a valid email address.'
  }

  if (!isValidPhone(guestCustomer.phone)) {
    return 'Phone number must contain 7-15 digits.'
  }

  return ''
}

const isCompleteAddress = (address) =>
  Boolean(address?.streetAddress && address?.postalCode && address?.city && address?.country)

const toMinorUnits = (value) => Math.round(Number(value) * 100)

const createTransporter = () => {
  if (!smtpUser || !smtpPass) {
    throw new Error('SMTP_USER / SMTP_PASS missing')
  }

  if (!smtpHost) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })
  }

  const fallbackSecure = smtpPort === 465
  const secure = smtpSecureEnv ? smtpSecureEnv === 'true' || smtpSecureEnv === '1' : fallbackSecure

  return nodemailer.createTransport({
    host: smtpHost,
    port: Number.isFinite(smtpPort) && smtpPort > 0 ? smtpPort : secure ? 465 : 587,
    secure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    ...(smtpName ? { name: smtpName } : {}),
  })
}

const createAdminSession = () => {
  cleanupExpiredAdminSessions()
  const sessionId = crypto.randomBytes(24).toString('hex')
  adminSessions.set(sessionId, {
    user: adminUser,
    expiresAt: Date.now() + adminSessionMaxAgeMs,
  })
  return sessionId
}

const createCustomerSession = (customerId) => {
  cleanupExpiredCustomerSessions()
  const sessionId = crypto.randomBytes(24).toString('hex')
  customerSessions.set(sessionId, {
    customerId,
    expiresAt: Date.now() + customerSessionMaxAgeMs,
  })
  return sessionId
}

const clearCustomerSessionsForCustomer = (customerId) => {
  for (const [sessionId, session] of customerSessions.entries()) {
    if (session.customerId === customerId) {
      customerSessions.delete(sessionId)
    }
  }
}

const getAdminSession = (req) => {
  cleanupExpiredAdminSessions()
  const cookies = parseCookies(req.headers.cookie)
  const sessionId = cookies[adminSessionCookieName]
  if (!sessionId) {
    return null
  }

  const session = adminSessions.get(sessionId)
  if (!session) {
    return null
  }

  if (session.expiresAt <= Date.now()) {
    adminSessions.delete(sessionId)
    return null
  }

  session.expiresAt = Date.now() + adminSessionMaxAgeMs
  return { id: sessionId, ...session }
}

const getCustomerSession = (req) => {
  cleanupExpiredCustomerSessions()
  const cookies = parseCookies(req.headers.cookie)
  const sessionId = cookies[customerSessionCookieName]
  if (!sessionId) {
    return null
  }

  const session = customerSessions.get(sessionId)
  if (!session) {
    return null
  }

  if (session.expiresAt <= Date.now()) {
    customerSessions.delete(sessionId)
    return null
  }

  const customer = getCustomerById(session.customerId)
  if (!customer || !isCustomerApproved(customer)) {
    customerSessions.delete(sessionId)
    return null
  }

  session.expiresAt = Date.now() + customerSessionMaxAgeMs
  return {
    id: sessionId,
    customerId: customer.id,
    customer,
    expiresAt: session.expiresAt,
  }
}

const isValidAdmin = (req) => {
  const session = getAdminSession(req)
  return Boolean(session && session.user === adminUser)
}

const getAuthenticatedCustomer = (req) => getCustomerSession(req)?.customer ?? null

const getPublicCatalogResponse = (productId = null) => {
  const catalog = readPublicCatalog()
  return {
    catalog,
    product: productId ? catalog.products.find((item) => item.id === productId) ?? null : null,
  }
}

const requireAdmin = (req, res, next) => {
  if (!isValidAdmin(req)) {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }
  next()
}

const requireCustomer = (req, res, next) => {
  const session = getCustomerSession(req)
  if (!session?.customer) {
    res.status(401).json({ message: 'Authentication required.' })
    return
  }

  req.customer = session.customer
  req.customerSession = session
  next()
}

const resolveStoredImageValue = (value, existingProduct) => {
  const nextValue = String(value ?? '').trim()
  if (!nextValue || !existingProduct) {
    return nextValue
  }

  const mediaMatch = nextValue.match(/(?:^https?:\/\/[^/]+)?\/media\/product\/([^/]+)\/(\d+)$/)
  if (!mediaMatch) {
    return nextValue
  }

  const [, slug, rawIndex] = mediaMatch
  if (decodeURIComponent(slug) !== existingProduct.slug) {
    return nextValue
  }

  const index = Number(rawIndex)
  if (!Number.isInteger(index) || index < 0) {
    return nextValue
  }

  const existingImages = Array.isArray(existingProduct.images) && existingProduct.images.length > 0
    ? existingProduct.images
    : [existingProduct.image]

  return String(existingImages[index] ?? nextValue)
}

const getOrderLang = () => 'fi'

const fixMailMojibake = (value) => {
  const replacements = [
    ['Ã¤', 'ä'],
    ['Ã¶', 'ö'],
    ['Ã¥', 'å'],
    ['Ã„', 'Ä'],
    ['Ã–', 'Ö'],
    ['Ã…', 'Å'],
    ['â‚¬', '€'],
    ['â€“', '–'],
    ['â€”', '—'],
  ]

  if (typeof value === 'string') {
    return replacements.reduce((current, [from, to]) => current.split(from).join(to), value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => fixMailMojibake(item))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, fixMailMojibake(entry)]))
  }

  return value
}

const getMailText = (lang) => {
  if (lang === 'en') {
    return fixMailMojibake({
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
      businessId: 'Business ID',
      paymentMethod: 'Payment method',
      vat: 'VAT',
      grossTotal: 'Total incl. VAT',
      billingAddress: 'Billing address',
      invoice: 'Invoice',
      card: 'Card payment (Paytrail)',
      shippedTitle: 'Your order is on the way',
      shippedBody: 'Order is now shipped',
      shippedThanks: 'Thank you for ordering from Suomen Paperitukku.',
      questions: 'If you have any questions about your order, just reply to this email.',
      regards: 'Best regards',
      subjectConfirm: 'Order confirmation',
      subjectNew: 'New order',
      subjectShipped: 'Your order is on the way',
      subjectWelcome: 'Your account request was received',
      subjectApproved: 'Your account is now approved',
      subjectNewAccount: 'New customer account',
      welcomeTitle: 'Your account request was received',
      welcomeBody: 'Your company account is waiting for admin approval before you can sign in.',
      approvedTitle: 'Your account is now approved',
      approvedBody: 'Your company account is active and ready for ordering.',
      newAccount: 'New customer account',
      accountStatus: 'Account status',
      pending: 'Pending approval',
      approved: 'Approved',
    })
  }

  return fixMailMojibake({
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
    businessId: 'Y-tunnus',
    paymentMethod: 'Maksutapa',
    vat: 'ALV',
    grossTotal: 'Verollinen yhteensä',
    billingAddress: 'Laskutusosoite',
    invoice: 'Lasku',
    card: 'Korttimaksu (Paytrail)',
    shippedTitle: 'Tilauksesi on matkalla',
    shippedBody: 'Tilaus on nyt lähetetty',
    shippedThanks: 'Kiitos tilauksesta Suomen Paperitukulta.',
    questions: 'Jos sinulla on kysyttävää tilauksesta, vastaathan tähän viestiin.',
    regards: 'Ystävällisin terveisin',
    subjectConfirm: 'Tilausvahvistus',
    subjectNew: 'Uusi tilaus',
    subjectShipped: 'Tilauksesi on matkalla',
    subjectWelcome: 'Tilitietosi vastaanotettiin',
    subjectApproved: 'Tilisi on nyt hyväksytty',
    subjectNewAccount: 'Uusi asiakastili',
    welcomeTitle: 'Tilitietosi vastaanotettiin',
    welcomeBody: 'Yritystilisi odottaa ylläpidon hyväksyntää ennen kuin voit kirjautua sisään.',
    approvedTitle: 'Tilisi on nyt hyväksytty',
    approvedBody: 'Yritystilisi on aktivoitu ja voit kirjautua sisään sekä tehdä tilauksia.',
    newAccount: 'Uusi asiakastili',
    accountStatus: 'Tilin tila',
    pending: 'Odottaa hyväksyntää',
    approved: 'Hyväksytty',
  })
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

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const formatItemOptionsHtml = (selectedOptions) => {
  const normalized = normalizeSelectedOptions(selectedOptions)
  if (normalized.length === 0) {
    return ''
  }

  const rows = normalized
    .map((item) => `${escapeHtml(item.groupName)}: ${escapeHtml(item.valueLabel)}${item.valueDetail ? ` (${escapeHtml(item.valueDetail)})` : ''}`)
    .join('<br />')

  return `<div style="margin-top:4px;color:#5b6f93;font-size:12px;">${rows}</div>`
}

const buildOrderRows = (items) =>
  items
    .map(
      (item) =>
        `<tr>
          <td style="padding:8px;border:1px solid #d9e2f2;">${escapeHtml(item.name)}${formatItemOptionsHtml(item.selectedOptions)}</td>
          <td style="padding:8px;border:1px solid #d9e2f2;text-align:center;">${item.quantity}</td>
          <td style="padding:8px;border:1px solid #d9e2f2;text-align:right;">${euro(item.unitPrice)} EUR</td>
        </tr>`,
    )
    .join('')

const getPaymentMethodLabel = (order, lang) => {
  const t = getMailText(lang)
  return order.paymentMethod === 'paytrail' ? t.card : t.invoice
}

const formatOrderAddress = (address, zip, city) =>
  [String(address ?? '').trim(), [String(zip ?? '').trim(), String(city ?? '').trim()].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ')

const customerOrderHtml = (order) => {
  const lang = getOrderLang(order)
  const t = getMailText(lang)
  return `
<div style="font-family:Arial,Helvetica,sans-serif;color:#13233f;line-height:1.45;">
  <h2 style="margin:0 0 8px;">${t.thanks}</h2>
  <p style="margin:0 0 10px;">${t.orderNumber} <strong>${order.id}</strong>.</p>
  <p style="margin:0 0 6px;"><strong>${t.paymentMethod}:</strong> ${getPaymentMethodLabel(order, lang)}</p>
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
  <p style="margin:0 0 6px;">${t.vat}: <strong>${euro(order.vatAmount ?? 0)} EUR</strong></p>
  <p style="margin:0 0 14px;">${t.grossTotal}: <strong>${euro(order.grossTotal ?? grossFromNet(order.total))} EUR</strong></p>
  <p style="margin:0 0 6px;">${t.deliveryAddress}: ${escapeHtml(formatOrderAddress(order.customer.address, order.customer.zip, order.customer.city))}</p>
  ${
    order.customer.billingAddress
      ? `<p style="margin:0;">${t.billingAddress}: ${escapeHtml(formatOrderAddress(order.customer.billingAddress, order.customer.billingZip, order.customer.billingCity))}</p>`
      : ''
  }
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
  <p style="margin:0 0 8px;"><strong>${t.phone}:</strong> ${order.customer.phone || '-'}</p>
  <p style="margin:0 0 8px;"><strong>${t.businessId}:</strong> ${order.customer.businessId || '-'}</p>
  <p style="margin:0 0 14px;"><strong>${t.paymentMethod}:</strong> ${getPaymentMethodLabel(order, lang)}</p>
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
  <p style="margin:0 0 6px;">${t.vat}: <strong>${euro(order.vatAmount ?? 0)} EUR</strong></p>
  <p style="margin:0 0 6px;">${t.grossTotal}: <strong>${euro(order.grossTotal ?? grossFromNet(order.total))} EUR</strong></p>
  <p style="margin:0 0 6px;"><strong>${t.deliveryAddress}:</strong> ${escapeHtml(formatOrderAddress(order.customer.address, order.customer.zip, order.customer.city))}</p>
  ${
    order.customer.billingAddress
      ? `<p style="margin:0 0 6px;"><strong>${t.billingAddress}:</strong> ${escapeHtml(formatOrderAddress(order.customer.billingAddress, order.customer.billingZip, order.customer.billingCity))}</p>`
      : ''
  }
  ${emailFooter(lang)}
</div>
`
}

const customerWelcomeHtml = (customer) => {
  const lang = 'fi'
  const t = getMailText(lang)
  return `
<div style="font-family:Arial,Helvetica,sans-serif;color:#13233f;line-height:1.5;">
  <h2 style="margin:0 0 8px;">${t.welcomeTitle}</h2>
  <p style="margin:0 0 10px;">${t.welcomeBody}</p>
  <p style="margin:0 0 10px;">
    ${escapeHtml(customer.companyName)}<br />
    ${escapeHtml(getOrderContactName(customer))}<br />
    ${escapeHtml(customer.email)}
  </p>
  <p style="margin:0 0 10px;"><strong>${t.accountStatus}:</strong> ${t.pending}</p>
  <p style="margin:0 0 10px;">Lähetämme uuden viestin heti kun tili on hyväksytty. Kirjautuminen avautuu hyväksynnän jälkeen osoitteessa ${escapeHtml(customerPortalUrl)}.</p>
  ${emailFooter(lang)}
</div>
`
}

const merchantNewCustomerHtml = (customer) => {
  const t = getMailText('fi')
  return `
<div style="font-family:Arial,Helvetica,sans-serif;color:#13233f;line-height:1.5;">
  <h2 style="margin:0 0 10px;">${t.newAccount}</h2>
  <p style="margin:0 0 8px;"><strong>${t.company}:</strong> ${escapeHtml(customer.companyName)}</p>
  <p style="margin:0 0 8px;"><strong>${t.contact}:</strong> ${escapeHtml(getOrderContactName(customer))}</p>
  <p style="margin:0 0 8px;"><strong>${t.businessId}:</strong> ${escapeHtml(customer.businessId)}</p>
  <p style="margin:0 0 8px;"><strong>${t.phone}:</strong> ${escapeHtml(customer.phone)}</p>
  <p style="margin:0 0 8px;"><strong>${t.email}:</strong> ${escapeHtml(customer.email)}</p>
  <p style="margin:0 0 8px;"><strong>${t.accountStatus}:</strong> ${t.pending}</p>
  <p style="margin:0;">Hyväksy tai poista tili admin-paneelin käyttäjät-osiosta.</p>
  ${emailFooter('fi')}
</div>
`
}

const customerApprovedHtml = (customer) => {
  const t = getMailText('fi')
  return `
<div style="font-family:Arial,Helvetica,sans-serif;color:#13233f;line-height:1.5;">
  <h2 style="margin:0 0 8px;">${t.approvedTitle}</h2>
  <p style="margin:0 0 10px;">${t.approvedBody}</p>
  <p style="margin:0 0 10px;">
    ${escapeHtml(customer.companyName)}<br />
    ${escapeHtml(getOrderContactName(customer))}<br />
    ${escapeHtml(customer.email)}
  </p>
  <p style="margin:0 0 10px;"><strong>${t.accountStatus}:</strong> ${t.approved}</p>
  <p style="margin:0 0 10px;">Voit nyt kirjautua sisään osoitteessa <a href="${escapeHtml(customerPortalUrl)}">${escapeHtml(customerPortalUrl)}</a> ja tehdä tilauksia yritystililläsi.</p>
  ${emailFooter('fi')}
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

const sendMailBatch = async (messages, context = 'mail') => {
  try {
    const transporter = createTransporter()
    const failures = []

    for (const message of messages) {
      try {
        await transporter.sendMail(message)
      } catch (error) {
        failures.push(error instanceof Error ? error.message : 'Failed to send email')
        console.error(`[mail] ${context} failed for ${message?.to ?? 'unknown recipient'}`, error)
      }
    }

    if (failures.length > 0) {
      return {
        ok: false,
        message: failures.join(' | '),
      }
    }

    return { ok: true, message: '' }
  } catch (error) {
    console.error(`[mail] ${context} failed`, error)
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to send email',
    }
  }
}

const sendRegistrationEmails = async (customer) =>
  sendMailBatch(
    [
      {
        from: mailFrom,
        to: customer.email,
        subject: getMailText('fi').subjectWelcome,
        html: customerWelcomeHtml(customer),
      },
      {
        from: mailFrom,
        to: ownerNotificationRecipients.join(','),
        subject: `${getMailText('fi').subjectNewAccount}: ${customer.companyName}`,
        html: merchantNewCustomerHtml(customer),
      },
    ],
    `registration:${customer.email}`,
  )

const sendCustomerApprovedEmail = async (customer) =>
  sendMailBatch(
    [
      {
        from: mailFrom,
        to: customer.email,
        subject: getMailText('fi').subjectApproved,
        html: customerApprovedHtml(customer),
      },
    ],
    `customer-approved:${customer.email}`,
  )

const sendOrderEmails = async (order) => {
  const lang = getOrderLang(order)
  const t = getMailText(lang)

  return sendMailBatch(
    [
      {
        from: mailFrom,
        to: order.customer.email,
        subject: `${t.subjectConfirm} ${order.id}`,
        html: customerOrderHtml(order),
      },
      {
        from: mailFrom,
        to: ownerNotificationRecipients.join(','),
        subject: `${t.subjectNew} ${order.id}`,
        html: merchantOrderHtml(order),
      },
    ],
    `order:${order.id}`,
  )
}

const normalizeIncomingProduct = (body, productId = null) => {
  const existingProduct = productId ? readCatalog().products.find((item) => item.id === productId) ?? null : null
  const searchKeywords = Array.isArray(body.searchKeywords)
    ? body.searchKeywords.map((item) => String(item).trim()).filter(Boolean)
    : []
  const optionGroups = Array.isArray(body.optionGroups)
    ? body.optionGroups
        .map((group, groupIndex) => {
          const name = String(group?.name ?? '').trim()
          const values = Array.isArray(group?.values)
            ? group.values
                .map((value, valueIndex) => {
                  const label = String(value?.label ?? '').trim()
                  if (!label) {
                    return null
                  }
                  return {
                    id: String(value?.id ?? '').trim() || `value-${groupIndex + 1}-${valueIndex + 1}`,
                    label,
                    detail: String(value?.detail ?? '').trim() || undefined,
                    price: Number.isFinite(Number(value?.price)) ? Number(value.price) : undefined,
                  }
                })
                .filter(Boolean)
            : []

          if (!name || values.length === 0) {
            return null
          }

          return {
            id: String(group?.id ?? '').trim() || `option-${groupIndex + 1}`,
            name,
            values,
          }
        })
        .filter(Boolean)
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
    images: Array.isArray(body.images)
      ? body.images
          .filter((item) => typeof item === 'string' && item.trim() !== '')
          .map((item) => resolveStoredImageValue(item, existingProduct))
      : [],
    image: resolveStoredImageValue(body.image, existingProduct),
    description: String(body.description ?? '').trim(),
    featured: Boolean(body.featured),
    featuredRank: body.featured ? Number(body.featuredRank ?? 0) : undefined,
    optionGroups: Array.isArray(body.optionGroups) ? optionGroups : undefined,
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

const buildPaytrailItems = (items, shipping) => {
  const paytrailItems = items.map((item) => ({
    unitPrice: toMinorUnits(item.unitPrice),
    units: item.quantity,
    vatPercentage: 25.5,
    productCode: item.sku || item.productId,
    description: item.name,
    category: 'sanitary-supplies',
  }))

  if (shipping > 0) {
    paytrailItems.push({
      unitPrice: toMinorUnits(shipping),
      units: 1,
      vatPercentage: 25.5,
      productCode: 'shipping',
      description: 'Toimitus',
      category: 'shipping',
    })
  }

  return paytrailItems
}

const createOrderRecord = ({ orders, customer, checkout, items, lang, paymentMethod, paytrail }) => {
  const totals = getOrderTotals(items)
  const contactName = customer.contactName || getOrderContactName(customer)

  return {
    id: makeOrderId(orders),
    lang,
    status: 'new',
    createdAt: new Date().toISOString(),
    shippedAt: null,
    customerId: customer.id ?? null,
    paymentMethod,
    paymentStatus: paymentMethod === 'paytrail' ? 'pending' : 'invoice_pending',
    confirmationEmailSentAt: null,
    paytrail: paytrail ?? null,
    customer: {
      company: customer.companyName || contactName,
      contact: contactName,
      email: customer.email,
      phone: customer.phone,
      address: checkout.deliveryAddress.streetAddress,
      zip: checkout.deliveryAddress.postalCode,
      city: checkout.deliveryAddress.city,
      billingCompany: checkout.billingCompany,
      billingAddress: checkout.billingAddress.streetAddress,
      billingZip: checkout.billingAddress.postalCode,
      billingCity: checkout.billingAddress.city,
      notes: checkout.notes,
      firstName: customer.firstName,
      lastName: customer.lastName,
      businessId: customer.businessId,
    },
    items,
    ...totals,
  }
}

const findOrderByPaymentReference = (orders, reference, transactionId, stamp) =>
  orders.find((order) => {
    if (reference && order.id === reference) {
      return true
    }
    if (transactionId && order.paytrail?.transactionId === transactionId) {
      return true
    }
    if (stamp && order.paytrail?.stamp === stamp) {
      return true
    }
    return false
  }) ?? null

const finalizePaytrailOrder = async (req, source = 'redirect') => {
  if (!paytrailConfig.account || !paytrailConfig.secret) {
    throw new Error('Paytrail is not configured.')
  }

  const checkoutParams = collectCheckoutParams(req.query)
  const signature = String(req.query?.signature ?? '').trim()
  const algorithm = checkoutParams['checkout-algorithm'] || paytrailConfig.algorithm
  const signatureValid = validatePaytrailHmac(paytrailConfig.secret, checkoutParams, signature, '', algorithm)

  if (!signatureValid) {
    throw new Error('Invalid Paytrail signature.')
  }

  const reference = String(checkoutParams['checkout-reference'] ?? '').trim()
  const transactionId = String(checkoutParams['checkout-transaction-id'] ?? '').trim()
  const stamp = String(checkoutParams['checkout-stamp'] ?? '').trim()
  const provider = String(checkoutParams['checkout-provider'] ?? '').trim()
  const status = String(checkoutParams['checkout-status'] ?? '').trim().toLowerCase()

  const orders = readOrders()
  const order = findOrderByPaymentReference(orders, reference, transactionId, stamp)
  if (!order) {
    throw new Error('Order not found.')
  }

  const now = new Date().toISOString()
  const alreadyConfirmed = order.paymentStatus === 'paid'
  order.paymentMethod = 'paytrail'
  order.paymentStatus = status === 'ok' ? 'paid' : status === 'pending' || status === 'delayed' ? 'pending' : 'failed'
  order.paytrail = {
    ...(order.paytrail ?? {}),
    transactionId,
    stamp,
    provider: provider || order.paytrail?.provider || '',
    status,
    lastUpdatedAt: now,
    ...(source === 'callback' ? { lastCallbackAt: now } : { lastRedirectAt: now }),
  }

  writeOrders(orders)

  let mailResult = { ok: true, message: '' }
  if (!alreadyConfirmed && order.paymentStatus === 'paid') {
    mailResult = await sendOrderEmails(order)
    if (mailResult.ok) {
      order.confirmationEmailSentAt = now
      writeOrders(orders)
    }
  }

  return {
    order,
    signatureValid,
    mailResult,
  }
}

ensureCatalogStore()
ensureOrdersStore()
ensureCustomerStore()

app.use(express.static(publicDir, { index: false, setHeaders: setStaticAssetHeaders }))
app.use(express.static(distDir, { index: false, setHeaders: setStaticAssetHeaders }))

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mailConfigured: Boolean(smtpUser && smtpPass),
    paytrailConfigured: paytrailConfig.enabled,
  })
})

app.get('/api/customer/session', (req, res) => {
  const session = getCustomerSession(req)
  if (!session?.customer) {
    res.status(401).json({ authenticated: false })
    return
  }

  res.setHeader('Set-Cookie', buildSessionCookie(req, customerSessionCookieName, session.id, customerSessionMaxAgeMs))
  res.json({
    authenticated: true,
    customer: toPublicCustomer(session.customer),
  })
})

app.post('/api/customer/register', async (req, res) => {
  const firstName = String(req.body?.firstName ?? '').trim()
  const lastName = String(req.body?.lastName ?? '').trim()
  const companyName = String(req.body?.companyName ?? '').trim()
  const businessId = normalizeBusinessId(req.body?.businessId)
  const phone = normalizePhone(req.body?.phone)
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password ?? '')

  if (!firstName || !lastName || !companyName || !businessId || !phone || !email || !password) {
    res.status(400).json({ message: 'Missing registration fields.' })
    return
  }

  if (!isValidBusinessId(businessId)) {
    res.status(400).json({ message: 'Business ID must be valid and in the format 1234567-8.' })
    return
  }

  if (!isValidPhone(phone)) {
    res.status(400).json({ message: 'Phone number must contain 7-15 digits.' })
    return
  }

  if (!isValidEmail(email)) {
    res.status(400).json({ message: 'Enter a valid email address.' })
    return
  }

  if (password.length < 8) {
    res.status(400).json({ message: 'Password must be at least 8 characters long.' })
    return
  }

  if (getCustomerByEmail(email)) {
    res.status(409).json({ message: 'An account with this email already exists.' })
    return
  }

  try {
    const customer = createCustomer({
      firstName,
      lastName,
      companyName,
      businessId,
      phone,
      email,
      password,
      approvalStatus: 'pending',
    })

    const mailResult = await sendRegistrationEmails(customer)
    res.status(201).json({
      ok: true,
      mailWarning: !mailResult.ok,
      customer: toPublicCustomer(customer),
    })
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to create account.' })
  }
})

app.post('/api/customer/login', (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const password = String(req.body?.password ?? '')
  const customer = getCustomerByEmail(email)

  if (!customer || !verifyPassword(password, customer)) {
    res.status(401).json({ message: 'Invalid email or password.' })
    return
  }

  if (!isCustomerApproved(customer)) {
    res.status(403).json({ message: 'Account pending approval.' })
    return
  }

  const sessionId = createCustomerSession(customer.id)
  res.setHeader('Set-Cookie', buildSessionCookie(req, customerSessionCookieName, sessionId, customerSessionMaxAgeMs))
  res.json({
    ok: true,
    customer: toPublicCustomer(customer),
  })
})

app.post('/api/customer/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie)
  const sessionId = cookies[customerSessionCookieName]
  if (sessionId) {
    customerSessions.delete(sessionId)
  }

  res.setHeader('Set-Cookie', clearSessionCookie(req, customerSessionCookieName))
  res.json({ ok: true })
})

app.get('/api/admin/session', (req, res) => {
  const session = getAdminSession(req)
  if (!session) {
    res.status(401).json({ authenticated: false })
    return
  }

  res.setHeader('Set-Cookie', buildSessionCookie(req, adminSessionCookieName, session.id, adminSessionMaxAgeMs))
  res.json({ authenticated: true, user: session.user })
})

app.post('/api/admin/login', (req, res) => {
  const user = String(req.body?.user ?? '').trim()
  const pass = String(req.body?.pass ?? '').trim()

  if (!adminUser || !adminPass) {
    res.status(503).json({
      message: 'Admin login is not configured on the server. Set ADMIN_USER (or ADMIN_USERNAME) and ADMIN_PASS (or ADMIN_PASSWORD).',
    })
    return
  }

  if (user !== adminUser || pass !== adminPass) {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }

  const sessionId = createAdminSession()
  res.setHeader('Set-Cookie', buildSessionCookie(req, adminSessionCookieName, sessionId, adminSessionMaxAgeMs))
  res.json({ ok: true })
})

app.post('/api/admin/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie)
  const sessionId = cookies[adminSessionCookieName]
  if (sessionId) {
    adminSessions.delete(sessionId)
  }

  res.setHeader('Set-Cookie', clearSessionCookie(req, adminSessionCookieName))
  res.json({ ok: true })
})

app.get('/api/admin/customers', requireAdmin, (req, res) => {
  const customers = readCustomers()
    .slice()
    .sort((left, right) => {
      if (left.approvalStatus !== right.approvalStatus) {
        return left.approvalStatus === 'pending' ? -1 : 1
      }
      return right.createdAt.localeCompare(left.createdAt)
    })
    .map((customer) => toAdminCustomer(customer))
    .filter(Boolean)

  res.json({ customers })
})

app.post('/api/admin/customers/:customerId/approve', requireAdmin, async (req, res) => {
  const existingCustomer = getCustomerById(req.params.customerId)
  if (!existingCustomer) {
    res.status(404).json({ message: 'Customer not found.' })
    return
  }

  const customer = isCustomerApproved(existingCustomer) ? existingCustomer : approveCustomer(existingCustomer.id)
  if (!customer) {
    res.status(404).json({ message: 'Customer not found.' })
    return
  }

  const mailResult = isCustomerApproved(existingCustomer) ? { ok: true } : await sendCustomerApprovedEmail(customer)
  res.json({
    ok: true,
    mailWarning: !mailResult.ok,
    customer: toAdminCustomer(customer),
  })
})

app.delete('/api/admin/customers/:customerId', requireAdmin, (req, res) => {
  const customer = deleteCustomer(req.params.customerId)
  if (!customer) {
    res.status(404).json({ message: 'Customer not found.' })
    return
  }

  clearCustomerSessionsForCustomer(customer.id)
  res.json({
    ok: true,
    customer: toAdminCustomer(customer),
  })
})

app.get('/api/catalog', (_req, res) => {
  res.json(readPublicCatalog())
})

app.get('/media/product/:slug/:imageIndex', (req, res) => {
  const media = getProductMediaAsset(req.params.slug, Number(req.params.imageIndex))
  if (!media) {
    res.status(404).send('Not found')
    return
  }

  res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400')
  res.type(media.contentType).send(media.buffer)
})

app.post('/api/admin/products', requireAdmin, (req, res) => {
  const payload = normalizeIncomingProduct(req.body)
  const validationError = validateProductPayload(payload)
  if (validationError) {
    res.status(400).json({ message: validationError })
    return
  }

  upsertProduct(payload)
  res.status(201).json(getPublicCatalogResponse(payload.id))
})

app.put('/api/admin/products/:productId', requireAdmin, (req, res) => {
  const payload = normalizeIncomingProduct(req.body, req.params.productId)
  const validationError = validateProductPayload(payload)
  if (validationError) {
    res.status(400).json({ message: validationError })
    return
  }

  upsertProduct(payload)
  res.json(getPublicCatalogResponse(payload.id))
})

app.delete('/api/admin/products/:productId', requireAdmin, (req, res) => {
  deleteProduct(req.params.productId)
  res.json(getPublicCatalogResponse())
})

app.post('/api/admin/categories', requireAdmin, (req, res) => {
  const nameFi = String(req.body?.nameFi ?? '').trim()
  const nameEn = String(req.body?.nameEn ?? nameFi).trim()
  if (!nameFi) {
    res.status(400).json({ message: 'Missing category name' })
    return
  }

  addCategory({ nameFi, nameEn, id: nameFi })
  res.status(201).json(getPublicCatalogResponse())
})

app.delete('/api/admin/categories/:categoryId', requireAdmin, (req, res) => {
  deleteCategory(req.params.categoryId)
  res.json(getPublicCatalogResponse())
})

app.put('/api/admin/categories/:categoryId', requireAdmin, (req, res) => {
  const nameFi = String(req.body?.nameFi ?? '').trim()
  const nameEn = String(req.body?.nameEn ?? nameFi).trim()
  if (!nameFi || !nameEn) {
    res.status(400).json({ message: 'Missing category names' })
    return
  }

  updateCategory(req.params.categoryId, { nameFi, nameEn })
  res.json(getPublicCatalogResponse())
})

app.post('/api/admin/categories/reorder', requireAdmin, (req, res) => {
  const order = Array.isArray(req.body?.order) ? req.body.order : []
  reorderCategories(order)
  res.json(getPublicCatalogResponse())
})

app.post('/api/checkout/invoice', requireCustomer, async (req, res) => {
  try {
    const customer = req.customer
    const items = getCatalogOrderItems(req.body?.items)
    const checkout = normalizeCheckoutInput(req.body)
    const lang = 'fi'

    if (items.length === 0) {
      res.status(400).json({ message: 'Cart is empty.' })
      return
    }

    const checkoutValidationMessage = validateCheckoutInput(checkout)
    if (checkoutValidationMessage) {
      res.status(400).json({ message: checkoutValidationMessage })
      return
    }

    const orders = readOrders()
    const order = createOrderRecord({
      orders,
      customer,
      checkout,
      items,
      lang,
      paymentMethod: 'invoice',
      paytrail: null,
    })

    updateCustomerAddresses(customer.id, {
      defaultShippingAddress: checkout.deliveryAddress,
      defaultBillingCompany: checkout.billingCompany,
      defaultBillingAddress: checkout.billingAddress,
    })

    orders.push(order)
    writeOrders(orders)

    const mailResult = await sendOrderEmails(order)
    if (mailResult.ok) {
      order.confirmationEmailSentAt = new Date().toISOString()
      writeOrders(orders)
    }

    res.status(201).json({
      orderId: order.id,
      mailWarning: !mailResult.ok,
    })
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to create invoice order.' })
  }
})

app.post('/api/checkout/paytrail/start', requireCustomer, async (req, res) => {
  try {
    if (!paytrailConfig.account || !paytrailConfig.secret) {
      res.status(503).json({ message: paytrailConfigErrorMessage })
      return
    }

    const siteUrl = getPaytrailSiteUrl(req)
    if (!isPaytrailPublicUrlAllowed(siteUrl)) {
      res.status(400).json({
        message: paytrailSiteUrlErrorMessage,
      })
      return
    }
    const customer = req.customer
    const items = getCatalogOrderItems(req.body?.items)
    const checkout = normalizeCheckoutInput(req.body)
    const lang = 'fi'

    if (items.length === 0) {
      res.status(400).json({ message: 'Cart is empty.' })
      return
    }

    const checkoutValidationMessage = validateCheckoutInput(checkout)
    if (checkoutValidationMessage) {
      res.status(400).json({ message: checkoutValidationMessage })
      return
    }

    const orders = readOrders()
    const order = createOrderRecord({
      orders,
      customer,
      checkout,
      items,
      lang,
      paymentMethod: 'paytrail',
      paytrail: {
        stamp: `spt-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
      },
    })

    const paytrailItems = buildPaytrailItems(items, order.shipping)

    const paytrailResponse = await requestPaytrail({
      config: paytrailConfig,
      method: 'POST',
      pathname: '/payments',
      body: {
        stamp: order.paytrail.stamp,
        reference: order.id,
        amount: toMinorUnits(order.total),
        currency: 'EUR',
        language: 'FI',
        orderId: order.id,
        items: paytrailItems,
        customer: {
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName,
          phone: customer.phone,
          vatId: businessIdToVatId(customer.businessId),
          companyName: customer.companyName,
        },
        deliveryAddress: checkout.deliveryAddress,
        invoicingAddress: checkout.billingAddress,
        redirectUrls: {
          success: `${siteUrl}/kassa/paytrail/success`,
          cancel: `${siteUrl}/kassa/paytrail/cancel`,
        },
        callbackUrls: {
          success: `${siteUrl}/api/paytrail/callback/success`,
          cancel: `${siteUrl}/api/paytrail/callback/cancel`,
        },
        groups: ['creditcard'],
        usePricesWithoutVat: true,
      },
    })

    if (!paytrailResponse.signatureValid) {
      res.status(502).json({ message: 'Paytrail response signature validation failed.' })
      return
    }

    if (!paytrailResponse.ok || !paytrailResponse.data?.href || !paytrailResponse.data?.transactionId) {
      res.status(paytrailResponse.status || 502).json({
        message: paytrailResponse.data?.message ?? 'Failed to create Paytrail payment.',
      })
      return
    }

    order.paytrail = {
      ...order.paytrail,
      transactionId: paytrailResponse.data.transactionId,
      provider: '',
      status: 'new',
      requestId: paytrailResponse.requestId,
      lastUpdatedAt: new Date().toISOString(),
    }

    updateCustomerAddresses(customer.id, {
      defaultShippingAddress: checkout.deliveryAddress,
      defaultBillingCompany: checkout.billingCompany,
      defaultBillingAddress: checkout.billingAddress,
    })

    orders.push(order)
    writeOrders(orders)

    res.status(201).json({
      orderId: order.id,
      redirectUrl: paytrailResponse.data.href,
      testMode: paytrailConfig.testMode,
    })
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to start Paytrail payment.' })
  }
})

app.post('/api/checkout/paytrail/guest/start', async (req, res) => {
  try {
    if (!paytrailConfig.account || !paytrailConfig.secret) {
      res.status(503).json({ message: paytrailConfigErrorMessage })
      return
    }

    const siteUrl = getPaytrailSiteUrl(req)
    if (!isPaytrailPublicUrlAllowed(siteUrl)) {
      res.status(400).json({
        message: paytrailSiteUrlErrorMessage,
      })
      return
    }
    const guestCustomer = normalizeGuestCustomerInput(req.body)
    const items = getCatalogOrderItems(req.body?.items)
    const checkout = normalizeCheckoutInput(req.body)
    const lang = 'fi'

    if (items.length === 0) {
      res.status(400).json({ message: 'Cart is empty.' })
      return
    }

    const guestValidationMessage = validateGuestCustomerInput(guestCustomer)
    if (guestValidationMessage) {
      res.status(400).json({ message: guestValidationMessage })
      return
    }

    const checkoutValidationMessage = validateCheckoutInput(checkout)
    if (checkoutValidationMessage) {
      res.status(400).json({ message: checkoutValidationMessage })
      return
    }

    const orders = readOrders()
    const order = createOrderRecord({
      orders,
      customer: guestCustomer,
      checkout,
      items,
      lang,
      paymentMethod: 'paytrail',
      paytrail: {
        stamp: `spt-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
      },
    })
    const paytrailItems = buildPaytrailItems(items, order.shipping)

    const paytrailResponse = await requestPaytrail({
      config: paytrailConfig,
      method: 'POST',
      pathname: '/payments',
      body: {
        stamp: order.paytrail.stamp,
        reference: order.id,
        amount: toMinorUnits(order.total),
        currency: 'EUR',
        language: 'FI',
        orderId: order.id,
        items: paytrailItems,
        customer: {
          email: guestCustomer.email,
          firstName: guestCustomer.firstName,
          lastName: guestCustomer.lastName || guestCustomer.firstName,
          phone: guestCustomer.phone,
          vatId: businessIdToVatId(guestCustomer.businessId),
          companyName: guestCustomer.companyName,
        },
        deliveryAddress: checkout.deliveryAddress,
        invoicingAddress: checkout.billingAddress,
        redirectUrls: {
          success: `${siteUrl}/kassa/paytrail/success?guest=1`,
          cancel: `${siteUrl}/kassa/paytrail/cancel?guest=1`,
        },
        callbackUrls: {
          success: `${siteUrl}/api/paytrail/callback/success`,
          cancel: `${siteUrl}/api/paytrail/callback/cancel`,
        },
        groups: ['creditcard'],
        usePricesWithoutVat: true,
      },
    })

    if (!paytrailResponse.signatureValid) {
      res.status(502).json({ message: 'Paytrail response signature validation failed.' })
      return
    }

    if (!paytrailResponse.ok || !paytrailResponse.data?.href || !paytrailResponse.data?.transactionId) {
      res.status(paytrailResponse.status || 502).json({
        message: paytrailResponse.data?.message ?? 'Failed to create Paytrail payment.',
      })
      return
    }

    order.paytrail = {
      ...order.paytrail,
      transactionId: paytrailResponse.data.transactionId,
      provider: '',
      status: 'new',
      requestId: paytrailResponse.requestId,
      lastUpdatedAt: new Date().toISOString(),
    }

    orders.push(order)
    writeOrders(orders)

    res.status(201).json({
      orderId: order.id,
      redirectUrl: paytrailResponse.data.href,
      testMode: paytrailConfig.testMode,
    })
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to start guest Paytrail payment.' })
  }
})

app.get('/api/paytrail/redirect/confirm', async (req, res) => {
  try {
    const { order, mailResult } = await finalizePaytrailOrder(req, 'redirect')
    res.json({
      ok: true,
      orderId: order.id,
      paymentStatus: order.paymentStatus,
      isGuest: !order.customerId,
      mailWarning: !mailResult.ok,
    })
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Failed to confirm Paytrail redirect.' })
  }
})

app.get('/api/paytrail/callback/:result', async (req, res) => {
  try {
    await finalizePaytrailOrder(req, 'callback')
    res.status(200).send('OK')
  } catch (error) {
    res.status(400).send(error instanceof Error ? error.message : 'Invalid callback')
  }
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
    const lang = 'fi'
    if (!customer.email || !customer.company || items.length === 0) {
      res.status(400).json({ message: 'Missing order payload fields' })
      return
    }

    const orders = readOrders()
    const subtotal = Number(payload.subtotal ?? 0)
    const shipping = Number(payload.shipping ?? 0)
    const total = Number(payload.total ?? 0)
    const order = {
      id: makeOrderId(orders),
      lang,
      status: 'new',
      createdAt: new Date().toISOString(),
      shippedAt: null,
      paymentMethod: payload.paymentMethod === 'paytrail' ? 'paytrail' : 'invoice',
      paymentStatus: payload.paymentStatus ?? 'invoice_pending',
      confirmationEmailSentAt: null,
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
        billingZip: customer.billingZip ?? '',
        billingCity: customer.billingCity ?? '',
        notes: customer.notes ?? '',
        businessId: customer.businessId ?? '',
      },
      items: items.map((item) => ({
        productId: item.productId ?? '',
        name: item.name ?? '',
        quantity: Number(item.quantity ?? 0),
        unitPrice: Number(item.unitPrice ?? 0),
        priceUnit: item.priceUnit ?? '',
        selectedOptions: normalizeSelectedOptions(item.selectedOptions),
      })),
      subtotal,
      shipping,
      total,
      vatAmount: Number(payload.vatAmount ?? vatFromNet(total)),
      grossSubtotal: Number(payload.grossSubtotal ?? grossFromNet(subtotal)),
      grossShipping: Number(payload.grossShipping ?? grossFromNet(shipping)),
      grossTotal: Number(payload.grossTotal ?? grossFromNet(total)),
    }

    orders.push(order)
    writeOrders(orders)

    const mailResult = await sendOrderEmails(order)
    if (mailResult.ok) {
      order.confirmationEmailSentAt = new Date().toISOString()
      writeOrders(orders)
    }

    res.status(201).json({ orderId: order.id, mailWarning: !mailResult.ok })
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
  const catalog = readPublicCatalog()
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
  const catalog = readPublicCatalog()
  const legacyProductId = String(req.query.product ?? '').trim()
  if (legacyProductId) {
    const match = catalog.products.find((item) => item.id === legacyProductId)
    if (match) {
      res.redirect(301, `/tuote/${match.slug}`)
      return
    }
  }

  const route = getSpaRouteFromRequest(req)
  res.type('html').send(
    renderSpaPage({
      siteUrl: getSiteUrl(req),
      catalog,
      route,
    }),
  )
})

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})
