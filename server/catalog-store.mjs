import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '..', 'data')
const seedFile = path.join(dataDir, 'catalog.seed.json')
const catalogFile = path.join(dataDir, 'catalog.json')

const fallbackCatalog = {
  categories: [
    { id: 'muut', slug: 'muut', nameFi: 'Muut', nameEn: 'Other' },
  ],
  products: [],
}

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'))

const writeJson = (filePath, value) => {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8')
}

const ensureDataDir = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
}

const stripAccents = (value) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')

const seoHintByCategory = {
  'wc-paperit': 'edullinen wc-paperi',
  kasipyyhkeet: 'laadukas käsipyyhe',
  saippuat: 'ammattitason saippua',
  puhdistus: 'tehokas puhdistusaine',
  jatesakit: 'kestävä jätesäkki',
}

const shortenText = (value, maxLength) => {
  const trimmed = String(value ?? '').trim()
  if (trimmed.length <= maxLength) {
    return trimmed
  }
  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trim()}…`
}

export const slugify = (value) => {
  return stripAccents(String(value ?? ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

const ensureUniqueSlug = (baseSlug, items, currentId = null) => {
  const root = baseSlug || 'tuote'
  let next = root
  let counter = 2

  while (items.some((item) => item.slug === next && item.id !== currentId)) {
    next = `${root}-${counter}`
    counter += 1
  }

  return next
}

const buildMetaDescription = (product) => {
  const description = String(product.description ?? '').trim()
  const base = `${product.name}. ${description || 'Tilaa laskulla nopeasti Suomen Paperitukusta.'} Nopeasti yritykselle toimitettuna.`
  return shortenText(base, 155)
}

const buildSeoTitle = (product, categoryId) => {
  const suffix = seoHintByCategory[categoryId] ?? 'yrityksille nopeasti'
  return `${product.name} – ${suffix} | Suomen Paperitukku`
}

const buildSearchKeywords = (product, categoryLabel) => {
  const rawParts = [
    String(product.name ?? ''),
    String(categoryLabel ?? ''),
    String(product.sku ?? ''),
    ...String(product.name ?? '').split(/[,.]/g).map((item) => item.trim()),
    ...String(product.name ?? '').split(/\s+/g).slice(0, 4),
  ]

  return Array.from(
    new Set(
      rawParts
        .map((item) => item.trim())
        .filter((item) => item.length >= 3),
    ),
  )
}

const normalizeCategory = (category) => {
  const nameFi = String(category?.nameFi ?? category?.id ?? 'Muut').trim() || 'Muut'
  const nameEn = String(category?.nameEn ?? nameFi).trim() || nameFi
  const slug = slugify(category?.slug ?? category?.id ?? nameFi) || 'muut'
  return {
    id: slug,
    slug,
    nameFi,
    nameEn,
  }
}

const normalizeProduct = (product, categories, products) => {
  const fallbackCategory = categories.find((item) => item.id === 'muut') ?? categories[0]
  const categoryId = categories.some((item) => item.id === product?.category) ? product.category : fallbackCategory.id
  const categoryLabel = categories.find((item) => item.id === categoryId)?.nameFi ?? categoryId
  const images = Array.isArray(product?.images)
    ? product.images.filter((item) => typeof item === 'string' && item.trim() !== '')
    : []
  const primaryImage = String(product?.image ?? images[0] ?? '/products/hand-towel.svg')
  const createdAt = product?.createdAt ?? new Date().toISOString()
  const updatedAt = product?.updatedAt ?? createdAt

  return {
    id: String(product?.id ?? `p-${Date.now()}`),
    slug: ensureUniqueSlug(slugify(product?.slug ?? product?.name ?? product?.id ?? 'tuote'), products, product?.id ?? null),
    name: String(product?.name ?? '').trim(),
    category: categoryId,
    price: Number(product?.price ?? 0),
    priceUnit: String(product?.priceUnit ?? 'EUR / kpl').trim(),
    unitNote: String(product?.unitNote ?? '').trim() || undefined,
    sku: String(product?.sku ?? '').trim(),
    stock: Number(product?.stock ?? 0),
    image: primaryImage,
    images: images.length > 0 ? images : [primaryImage],
    description: String(product?.description ?? product?.name ?? '').trim(),
    seoTitle: (() => {
      const customSeoTitle = String(product?.seoTitle ?? '').trim()
      return customSeoTitle && !customSeoTitle.includes('\u2026') ? customSeoTitle : buildSeoTitle(product, categoryId)
    })(),
    metaDescription: String(product?.metaDescription ?? '').trim() || buildMetaDescription(product),
    searchKeywords: Array.isArray(product?.searchKeywords)
      ? product.searchKeywords.map((item) => String(item).trim()).filter(Boolean)
      : buildSearchKeywords(product, categoryLabel),
    createdAt,
    updatedAt,
  }
}

const normalizeCatalog = (catalog) => {
  const categories = Array.isArray(catalog?.categories) && catalog.categories.length > 0
    ? catalog.categories.map(normalizeCategory)
    : fallbackCatalog.categories.map(normalizeCategory)

  if (!categories.some((item) => item.id === 'muut')) {
    categories.push(normalizeCategory({ id: 'muut', nameFi: 'Muut', nameEn: 'Other' }))
  }

  const products = []
  for (const rawProduct of Array.isArray(catalog?.products) ? catalog.products : []) {
    const normalized = normalizeProduct(rawProduct, categories, products)
    if (normalized.name && normalized.sku) {
      products.push(normalized)
    }
  }

  return { categories, products }
}

export const ensureCatalogStore = () => {
  ensureDataDir()
  if (!fs.existsSync(catalogFile)) {
    const seed = fs.existsSync(seedFile) ? readJson(seedFile) : fallbackCatalog
    const normalized = normalizeCatalog(seed)
    writeJson(catalogFile, normalized)
  }
}

export const readCatalog = () => {
  ensureCatalogStore()
  return normalizeCatalog(readJson(catalogFile))
}

export const writeCatalog = (catalog) => {
  ensureCatalogStore()
  const normalized = normalizeCatalog(catalog)
  writeJson(catalogFile, normalized)
  return normalized
}

export const upsertProduct = (input) => {
  const catalog = readCatalog()
  const now = new Date().toISOString()
  const existing = catalog.products.find((item) => item.id === input.id)

  const candidate = normalizeProduct(
    {
      ...existing,
      ...input,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      slug: existing?.slug ?? input.slug ?? input.name,
    },
    catalog.categories,
    catalog.products.filter((item) => item.id !== input.id),
  )

  const nextProducts = existing
    ? catalog.products.map((item) => (item.id === existing.id ? candidate : item))
    : [candidate, ...catalog.products]

  return writeCatalog({
    ...catalog,
    products: nextProducts,
  })
}

export const deleteProduct = (productId) => {
  const catalog = readCatalog()
  return writeCatalog({
    ...catalog,
    products: catalog.products.filter((item) => item.id !== productId),
  })
}

export const addCategory = (input) => {
  const catalog = readCatalog()
  const normalized = normalizeCategory(input)
  if (catalog.categories.some((item) => item.id === normalized.id || item.slug === normalized.slug)) {
    return catalog
  }
  return writeCatalog({
    ...catalog,
    categories: [...catalog.categories, normalized],
  })
}

export const deleteCategory = (categoryId) => {
  const catalog = readCatalog()
  const nextCategories = catalog.categories.filter((item) => item.id !== categoryId)
  const safeCategories = nextCategories.some((item) => item.id === 'muut')
    ? nextCategories
    : [...nextCategories, normalizeCategory({ id: 'muut', nameFi: 'Muut', nameEn: 'Other' })]

  const nextProducts = catalog.products.map((item) =>
    item.category === categoryId ? { ...item, category: 'muut', updatedAt: new Date().toISOString() } : item
  )

  return writeCatalog({
    categories: safeCategories,
    products: nextProducts,
  })
}

export const getProductBySlug = (slug) => readCatalog().products.find((item) => item.slug === slug) ?? null

export const getCategoryById = (id) => readCatalog().categories.find((item) => item.id === id) ?? null

export const getCatalogFilePath = () => catalogFile
