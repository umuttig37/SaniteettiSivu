import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '..', 'data')
const pricesFile = path.join(dataDir, 'customer-prices.json')

let priceCache = null
let priceCacheMtimeMs = null
let atomicWriteCounter = 0

const ensureDataDir = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
}

const writeJsonAtomic = (filePath, value) => {
  const tempFile = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${atomicWriteCounter += 1}.tmp`,
  )
  let fileDescriptor = null

  try {
    fileDescriptor = fs.openSync(tempFile, 'wx')
    fs.writeFileSync(fileDescriptor, JSON.stringify(value, null, 2), 'utf8')
    fs.fsyncSync(fileDescriptor)
    fs.closeSync(fileDescriptor)
    fileDescriptor = null
    fs.renameSync(tempFile, filePath)
  } catch (error) {
    if (fileDescriptor !== null) {
      fs.closeSync(fileDescriptor)
    }
    try {
      fs.unlinkSync(tempFile)
    } catch {
      // The temporary file may already have been renamed or may not exist.
    }
    throw error
  }
}

const normalizePrice = (value) => Math.round(Number(value) * 100) / 100

const normalizeEntry = (entry) => {
  const customerId = String(entry?.customerId ?? '').trim()
  const productId = String(entry?.productId ?? '').trim()
  const price = normalizePrice(entry?.price)
  if (!customerId || !productId || !Number.isFinite(price) || price <= 0) {
    return null
  }

  const createdAt = String(entry?.createdAt ?? new Date().toISOString())
  return {
    customerId,
    productId,
    price,
    createdAt,
    updatedAt: String(entry?.updatedAt ?? createdAt),
  }
}

const normalizeEntries = (value) => {
  const source = Array.isArray(value) ? value : Array.isArray(value?.prices) ? value.prices : []
  const uniqueEntries = new Map()

  for (const rawEntry of source) {
    const entry = normalizeEntry(rawEntry)
    if (entry) {
      uniqueEntries.set(`${entry.customerId}:${entry.productId}`, entry)
    }
  }

  return [...uniqueEntries.values()]
}

const rememberPrices = (entries) => {
  priceCache = entries
  try {
    priceCacheMtimeMs = fs.statSync(pricesFile).mtimeMs
  } catch {
    priceCacheMtimeMs = null
  }
  return entries
}

const readPricesFromDisk = () => {
  try {
    return normalizeEntries(JSON.parse(fs.readFileSync(pricesFile, 'utf8')))
  } catch (error) {
    console.error(`[customer-prices] Failed to read ${pricesFile}. Existing prices were not modified.`, error)
    throw new Error('Customer prices could not be read. No pricing data was written.', { cause: error })
  }
}

export const ensureCustomerPriceStore = () => {
  ensureDataDir()
  if (!fs.existsSync(pricesFile)) {
    writeJsonAtomic(pricesFile, { prices: [] })
    rememberPrices([])
    return
  }

  readPricesFromDisk()
}

export const readCustomerPrices = (customerId = null) => {
  ensureCustomerPriceStore()
  try {
    const stats = fs.statSync(pricesFile)
    if (!priceCache || priceCacheMtimeMs !== stats.mtimeMs) {
      rememberPrices(readPricesFromDisk())
    }
  } catch (error) {
    console.error(`[customer-prices] Failed to access ${pricesFile}. Existing prices were not modified.`, error)
    throw error
  }

  const normalizedCustomerId = String(customerId ?? '').trim()
  return normalizedCustomerId
    ? priceCache.filter((entry) => entry.customerId === normalizedCustomerId)
    : [...priceCache]
}

const writeCustomerPrices = (entries) => {
  ensureCustomerPriceStore()
  const normalized = normalizeEntries(entries)
  writeJsonAtomic(pricesFile, { prices: normalized })
  return rememberPrices(normalized)
}

export const getCustomerPriceMap = (customerId) =>
  new Map(readCustomerPrices(customerId).map((entry) => [entry.productId, entry.price]))

export const setCustomerPrice = ({ customerId, productId, price }) => {
  const normalizedCustomerId = String(customerId ?? '').trim()
  const normalizedProductId = String(productId ?? '').trim()
  const normalizedPrice = normalizePrice(price)
  if (!normalizedCustomerId || !normalizedProductId || !Number.isFinite(normalizedPrice) || normalizedPrice <= 0) {
    throw new Error('Customer, product and a valid price are required.')
  }

  const entries = readCustomerPrices()
  const existing = entries.find(
    (entry) => entry.customerId === normalizedCustomerId && entry.productId === normalizedProductId,
  )
  const now = new Date().toISOString()
  const nextEntry = {
    customerId: normalizedCustomerId,
    productId: normalizedProductId,
    price: normalizedPrice,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  const nextEntries = existing
    ? entries.map((entry) =>
        entry.customerId === normalizedCustomerId && entry.productId === normalizedProductId ? nextEntry : entry,
      )
    : [...entries, nextEntry]

  writeCustomerPrices(nextEntries)
  return nextEntry
}

export const deleteCustomerPrice = (customerId, productId) => {
  const normalizedCustomerId = String(customerId ?? '').trim()
  const normalizedProductId = String(productId ?? '').trim()
  const entries = readCustomerPrices()
  const nextEntries = entries.filter(
    (entry) => !(entry.customerId === normalizedCustomerId && entry.productId === normalizedProductId),
  )

  if (nextEntries.length !== entries.length) {
    writeCustomerPrices(nextEntries)
  }
  return nextEntries
}

export const getCustomerPriceFilePath = () => pricesFile
