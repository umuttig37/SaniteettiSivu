import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '..', 'data')
const seedFile = path.join(__dirname, 'catalog.seed.json')
const catalogFile = path.join(dataDir, 'catalog.json')

const fallbackCatalog = {
  categories: [
    { id: 'muut', slug: 'muut', nameFi: 'Muut', nameEn: 'Other' },
  ],
  products: [],
}

const repairText = (value) =>
  String(value ?? '')
    .replaceAll('\u00C3\u00A4', 'ä')
    .replaceAll('\u00C3\u00B6', 'ö')
    .replaceAll('\u00C3\u00A5', 'å')
    .replaceAll('\u00C3\u201E', 'Ä')
    .replaceAll('\u00C3\u2013', 'Ö')
    .replaceAll('\u00C3\u2026', 'Å')
    .replaceAll('\u00C3\u0178', 'ß')
    .replaceAll('\u00E2\u201A\u00AC', '€')
    .replaceAll('\u00E2\u20AC\u201C', '–')
    .replaceAll('\u00E2\u20AC\u00A6', '…')

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
  repairText(value)
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
  const trimmed = repairText(value).trim()
  if (trimmed.length <= maxLength) {
    return trimmed
  }
  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trim()}…`
}

export const slugify = (value) =>
  stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')

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
  const description = repairText(product.description).trim()
  const base = `${repairText(product.name)}. ${description || 'Tilaa laskulla nopeasti Suomen Paperitukusta.'} Nopeasti yritykselle toimitettuna.`
  return shortenText(base, 155)
}

const buildSeoTitle = (product, categoryId) => {
  const suffix = seoHintByCategory[categoryId] ?? 'yrityksille nopeasti'
  return `${repairText(product.name)} – ${suffix} | Suomen Paperitukku`
}

const buildSearchKeywords = (product, categoryLabel) => {
  const name = repairText(product.name)
  const safeCategoryLabel = repairText(categoryLabel)
  const sku = repairText(product.sku)
  const rawParts = [
    name,
    safeCategoryLabel,
    sku,
    ...name.split(/[,.]/g).map((item) => item.trim()),
    ...name.split(/\s+/g).slice(0, 4),
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
  const nameFi = repairText(category?.nameFi ?? category?.id ?? 'Muut').trim() || 'Muut'
  const nameEn = repairText(category?.nameEn ?? nameFi).trim() || nameFi
  const slug = slugify(category?.slug ?? category?.id ?? nameFi) || 'muut'

  return {
    id: slug,
    slug,
    nameFi,
    nameEn,
  }
}

const normalizeOptionGroups = (groups) =>
  Array.isArray(groups)
    ? groups
        .map((group, groupIndex) => {
          const name = repairText(group?.name).trim()
          const values = Array.isArray(group?.values)
            ? group.values
                .map((value, valueIndex) => {
                  const label = repairText(value?.label).trim()
                  if (!label) {
                    return null
                  }

                  return {
                    id: String(value?.id ?? '').trim() || slugify(`${name || 'option'}-${label}-${valueIndex + 1}`) || `value-${valueIndex + 1}`,
                    label,
                    detail: repairText(value?.detail).trim() || undefined,
                    price: Number.isFinite(Number(value?.price)) ? Number(value.price) : undefined,
                  }
                })
                .filter(Boolean)
            : []

          if (!name || values.length === 0) {
            return null
          }

          return {
            id: String(group?.id ?? '').trim() || slugify(`${name}-${groupIndex + 1}`) || `option-${groupIndex + 1}`,
            name,
            values,
          }
        })
        .filter(Boolean)
    : []

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
    name: repairText(product?.name).trim(),
    category: categoryId,
    price: Number(product?.price ?? 0),
    priceUnit: repairText(product?.priceUnit ?? 'EUR / kpl').trim(),
    unitNote: repairText(product?.unitNote).trim() || undefined,
    sku: repairText(product?.sku).trim(),
    stock: Number(product?.stock ?? 0),
    image: primaryImage,
    images: images.length > 0 ? images : [primaryImage],
    description: repairText(product?.description ?? product?.name).trim(),
    featured: Boolean(product?.featured),
    featuredRank: Number.isFinite(Number(product?.featuredRank)) ? Number(product.featuredRank) : 999,
    optionGroups: normalizeOptionGroups(product?.optionGroups),
    seoTitle: (() => {
      const customSeoTitle = repairText(product?.seoTitle).trim()
      return customSeoTitle && !customSeoTitle.includes('…') ? customSeoTitle : buildSeoTitle(product, categoryId)
    })(),
    metaDescription: repairText(product?.metaDescription).trim() || buildMetaDescription(product),
    searchKeywords: Array.isArray(product?.searchKeywords)
      ? product.searchKeywords.map((item) => repairText(item).trim()).filter(Boolean)
      : buildSearchKeywords(product, categoryLabel),
    createdAt,
    updatedAt,
  }
}

const normalizeCatalog = (catalog) => {
  const categories =
    Array.isArray(catalog?.categories) && catalog.categories.length > 0
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
  const seed = fs.existsSync(seedFile) ? normalizeCatalog(readJson(seedFile)) : normalizeCatalog(fallbackCatalog)

  if (!fs.existsSync(catalogFile)) {
    writeJson(catalogFile, seed)
    return
  }

  try {
    const current = normalizeCatalog(readJson(catalogFile))
    const hasOnlyFallbackCategory = current.categories.length === 1 && current.categories[0]?.id === 'muut'
    const shouldBootstrapFromSeed = current.products.length === 0 && hasOnlyFallbackCategory && seed.products.length > 0

    if (shouldBootstrapFromSeed) {
      writeJson(catalogFile, seed)
    }
  } catch {
    writeJson(catalogFile, seed)
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

  const nextCategories = [...catalog.categories]
  const fallbackIndex = nextCategories.findIndex((item) => item.id === 'muut')

  if (fallbackIndex >= 0) {
    nextCategories.splice(fallbackIndex, 0, normalized)
  } else {
    nextCategories.push(normalized)
  }

  return writeCatalog({
    ...catalog,
    categories: nextCategories,
  })
}

export const deleteCategory = (categoryId) => {
  const catalog = readCatalog()
  const nextCategories = catalog.categories.filter((item) => item.id !== categoryId)
  const safeCategories = nextCategories.some((item) => item.id === 'muut')
    ? nextCategories
    : [...nextCategories, normalizeCategory({ id: 'muut', nameFi: 'Muut', nameEn: 'Other' })]

  const nextProducts = catalog.products.map((item) =>
    item.category === categoryId ? { ...item, category: 'muut', updatedAt: new Date().toISOString() } : item,
  )

  return writeCatalog({
    categories: safeCategories,
    products: nextProducts,
  })
}

export const updateCategory = (categoryId, input) => {
  const catalog = readCatalog()
  const nameFi = repairText(input?.nameFi).trim()
  const nameEn = repairText(input?.nameEn ?? nameFi).trim()

  if (!nameFi || !nameEn) {
    return catalog
  }

  const nextCategories = catalog.categories.map((item) =>
    item.id === categoryId
      ? {
          ...item,
          nameFi,
          nameEn,
        }
      : item,
  )

  return writeCatalog({
    ...catalog,
    categories: nextCategories,
  })
}

export const reorderCategories = (orderedIds) => {
  const catalog = readCatalog()
  const categoriesById = new Map(catalog.categories.map((item) => [item.id, item]))
  const nextCategories = []

  for (const categoryId of Array.isArray(orderedIds) ? orderedIds : []) {
    const match = categoriesById.get(String(categoryId))
    if (!match) {
      continue
    }

    nextCategories.push(match)
    categoriesById.delete(match.id)
  }

  for (const leftover of categoriesById.values()) {
    nextCategories.push(leftover)
  }

  return writeCatalog({
    ...catalog,
    categories: nextCategories,
  })
}

export const getProductBySlug = (slug) => readCatalog().products.find((item) => item.slug === slug) ?? null

export const getCategoryById = (id) => readCatalog().categories.find((item) => item.id === id) ?? null

export const getCatalogFilePath = () => catalogFile
