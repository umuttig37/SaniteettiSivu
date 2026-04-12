import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '..', 'data')
const customersFile = path.join(dataDir, 'customers.json')

let customerCache = null
let customerCacheMtimeMs = null

const ensureDataDir = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
}

export const ensureCustomerStore = () => {
  ensureDataDir()
  if (!fs.existsSync(customersFile)) {
    fs.writeFileSync(customersFile, '[]', 'utf8')
    customerCache = []
    customerCacheMtimeMs = fs.statSync(customersFile).mtimeMs
  }
}

const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase()

export const normalizeBusinessId = (value) => {
  const cleaned = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^0-9-]/g, '')

  if (/^\d{8}$/.test(cleaned)) {
    return `${cleaned.slice(0, 7)}-${cleaned.slice(7)}`
  }

  return cleaned
}

const businessIdChecksumWeights = [7, 9, 10, 5, 8, 4, 2]

export const isValidBusinessId = (value) => {
  const normalized = normalizeBusinessId(value)
  if (!/^\d{7}-\d$/.test(normalized)) {
    return false
  }

  const digits = normalized.replace('-', '')
  const checksumSource = digits
    .slice(0, 7)
    .split('')
    .reduce((sum, digit, index) => sum + Number(digit) * businessIdChecksumWeights[index], 0)
  const remainder = checksumSource % 11

  if (remainder === 1) {
    return false
  }

  const expectedCheckDigit = remainder === 0 ? 0 : 11 - remainder
  return Number(digits[7]) === expectedCheckDigit
}

export const businessIdToVatId = (value) => {
  const normalized = normalizeBusinessId(value)
  return /^\d{7}-\d$/.test(normalized) ? `FI${normalized.replace('-', '')}` : ''
}

const normalizeAddress = (input) => {
  if (!input || typeof input !== 'object') {
    return null
  }

  const streetAddress = String(input.streetAddress ?? '').trim()
  const postalCode = String(input.postalCode ?? '').trim()
  const city = String(input.city ?? '').trim()
  const country = String(input.country ?? 'FI').trim().toUpperCase() || 'FI'

  if (!streetAddress || !postalCode || !city) {
    return null
  }

  return {
    streetAddress,
    postalCode,
    city,
    country,
  }
}

const normalizeCustomer = (customer) => {
  const createdAt = String(customer?.createdAt ?? new Date().toISOString())
  const updatedAt = String(customer?.updatedAt ?? createdAt)

  return {
    id: String(customer?.id ?? `cus_${Date.now()}`),
    createdAt,
    updatedAt,
    firstName: String(customer?.firstName ?? '').trim(),
    lastName: String(customer?.lastName ?? '').trim(),
    companyName: String(customer?.companyName ?? '').trim(),
    businessId: normalizeBusinessId(customer?.businessId),
    phone: String(customer?.phone ?? '').trim(),
    email: normalizeEmail(customer?.email),
    passwordHash: String(customer?.passwordHash ?? '').trim(),
    passwordSalt: String(customer?.passwordSalt ?? '').trim(),
    defaultShippingAddress: normalizeAddress(customer?.defaultShippingAddress) ?? undefined,
    defaultBillingCompany: String(customer?.defaultBillingCompany ?? '').trim() || undefined,
    defaultBillingAddress: normalizeAddress(customer?.defaultBillingAddress) ?? undefined,
  }
}

const rememberCustomers = (customers) => {
  customerCache = customers
  try {
    customerCacheMtimeMs = fs.statSync(customersFile).mtimeMs
  } catch {
    customerCacheMtimeMs = null
  }
  return customers
}

const getCachedCustomers = () => {
  if (!customerCache || customerCacheMtimeMs === null) {
    return null
  }

  try {
    const nextMtime = fs.statSync(customersFile).mtimeMs
    return nextMtime === customerCacheMtimeMs ? customerCache : null
  } catch {
    return null
  }
}

export const readCustomers = () => {
  ensureCustomerStore()
  const cached = getCachedCustomers()
  if (cached) {
    return cached
  }

  const raw = fs.readFileSync(customersFile, 'utf8')
  const parsed = JSON.parse(raw)
  const customers = Array.isArray(parsed) ? parsed.map(normalizeCustomer) : []
  return rememberCustomers(customers)
}

export const writeCustomers = (customers) => {
  ensureCustomerStore()
  const normalized = Array.isArray(customers) ? customers.map(normalizeCustomer) : []
  fs.writeFileSync(customersFile, JSON.stringify(normalized, null, 2), 'utf8')
  return rememberCustomers(normalized)
}

export const getCustomerById = (customerId) =>
  readCustomers().find((customer) => customer.id === String(customerId).trim()) ?? null

export const getCustomerByEmail = (email) => {
  const normalizedEmail = normalizeEmail(email)
  return readCustomers().find((customer) => customer.email === normalizedEmail) ?? null
}

export const createPasswordDigest = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const digest = crypto.scryptSync(String(password ?? ''), salt, 64)
  return {
    salt,
    hash: digest.toString('hex'),
  }
}

const safeCompareHex = (leftHex, rightHex) => {
  try {
    const left = Buffer.from(leftHex, 'hex')
    const right = Buffer.from(rightHex, 'hex')
    return left.length === right.length && crypto.timingSafeEqual(left, right)
  } catch {
    return false
  }
}

export const verifyPassword = (password, customer) => {
  if (!customer?.passwordHash || !customer?.passwordSalt) {
    return false
  }

  const nextDigest = crypto.scryptSync(String(password ?? ''), customer.passwordSalt, 64).toString('hex')
  return safeCompareHex(nextDigest, customer.passwordHash)
}

export const createCustomer = (input) => {
  const email = normalizeEmail(input?.email)
  if (!email) {
    throw new Error('Email is required')
  }
  if (getCustomerByEmail(email)) {
    throw new Error('An account with this email already exists.')
  }

  const now = new Date().toISOString()
  const { salt, hash } = createPasswordDigest(String(input?.password ?? ''))
  const customers = readCustomers()
  const customer = normalizeCustomer({
    id: `cus_${Date.now()}`,
    createdAt: now,
    updatedAt: now,
    firstName: input?.firstName,
    lastName: input?.lastName,
    companyName: input?.companyName,
    businessId: input?.businessId,
    phone: input?.phone,
    email,
    passwordHash: hash,
    passwordSalt: salt,
  })

  writeCustomers([customer, ...customers])
  return customer
}

export const updateCustomerAddresses = (customerId, input) => {
  const customers = readCustomers()
  const nextShippingAddress = normalizeAddress(input?.defaultShippingAddress)
  const nextBillingAddress = normalizeAddress(input?.defaultBillingAddress)
  const nextBillingCompany = String(input?.defaultBillingCompany ?? '').trim() || undefined
  let updatedCustomer = null

  const nextCustomers = customers.map((customer) => {
    if (customer.id !== customerId) {
      return customer
    }

    updatedCustomer = normalizeCustomer({
      ...customer,
      updatedAt: new Date().toISOString(),
      defaultShippingAddress: nextShippingAddress ?? customer.defaultShippingAddress,
      defaultBillingCompany: nextBillingCompany ?? customer.defaultBillingCompany,
      defaultBillingAddress: nextBillingAddress ?? customer.defaultBillingAddress,
    })

    return updatedCustomer
  })

  if (!updatedCustomer) {
    return null
  }

  writeCustomers(nextCustomers)
  return updatedCustomer
}

export const toPublicCustomer = (customer) => {
  if (!customer) {
    return null
  }

  return {
    id: customer.id,
    firstName: customer.firstName,
    lastName: customer.lastName,
    companyName: customer.companyName,
    businessId: customer.businessId,
    phone: customer.phone,
    email: customer.email,
    defaultShippingAddress: customer.defaultShippingAddress ?? null,
    defaultBillingCompany: customer.defaultBillingCompany ?? customer.companyName,
    defaultBillingAddress: customer.defaultBillingAddress ?? null,
  }
}
