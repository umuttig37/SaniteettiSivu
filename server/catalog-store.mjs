import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { once } from 'node:events'
import { finished } from 'node:stream/promises'
import { StringDecoder } from 'node:string_decoder'
import { fileURLToPath } from 'node:url'
import chain from 'stream-chain'
import { parser } from 'stream-json'
import { pick } from 'stream-json/filters/pick.js'
import { streamArray } from 'stream-json/streamers/stream-array.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '..', 'data')
const seedFile = path.join(__dirname, 'catalog.seed.json')
const catalogFile = path.join(dataDir, 'catalog.json')
const inlineImagePattern = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/

let catalogCache = null
let catalogCacheMtimeMs = null
let publicCatalogCache = null
let publicCatalogCacheMtimeMs = null
let atomicWriteCounter = 0
let categoryUpdateQueue = Promise.resolve()

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

const createSyncJsonReader = (filePath) => {
  const fileDescriptor = fs.openSync(filePath, 'r')
  const decoder = new StringDecoder('utf8')
  const readBuffer = Buffer.allocUnsafe(64 * 1024)
  let text = ''
  let offset = 0
  let ended = false

  const fill = () => {
    while (offset >= text.length && !ended) {
      const bytesRead = fs.readSync(fileDescriptor, readBuffer, 0, readBuffer.length, null)
      if (bytesRead === 0) {
        text = decoder.end()
        offset = 0
        ended = true
      } else {
        text = decoder.write(readBuffer.subarray(0, bytesRead))
        offset = 0
      }
    }
  }

  return {
    close: () => fs.closeSync(fileDescriptor),
    next: () => {
      fill()
      if (offset >= text.length) {
        return null
      }
      const character = text[offset]
      offset += 1
      return character
    },
    peek: () => {
      fill()
      return offset < text.length ? text[offset] : null
    },
  }
}

const skipWhitespace = (reader) => {
  while (/\s/.test(reader.peek() ?? '')) {
    reader.next()
  }
}

const expectCharacter = (reader, expected) => {
  skipWhitespace(reader)
  const actual = reader.next()
  if (actual !== expected) {
    throw new SyntaxError(`Expected ${expected} but found ${actual ?? 'end of file'}`)
  }
}

const readJsonStringRaw = (reader) => {
  if (reader.next() !== '"') {
    throw new SyntaxError('Expected a JSON string')
  }

  let raw = '"'
  let escaped = false
  while (true) {
    const character = reader.next()
    if (character === null) {
      throw new SyntaxError('Unexpected end of JSON string')
    }
    raw += character
    if (escaped) {
      escaped = false
    } else if (character === '\\') {
      escaped = true
    } else if (character === '"') {
      return raw
    }
  }
}

const consumeCompositeJsonValue = (reader, firstCharacter, collect) => {
  const closingCharacters = [firstCharacter === '{' ? '}' : ']']
  let raw = collect ? firstCharacter : ''
  let inString = false
  let escaped = false

  while (closingCharacters.length > 0) {
    const character = reader.next()
    if (character === null) {
      throw new SyntaxError('Unexpected end of JSON value')
    }
    if (collect) {
      raw += character
    }

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }

    if (character === '"') {
      inString = true
    } else if (character === '{') {
      closingCharacters.push('}')
    } else if (character === '[') {
      closingCharacters.push(']')
    } else if (character === '}' || character === ']') {
      const expected = closingCharacters.pop()
      if (character !== expected) {
        throw new SyntaxError(`Expected ${expected} but found ${character}`)
      }
    }
  }

  return raw
}

const consumeJsonValue = (reader, collect = true) => {
  skipWhitespace(reader)
  const firstCharacter = reader.next()
  if (firstCharacter === null) {
    throw new SyntaxError('Unexpected end of JSON value')
  }
  if (firstCharacter === '"') {
    let raw = '"'
    let escaped = false
    while (true) {
      const character = reader.next()
      if (character === null) {
        throw new SyntaxError('Unexpected end of JSON string')
      }
      if (collect) {
        raw += character
      }
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        return collect ? raw : ''
      }
    }
  }
  if (firstCharacter === '{' || firstCharacter === '[') {
    return consumeCompositeJsonValue(reader, firstCharacter, collect)
  }

  let raw = collect ? firstCharacter : ''
  while (true) {
    const character = reader.peek()
    if (character === null || character === ',' || character === ']' || character === '}' || /\s/.test(character)) {
      return raw
    }
    const nextCharacter = reader.next()
    if (collect) {
      raw += nextCharacter
    }
  }
}

const readJsonArrayItemsSync = (filePath, section, onItem) => {
  const reader = createSyncJsonReader(filePath)
  let sectionFound = false

  try {
    expectCharacter(reader, '{')
    skipWhitespace(reader)
    if (reader.peek() === '}') {
      reader.next()
    } else {
      while (true) {
        skipWhitespace(reader)
        if (reader.peek() !== '"') {
          throw new SyntaxError('Expected a JSON object key')
        }
        const key = JSON.parse(readJsonStringRaw(reader))
        expectCharacter(reader, ':')

        if (key === section) {
          if (sectionFound) {
            throw new SyntaxError(`Duplicate ${section} section in catalog`)
          }
          sectionFound = true
          expectCharacter(reader, '[')
          skipWhitespace(reader)
          if (reader.peek() === ']') {
            reader.next()
          } else {
            while (true) {
              const rawItem = consumeJsonValue(reader)
              onItem(JSON.parse(rawItem))
              skipWhitespace(reader)
              const delimiter = reader.next()
              if (delimiter === ']') {
                break
              }
              if (delimiter !== ',') {
                throw new SyntaxError(`Expected , or ] but found ${delimiter ?? 'end of file'}`)
              }
            }
          }
        } else {
          consumeJsonValue(reader, false)
        }

        skipWhitespace(reader)
        const delimiter = reader.next()
        if (delimiter === '}') {
          break
        }
        if (delimiter !== ',') {
          throw new SyntaxError(`Expected , or } but found ${delimiter ?? 'end of file'}`)
        }
      }
    }

    skipWhitespace(reader)
    if (reader.peek() !== null) {
      throw new SyntaxError('Unexpected data after catalog JSON')
    }
    if (!sectionFound) {
      throw new SyntaxError(`Catalog is missing the ${section} section`)
    }
  } finally {
    reader.close()
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
      // The temporary file may not have been created or may already have been renamed.
    }
    throw error
  }
}

const ensureDataDir = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
}

const createCatalogArrayStream = (section, filePath = catalogFile) =>
  chain([
    fs.createReadStream(filePath, { encoding: 'utf8' }),
    parser(),
    pick({ filter: section }),
    streamArray(),
  ])

const writeStreamChunk = async (stream, chunk) => {
  if (!stream.write(chunk, 'utf8')) {
    await once(stream, 'drain')
  }
}

const readRawCategoriesStreaming = async (filePath = catalogFile) => {
  const categories = []
  for await (const { value } of createCatalogArrayStream('categories', filePath)) {
    categories.push(value)
  }
  return categories
}

const createProductDigest = () => crypto.createHash('sha256')

const updateProductDigest = (digest, serializedProduct) => {
  digest.update(serializedProduct)
  digest.update('\n')
}

const validateStreamedCatalogWrite = async ({ filePath, categories, productCount, productDigest }) => {
  const writtenCategories = await readRawCategoriesStreaming(filePath)
  if (JSON.stringify(writtenCategories) !== JSON.stringify(categories)) {
    throw new Error('Streamed catalog update changed categories unexpectedly. Existing catalog was not modified.')
  }

  const validationDigest = createProductDigest()
  let validatedProductCount = 0
  for await (const { value: product } of createCatalogArrayStream('products', filePath)) {
    updateProductDigest(validationDigest, JSON.stringify(product, null, 2))
    validatedProductCount += 1
  }

  if (validatedProductCount !== productCount || validationDigest.digest('hex') !== productDigest) {
    throw new Error('Streamed catalog product validation failed. Existing catalog was not modified.')
  }
}

const writeCatalogStreaming = async ({ categories, transformProduct = (product) => product, sourceVersion }) => {
  const tempFile = path.join(
    path.dirname(catalogFile),
    `.${path.basename(catalogFile)}.${process.pid}.${Date.now()}.${atomicWriteCounter += 1}.tmp`,
  )
  let fileHandle = null
  let output = null

  try {
    fileHandle = await fs.promises.open(tempFile, 'wx')
    output = fs.createWriteStream(tempFile, {
      fd: fileHandle.fd,
      autoClose: false,
      encoding: 'utf8',
    })

    const serializedCategories = JSON.stringify(categories, null, 2).replaceAll('\n', '\n  ')
    await writeStreamChunk(output, `{\n  "categories": ${serializedCategories},\n  "products": [`)
    const productDigest = createProductDigest()
    let productCount = 0

    for await (const { value: product } of createCatalogArrayStream('products')) {
      const nextProduct = transformProduct(product)
      if (nextProduct === null) {
        continue
      }
      const serializedProduct = JSON.stringify(nextProduct, null, 2)
      updateProductDigest(productDigest, serializedProduct)
      const indentedProduct = serializedProduct.replaceAll('\n', '\n    ')
      await writeStreamChunk(output, `${productCount === 0 ? '\n' : ',\n'}    ${indentedProduct}`)
      productCount += 1
    }

    await writeStreamChunk(output, '\n  ]\n}\n')
    output.end()
    await finished(output)
    output = null
    await fileHandle.sync()
    await fileHandle.close()
    fileHandle = null

    await validateStreamedCatalogWrite({
      filePath: tempFile,
      categories,
      productCount,
      productDigest: productDigest.digest('hex'),
    })

    const currentVersion = await fs.promises.stat(catalogFile)
    if (!isSameFileVersion(sourceVersion, currentVersion)) {
      throw new Error('Catalog changed during streamed update. Existing catalog was not modified; retry the update.')
    }

    await fs.promises.rename(tempFile, catalogFile)
    return productCount
  } catch (error) {
    if (output) {
      output.destroy()
      try {
        await finished(output)
      } catch {
        // The original stream error is reported below.
      }
    }
    if (fileHandle) {
      try {
        await fileHandle.close()
      } catch {
        // The descriptor may already be closed after a stream failure.
      }
    }
    try {
      await fs.promises.unlink(tempFile)
    } catch {
      // The temporary file may not exist or may already have been renamed.
    }
    throw error
  }
}

const validateStreamedCategoryUpdate = async ({ filePath, productId, categoryId, updatedAt, productCount }) => {
  let validatedProductCount = 0
  let targetMatches = 0
  const productStream = chain([
    fs.createReadStream(filePath, { encoding: 'utf8' }),
    parser(),
    pick({ filter: 'products' }),
    streamArray(),
  ])

  for await (const { value: product } of productStream) {
    validatedProductCount += 1
    if (String(product?.id ?? '') === productId) {
      targetMatches += 1
      if (product?.category !== categoryId || product?.updatedAt !== updatedAt) {
        throw new Error('Streamed category update validation failed. Existing catalog was not modified.')
      }
    }
  }

  if (validatedProductCount !== productCount || targetMatches !== 1) {
    throw new Error('Streamed catalog validation failed. Existing catalog was not modified.')
  }
}

const isSameFileVersion = (before, after) =>
  before.size === after.size &&
  before.mtimeMs === after.mtimeMs &&
  (!before.ino || !after.ino || before.ino === after.ino)

const writeCategoryUpdateStreaming = async ({ productId, categoryId, updatedAt, categories, sourceVersion }) => {
  const tempFile = path.join(
    path.dirname(catalogFile),
    `.${path.basename(catalogFile)}.${process.pid}.${Date.now()}.${atomicWriteCounter += 1}.tmp`,
  )
  let fileHandle = null
  let output = null

  try {
    fileHandle = await fs.promises.open(tempFile, 'wx')
    output = fs.createWriteStream(tempFile, {
      fd: fileHandle.fd,
      autoClose: false,
      encoding: 'utf8',
    })

    const serializedCategories = JSON.stringify(categories, null, 2).replaceAll('\n', '\n  ')
    await writeStreamChunk(output, `{\n  "categories": ${serializedCategories},\n  "products": [`)
    let productCount = 0
    let targetMatches = 0

    for await (const { value: product } of createCatalogArrayStream('products')) {
      const isTarget = String(product?.id ?? '') === productId
      if (isTarget) {
        targetMatches += 1
      }
      const nextProduct = isTarget
        ? {
            ...product,
            category: categoryId,
            updatedAt,
          }
        : product

      const serializedProduct = JSON.stringify(nextProduct, null, 2).replaceAll('\n', '\n    ')
      await writeStreamChunk(output, `${productCount === 0 ? '\n' : ',\n'}    ${serializedProduct}`)
      productCount += 1
    }

    if (targetMatches !== 1) {
      throw new Error('Product was not found uniquely in the stored catalog. Existing catalog was not modified.')
    }

    await writeStreamChunk(output, '\n  ]\n}\n')
    output.end()
    await finished(output)
    output = null
    await fileHandle.sync()
    await fileHandle.close()
    fileHandle = null

    await validateStreamedCategoryUpdate({
      filePath: tempFile,
      productId,
      categoryId,
      updatedAt,
      productCount,
    })

    const currentVersion = await fs.promises.stat(catalogFile)
    if (!isSameFileVersion(sourceVersion, currentVersion)) {
      throw new Error('Catalog changed during category update. Existing catalog was not modified; retry the update.')
    }

    await fs.promises.rename(tempFile, catalogFile)
    return productCount
  } catch (error) {
    if (output) {
      output.destroy()
      try {
        await finished(output)
      } catch {
        // The original stream error is reported below.
      }
    }
    if (fileHandle) {
      try {
        await fileHandle.close()
      } catch {
        // The descriptor may already be closed after a stream failure.
      }
    }
    try {
      await fs.promises.unlink(tempFile)
    } catch {
      // The temporary file may not exist or may already have been renamed.
    }
    throw error
  }
}

const validateStreamedProductUpsert = async ({ filePath, candidate, categories, productCount }) => {
  const writtenCategories = await readRawCategoriesStreaming(filePath)
  if (JSON.stringify(writtenCategories) !== JSON.stringify(categories)) {
    throw new Error('Streamed product update changed catalog categories. Existing catalog was not modified.')
  }

  let validatedProductCount = 0
  let candidateMatches = 0

  for await (const { value: product } of createCatalogArrayStream('products', filePath)) {
    validatedProductCount += 1
    if (String(product?.id ?? '') === candidate.id) {
      candidateMatches += 1
      if (JSON.stringify(product) !== JSON.stringify(candidate)) {
        throw new Error('Streamed product update validation failed. Existing catalog was not modified.')
      }
    }
  }

  if (validatedProductCount !== productCount || candidateMatches !== 1) {
    throw new Error('Streamed catalog validation failed. Existing catalog was not modified.')
  }
}

const writeProductUpsertStreaming = async ({ candidate, existingProductId, categories, sourceVersion }) => {
  const tempFile = path.join(
    path.dirname(catalogFile),
    `.${path.basename(catalogFile)}.${process.pid}.${Date.now()}.${atomicWriteCounter += 1}.tmp`,
  )
  let fileHandle = null
  let output = null

  try {
    fileHandle = await fs.promises.open(tempFile, 'wx')
    output = fs.createWriteStream(tempFile, {
      fd: fileHandle.fd,
      autoClose: false,
      encoding: 'utf8',
    })

    const serializedCategories = JSON.stringify(categories, null, 2).replaceAll('\n', '\n  ')
    await writeStreamChunk(output, `{\n  "categories": ${serializedCategories},\n  "products": [`)
    let sourceProductCount = 0
    let writtenProductCount = 0
    let targetMatches = 0

    const writeProduct = async (product) => {
      const serializedProduct = JSON.stringify(product, null, 2).replaceAll('\n', '\n    ')
      await writeStreamChunk(output, `${writtenProductCount === 0 ? '\n' : ',\n'}    ${serializedProduct}`)
      writtenProductCount += 1
    }

    if (!existingProductId) {
      await writeProduct(candidate)
    }

    for await (const { value: product } of createCatalogArrayStream('products')) {
      sourceProductCount += 1
      const isTarget = String(product?.id ?? '') === candidate.id
      if (isTarget) {
        targetMatches += 1
      }
      await writeProduct(existingProductId && isTarget ? candidate : product)
    }

    const expectedTargetMatches = existingProductId ? 1 : 0
    if (targetMatches !== expectedTargetMatches) {
      throw new Error('Product was not found uniquely in the stored catalog. Existing catalog was not modified.')
    }

    const expectedProductCount = sourceProductCount + (existingProductId ? 0 : 1)
    if (writtenProductCount !== expectedProductCount) {
      throw new Error('Streamed product count validation failed. Existing catalog was not modified.')
    }

    await writeStreamChunk(output, '\n  ]\n}\n')
    output.end()
    await finished(output)
    output = null
    await fileHandle.sync()
    await fileHandle.close()
    fileHandle = null

    await validateStreamedProductUpsert({
      filePath: tempFile,
      candidate,
      categories,
      productCount: writtenProductCount,
    })

    const currentVersion = await fs.promises.stat(catalogFile)
    if (!isSameFileVersion(sourceVersion, currentVersion)) {
      throw new Error('Catalog changed during product update. Existing catalog was not modified; retry the update.')
    }

    await fs.promises.rename(tempFile, catalogFile)
    return writtenProductCount
  } catch (error) {
    if (output) {
      output.destroy()
      try {
        await finished(output)
      } catch {
        // The original stream error is reported below.
      }
    }
    if (fileHandle) {
      try {
        await fileHandle.close()
      } catch {
        // The descriptor may already be closed after a stream failure.
      }
    }
    try {
      await fs.promises.unlink(tempFile)
    } catch {
      // The temporary file may not exist or may already have been renamed.
    }
    throw error
  }
}

const queueCategoryUpdate = (operation) => {
  const result = categoryUpdateQueue.then(operation, operation)
  categoryUpdateQueue = result.catch(() => undefined)
  return result
}

const rememberCatalog = (catalog) => {
  try {
    catalogCache = catalog
    catalogCacheMtimeMs = fs.statSync(catalogFile).mtimeMs
    publicCatalogCache = null
    publicCatalogCacheMtimeMs = null
  } catch {
    catalogCache = catalog
    catalogCacheMtimeMs = null
    publicCatalogCache = null
    publicCatalogCacheMtimeMs = null
  }
  return catalog
}

const getCachedCatalog = () => {
  if (!catalogCache || catalogCacheMtimeMs === null) {
    return null
  }

  try {
    const stats = fs.statSync(catalogFile)
    if (stats.mtimeMs === catalogCacheMtimeMs) {
      return catalogCache
    }
  } catch {
    return null
  }

  return null
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
  const parentId = slugify(category?.parentId ?? '') || undefined

  return {
    id: slug,
    slug,
    nameFi,
    nameEn,
    parentId,
  }
}

const normalizeCategories = (rawCategories) => {
  const normalizedCategories =
    Array.isArray(rawCategories) && rawCategories.length > 0
      ? rawCategories.map(normalizeCategory)
      : fallbackCatalog.categories.map(normalizeCategory)

  if (!normalizedCategories.some((item) => item.id === 'muut')) {
    normalizedCategories.push(normalizeCategory({ id: 'muut', nameFi: 'Muut', nameEn: 'Other' }))
  }

  const categoryMap = new Map(normalizedCategories.map((item) => [item.id, item]))
  return normalizedCategories.map((category) => {
    const parent = category.parentId ? categoryMap.get(category.parentId) : null
    const validParent = category.id !== 'muut' && parent && parent.id !== category.id && !parent.parentId
    return {
      ...category,
      parentId: validParent ? parent.id : undefined,
    }
  })
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
  const categories = normalizeCategories(catalog?.categories)

  const products = []
  for (const rawProduct of Array.isArray(catalog?.products) ? catalog.products : []) {
    const normalized = normalizeProduct(rawProduct, categories, products)
    if (normalized.name && normalized.sku) {
      products.push(normalized)
    }
  }

  return { categories, products }
}

const readCatalogJsonFromDisk = () => {
  try {
    const rawCategories = []
    readJsonArrayItemsSync(catalogFile, 'categories', (category) => rawCategories.push(category))
    const categories = normalizeCategories(rawCategories)
    const products = []
    readJsonArrayItemsSync(catalogFile, 'products', (rawProduct) => {
      const normalized = normalizeProduct(rawProduct, categories, products)
      if (normalized.name && normalized.sku) {
        products.push(normalized)
      }
    })
    return { categories, products }
  } catch (error) {
    console.error(`[catalog] Failed to read ${catalogFile}. Existing catalog was not modified.`, error)
    throw error
  }
}

export const ensureCatalogStore = () => {
  ensureDataDir()

  if (!fs.existsSync(catalogFile)) {
    const seed = fs.existsSync(seedFile) ? normalizeCatalog(readJson(seedFile)) : normalizeCatalog(fallbackCatalog)
    writeJsonAtomic(catalogFile, seed)
    return rememberCatalog(seed)
  }

  try {
    return rememberCatalog(readCatalogJsonFromDisk())
  } catch (error) {
    throw new Error('Catalog could not be read. No catalog data was written.', { cause: error })
  }
}

export const readCatalog = () => {
  const cached = getCachedCatalog()
  if (cached) {
    return cached
  }

  return ensureCatalogStore()
}

export const updateProductCategory = (productId, categoryId) =>
  queueCategoryUpdate(async () => {
    const catalog = readCatalog()
    const normalizedProductId = String(productId ?? '').trim()
    const normalizedCategoryId = String(categoryId ?? '').trim()

    if (!catalog.categories.some((category) => category.id === normalizedCategoryId)) {
      throw new Error('Category not found')
    }
    if (!catalog.products.some((product) => product.id === normalizedProductId)) {
      return null
    }

    const sourceVersion = await fs.promises.stat(catalogFile)
    const rawCategories = await readRawCategoriesStreaming()
    const updatedAt = new Date().toISOString()
    await writeCategoryUpdateStreaming({
      productId: normalizedProductId,
      categoryId: normalizedCategoryId,
      updatedAt,
      categories: rawCategories,
      sourceVersion,
    })

    const nextCatalog = rememberCatalog({
      categories: catalog.categories,
      products: catalog.products.map((product) =>
        product.id === normalizedProductId
          ? {
              ...product,
              category: normalizedCategoryId,
              updatedAt,
            }
          : product,
      ),
    })
    return {
      catalog: nextCatalog,
      product: nextCatalog.products.find((product) => product.id === normalizedProductId) ?? null,
    }
  })

export const upsertProduct = (input) =>
  queueCategoryUpdate(async () => {
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
      catalog.products,
    )
    const sourceVersion = await fs.promises.stat(catalogFile)

    await writeProductUpsertStreaming({
      candidate,
      existingProductId: existing?.id ?? null,
      categories: catalog.categories,
      sourceVersion,
    })

    const nextProducts = existing
      ? catalog.products.map((item) => (item.id === existing.id ? candidate : item))
      : [candidate, ...catalog.products]

    return rememberCatalog({
      categories: catalog.categories,
      products: nextProducts,
    })
  })

export const deleteProduct = (productId) =>
  queueCategoryUpdate(async () => {
    const catalog = readCatalog()
    const normalizedProductId = String(productId ?? '').trim()
    if (!catalog.products.some((item) => item.id === normalizedProductId)) {
      return catalog
    }

    const sourceVersion = await fs.promises.stat(catalogFile)
    await writeCatalogStreaming({
      categories: catalog.categories,
      sourceVersion,
      transformProduct: (product) => (String(product?.id ?? '') === normalizedProductId ? null : product),
    })

    return rememberCatalog({
      categories: catalog.categories,
      products: catalog.products.filter((item) => item.id !== normalizedProductId),
    })
  })

export const addCategory = (input) =>
  queueCategoryUpdate(async () => {
    const catalog = readCatalog()
    const normalized = normalizeCategory(input)
    const normalizedNameFi = normalized.nameFi.toLocaleLowerCase('fi')
    const normalizedNameEn = normalized.nameEn.toLocaleLowerCase('en')

    if (
      catalog.categories.some(
        (item) =>
          item.nameFi.toLocaleLowerCase('fi') === normalizedNameFi ||
          item.nameEn.toLocaleLowerCase('en') === normalizedNameEn,
      )
    ) {
      return catalog
    }

    const uniqueSlug = ensureUniqueSlug(normalized.slug, catalog.categories)
    const parent = normalized.parentId
      ? catalog.categories.find((item) => item.id === normalized.parentId && !item.parentId)
      : null
    const category = {
      ...normalized,
      id: uniqueSlug,
      slug: uniqueSlug,
      parentId: parent?.id,
    }

    const nextCategories = [...catalog.categories]
    const fallbackIndex = nextCategories.findIndex((item) => item.id === 'muut')

    if (fallbackIndex >= 0) {
      nextCategories.splice(fallbackIndex, 0, category)
    } else {
      nextCategories.push(category)
    }

    const sourceVersion = await fs.promises.stat(catalogFile)
    await writeCatalogStreaming({ categories: nextCategories, sourceVersion })
    return rememberCatalog({ categories: nextCategories, products: catalog.products })
  })

export const deleteCategory = (categoryId) =>
  queueCategoryUpdate(async () => {
    const catalog = readCatalog()
    if (catalog.categories.some((item) => item.parentId === categoryId)) {
      return catalog
    }

    const nextCategories = catalog.categories.filter((item) => item.id !== categoryId)
    const safeCategories = nextCategories.some((item) => item.id === 'muut')
      ? nextCategories
      : [...nextCategories, normalizeCategory({ id: 'muut', nameFi: 'Muut', nameEn: 'Other' })]
    const updatedAt = new Date().toISOString()
    const sourceVersion = await fs.promises.stat(catalogFile)

    await writeCatalogStreaming({
      categories: safeCategories,
      sourceVersion,
      transformProduct: (product) =>
        product?.category === categoryId ? { ...product, category: 'muut', updatedAt } : product,
    })

    return rememberCatalog({
      categories: safeCategories,
      products: catalog.products.map((item) =>
        item.category === categoryId ? { ...item, category: 'muut', updatedAt } : item,
      ),
    })
  })

export const updateCategory = (categoryId, input) =>
  queueCategoryUpdate(async () => {
    const catalog = readCatalog()
    const currentCategory = catalog.categories.find((item) => item.id === categoryId)
    const nameFi = repairText(input?.nameFi).trim()
    const nameEn = repairText(input?.nameEn ?? nameFi).trim()

    if (!currentCategory || !nameFi || !nameEn) {
      return catalog
    }

    const hasParentId = Object.prototype.hasOwnProperty.call(input ?? {}, 'parentId')
    const requestedParentId = hasParentId ? slugify(input?.parentId ?? '') || undefined : currentCategory.parentId
    const hasChildren = catalog.categories.some((item) => item.parentId === categoryId)
    const parent = requestedParentId && !hasChildren
      ? catalog.categories.find((item) => item.id === requestedParentId && item.id !== categoryId && !item.parentId)
      : null
    const parentId = categoryId === 'muut' ? undefined : parent?.id

    const nextCategories = catalog.categories.map((item) =>
      item.id === categoryId
        ? {
            ...item,
            nameFi,
            nameEn,
            parentId,
          }
        : item,
    )

    const sourceVersion = await fs.promises.stat(catalogFile)
    await writeCatalogStreaming({ categories: nextCategories, sourceVersion })
    return rememberCatalog({ categories: nextCategories, products: catalog.products })
  })

export const reorderCategories = (orderedIds) =>
  queueCategoryUpdate(async () => {
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

    const sourceVersion = await fs.promises.stat(catalogFile)
    await writeCatalogStreaming({ categories: nextCategories, sourceVersion })
    return rememberCatalog({ categories: nextCategories, products: catalog.products })
  })

export const getProductBySlug = (slug) => readCatalog().products.find((item) => item.slug === slug) ?? null

export const getCategoryById = (id) => readCatalog().categories.find((item) => item.id === id) ?? null

export const getCatalogFilePath = () => catalogFile

const getPublicImageUrl = (product, imageIndex, imageValue) => {
  const raw = String(imageValue ?? '').trim()
  if (!inlineImagePattern.test(raw)) {
    return raw
  }

  const mediaPath = `/media/product/${encodeURIComponent(product.slug ?? product.id ?? 'tuote')}/${imageIndex}`
  const version = String(product.updatedAt ?? '').trim()
  return version ? `${mediaPath}?v=${encodeURIComponent(version)}` : mediaPath
}

const toPublicProduct = (product) => {
  const rawImages = Array.isArray(product.images) && product.images.length > 0 ? product.images : [product.image]
  const publicImages = rawImages.map((image, index) => getPublicImageUrl(product, index, image))

  return {
    ...product,
    image: publicImages[0],
    images: publicImages,
  }
}

export const readPublicCatalog = () => {
  const catalog = readCatalog()
  if (publicCatalogCache && publicCatalogCacheMtimeMs === catalogCacheMtimeMs) {
    return publicCatalogCache
  }

  const publicCatalog = {
    categories: catalog.categories,
    products: catalog.products.map(toPublicProduct),
  }

  publicCatalogCache = publicCatalog
  publicCatalogCacheMtimeMs = catalogCacheMtimeMs

  return publicCatalog
}

export const getProductMediaAsset = (slug, imageIndex = 0) => {
  const product = getProductBySlug(slug)
  if (!product) {
    return null
  }

  const images = Array.isArray(product.images) && product.images.length > 0 ? product.images : [product.image]
  const rawImage = String(images[imageIndex] ?? images[0] ?? '').trim()
  const match = rawImage.match(inlineImagePattern)

  if (!match) {
    return null
  }

  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  }
}
