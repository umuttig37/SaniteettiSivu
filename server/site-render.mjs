import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '..', 'dist')
const distIndexFile = path.join(distDir, 'index.html')
const manifestFile = path.join(distDir, '.vite', 'manifest.json')
const fontsStylesheetHref =
  'https://fonts.googleapis.com/css2?family=Literata:wght@600;700&family=Manrope:wght@400;500;600;700&display=swap'

let manifestCache
let builtIndexAssetsCache
let entryAssetsCache

const repairText = (value) =>
  String(value ?? '')
    .replaceAll('\u00C3\u00A4', 'ä')
    .replaceAll('\u00C3\u00B6', 'ö')
    .replaceAll('\u00C3\u00A5', 'å')
    .replaceAll('\u00C3\u201E', 'Ä')
    .replaceAll('\u00C3\u2013', 'Ö')
    .replaceAll('\u00C3\u2026', 'Å')
    .replaceAll('\u00C2\u00AE', '®')
    .replaceAll('\u00C2\u00B7', '·')
    .replaceAll('\u00E2\u201A\u00AC', '€')
    .replaceAll('\u00E2\u20AC\u201C', '–')
    .replaceAll('\u00E2\u20AC\u00A2', '•')
    .replaceAll('\u00E2\u20AC\u00A6', '…')
    .replaceAll('S?ynetie', 'Säynetie')

const homeMeta = {
  title: 'Suomen Paperitukku – Käsi- ja wc-paperit sekä saniteettitarvikkeet yrityksille',
  description:
    'Suomen Paperitukku toimittaa käsipaperit, WC-paperit ja saniteettitarvikkeet yrityksille nopeasti ja edullisesti koko Suomeen. | Suomen Paperitukku',
}

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const jsonScript = (value) =>
  JSON.stringify(value).replace(/</g, '\u003c').replace(/>/g, '\u003e')

const readManifest = () => {
  if (manifestCache !== undefined) {
    return manifestCache
  }

  if (!fs.existsSync(manifestFile)) {
    manifestCache = null
    return manifestCache
  }

  manifestCache = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  return manifestCache
}

const readBuiltIndexAssets = () => {
  if (builtIndexAssetsCache) {
    return builtIndexAssetsCache
  }

  if (!fs.existsSync(distIndexFile)) {
    builtIndexAssetsCache = { script: null, css: [], assets: [] }
    return builtIndexAssetsCache
  }

  const html = fs.readFileSync(distIndexFile, 'utf8')
  const scriptMatch = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i)
  const cssMatches = Array.from(html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/gi))

  builtIndexAssetsCache = {
    script: scriptMatch?.[1] ?? null,
    css: cssMatches.map((match) => match[1]),
    assets: [],
  }

  return builtIndexAssetsCache
}

const getEntryAssets = () => {
  if (entryAssetsCache) {
    return entryAssetsCache
  }

  const manifest = readManifest()
  const entry = manifest?.['index.html'] ?? manifest?.['src/main.tsx']

  if (entry) {
    entryAssetsCache = {
      script: entry.file ? `/${entry.file}` : null,
      css: Array.isArray(entry.css) ? entry.css.map((item) => `/${item}`) : [],
      assets: Array.isArray(entry.assets) ? entry.assets.map((item) => `/${item}`) : [],
    }
    return entryAssetsCache
  }

  entryAssetsCache = readBuiltIndexAssets()
  return entryAssetsCache
}

const getManifestAssetPath = (key) => {
  const manifest = readManifest()
  const entry = manifest?.[key]
  return entry?.file ? `/${entry.file}` : null
}

const absoluteUrl = (siteUrl, target) => {
  if (!target) {
    return siteUrl
  }

  if (/^https?:\/\//i.test(target)) {
    return target
  }

  return new URL(target, siteUrl).toString()
}

const stripTags = (value) => repairText(String(value ?? '').replace(/<[^>]*>/g, '').trim())

const formatPrice = (value) =>
  new Intl.NumberFormat('fi-FI', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0))

const getPriceUnitSuffix = (priceUnit, vatNote = '(alv 0%)') => {
  const suffix = repairText(priceUnit ?? '')
    .replace(/^€\s*/u, '')
    .trim()

  return suffix ? `${suffix} ${vatNote}` : vatNote
}

const compareFeaturedPriority = (a, b) => {
  const aFeatured = Boolean(a?.featured)
  const bFeatured = Boolean(b?.featured)

  if (aFeatured !== bFeatured) {
    return aFeatured ? -1 : 1
  }

  if (aFeatured && bFeatured) {
    const rankDiff = Number(a?.featuredRank ?? 999) - Number(b?.featuredRank ?? 999)
    if (rankDiff !== 0) {
      return rankDiff
    }
  }

  return repairText(a?.name ?? '').localeCompare(repairText(b?.name ?? ''), 'fi')
}

const getFeaturedProducts = (products, limit = 12) =>
  [...products]
    .filter((item) => item?.featured)
    .sort(compareFeaturedPriority)
    .slice(0, limit)

const getProductAlt = (product) => `${repairText(product?.name ?? '')} yrityksille`

const knownProductBrands = [
  'Tork',
  'Katrin',
  'Kiilto',
  'Vileda',
  'TASKI',
  'Bioska',
  'BioBag',
  'Nilfisk',
  'Abena',
  'Erisan',
  'TECcare',
  'Oxivir',
  'Comfort',
  'Glade',
  'Mr Muscle',
  'Sun',
]

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const getProductBrand = (product) => {
  const name = repairText(product?.name ?? '')
  return knownProductBrands.find((brand) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(brand)}([^a-z0-9]|$)`, 'iu').test(name)) ?? null
}

const getProductSeoTitle = (product) => {
  const name = repairText(product?.name ?? '').trim()
  const storedTitle = repairText(product?.seoTitle ?? '').trim()

  return storedTitle.toLocaleLowerCase('fi').startsWith(name.toLocaleLowerCase('fi'))
    ? storedTitle
    : `${name} | Suomen Paperitukku`
}

const reservedCategoryPaths = new Set([
  'api',
  'assets',
  'brand-logo.png',
  'ehdot',
  'favicon.svg',
  'kassa',
  'kategoria',
  'media',
  'og',
  'ostoskori',
  'products',
  'robots.txt',
  'sitemap.xml',
  'tili',
  'tuote',
  'vite.svg',
])

export const getCategoryPath = (category) => {
  const slug = String(category?.slug ?? category?.id ?? '').trim()
  if (!slug) {
    return '/'
  }
  const encodedSlug = encodeURIComponent(slug)
  return reservedCategoryPaths.has(slug) ? `/kategoria/${encodedSlug}` : `/${encodedSlug}`
}

const getCategoryDescription = (category, parentCategory = null) => {
  const name = repairText(category?.nameFi ?? 'Tuotteet')
  const parentContext = parentCategory
    ? ` osana ${repairText(parentCategory.nameFi)}-valikoimaa`
    : ''
  return `${name} yrityksille kilpailukykyiseen hintaan${parentContext}. Tilaa tuotteet Suomen Paperitukusta toimitettuna ympäri Suomen.`
}

const getCategorySeo = (siteUrl, category, parentCategory = null) => {
  const canonical = absoluteUrl(siteUrl, getCategoryPath(category))
  const breadcrumbItems = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Etusivu',
      item: absoluteUrl(siteUrl, '/'),
    },
  ]

  if (parentCategory) {
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: breadcrumbItems.length + 1,
      name: repairText(parentCategory.nameFi),
      item: absoluteUrl(siteUrl, getCategoryPath(parentCategory)),
    })
  }

  breadcrumbItems.push({
    '@type': 'ListItem',
    position: breadcrumbItems.length + 1,
    name: repairText(category.nameFi),
    item: canonical,
  })

  return {
    title: `${repairText(category.nameFi)} yrityksille | Suomen Paperitukku`,
    description: getCategoryDescription(category, parentCategory),
    canonical,
    image: absoluteUrl(siteUrl, '/brand-logo.png'),
    type: 'website',
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbItems,
      },
    ],
    preloadImages: [],
  }
}

const extractUnitLabel = (priceUnit) => {
  const unit = repairText(priceUnit ?? '')
    .replace(/€/g, '')
    .split('/')
    .pop()
    ?.trim()
    .replace(/^\(|\)$/g, '')

  if (unit) {
    return unit.charAt(0).toUpperCase() + unit.slice(1)
  }

  return 'Kpl'
}

const getDisplayOptionGroups = (product) => {
  const groups = Array.isArray(product?.optionGroups) ? product.optionGroups : []

  if (groups.length > 0) {
    return groups
  }

  if (!product) {
    return []
  }

  return [
    {
      id: 'default-unit',
      name: 'Yksikkö',
      values: [
        {
          id: 'default-unit-value',
          label: extractUnitLabel(product.priceUnit),
          detail: '1',
          price: Number(product.price ?? 0),
        },
      ],
    },
  ]
}

const getDefaultSelectedOptionPrice = (product) => {
  const groups = getDisplayOptionGroups(product)

  for (const group of groups) {
    const firstWithPrice = Array.isArray(group?.values) ? group.values.find((value) => Number.isFinite(Number(value?.price))) : null
    if (firstWithPrice) {
      return Number(firstWithPrice.price)
    }
  }

  return Number(product?.price ?? 0)
}

const formatOptionValueMeta = (groupName, value, priceUnit) => {
  const isUnitGroup = /yksikk|unit/i.test(String(groupName ?? ''))
  const parts = []

  if (value?.detail) {
    parts.push(escapeHtml(value.detail))
  }

  if (Number.isFinite(Number(value?.price)) && (!isUnitGroup || !value?.detail)) {
    parts.push(`${formatPrice(Number(value.price))} ${escapeHtml(priceUnit)}`)
  }

  return parts.join(' &bull; ')
}

const getOptionMetaHeader = (groupName) => (/yksikk|unit/i.test(String(groupName ?? '')) ? 'Määrä' : 'Lisätieto')

const productSeo = (siteUrl, product, category) => {
  const canonical = absoluteUrl(siteUrl, `/tuote/${product.slug}`)
  const title = getProductSeoTitle(product)
  const description = stripTags(product.metaDescription || product.description || homeMeta.description)
  const image = absoluteUrl(siteUrl, `/og/product/${product.slug}.svg`)
  const keywords = Array.isArray(product.searchKeywords) ? repairText(product.searchKeywords.join(', ')) : ''
  const effectivePrice = getDefaultSelectedOptionPrice(product)
  const brand = getProductBrand(product)

  const breadcrumbData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Etusivu',
        item: absoluteUrl(siteUrl, '/'),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: repairText(category?.nameFi ?? 'Tuotteet'),
        item: absoluteUrl(siteUrl, category ? getCategoryPath(category) : '/'),
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: repairText(product.name),
        item: canonical,
      },
    ],
  }

  const productData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: repairText(product.name),
    description,
    sku: repairText(product.sku),
    image: [absoluteUrl(siteUrl, product.images?.[0] ?? product.image)],
    category: repairText(category?.nameFi ?? product.category),
    keywords: Array.isArray(product.searchKeywords) ? repairText(product.searchKeywords.join(', ')) : undefined,
    ...(brand
      ? {
          brand: {
            '@type': 'Brand',
            name: brand,
          },
        }
      : {}),
    offers: {
      '@type': 'Offer',
      url: canonical,
      priceCurrency: 'EUR',
      price: Number(effectivePrice ?? 0).toFixed(2),
      availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: {
        '@type': 'Organization',
        name: 'Suomen Paperitukku',
      },
    },
  }

  return {
    title,
    description,
    canonical,
    image,
    keywords,
    structuredData: [breadcrumbData, productData],
    preloadImages: [product.images?.[0] ?? product.image].filter(Boolean),
    type: 'product',
  }
}

const buildHomeStructuredData = (siteUrl, catalog) => {
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Suomen Paperitukku',
    url: siteUrl,
    logo: absoluteUrl(siteUrl, '/brand-logo.png'),
    email: 'info@suomenpaperitukku.fi',
    telephone: '+358449782446',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Säynetie 16',
      postalCode: '01490',
      addressLocality: 'Vantaa',
      addressCountry: 'FI',
    },
  }

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Suomen Paperitukku',
    url: siteUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${siteUrl}/?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }

  const homeProducts = getFeaturedProducts(catalog.products, 12)
  const itemListProducts =
    homeProducts.length > 0 ? homeProducts : [...catalog.products].sort(compareFeaturedPriority).slice(0, 12)

  const featuredProducts = itemListProducts.map((product, index) => {
    const brand = getProductBrand(product)
    return {
      '@type': 'ListItem',
      position: index + 1,
      url: absoluteUrl(siteUrl, `/tuote/${product.slug}`),
      item: {
        '@type': 'Product',
        name: repairText(product.name),
        image: absoluteUrl(siteUrl, product.images?.[0] ?? product.image),
        description: repairText(product.metaDescription || product.description),
        sku: repairText(product.sku),
        ...(brand
          ? {
              brand: {
                '@type': 'Brand',
                name: brand,
              },
            }
          : {}),
        offers: {
          '@type': 'Offer',
          priceCurrency: 'EUR',
          price: Number(product.price ?? 0).toFixed(2),
          availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          url: absoluteUrl(siteUrl, `/tuote/${product.slug}`),
        },
      },
    }
  })

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: homeProducts.length > 0 ? 'Suosittelemme juuri nyt' : 'Suosittuja tuotteita',
    itemListElement: featuredProducts,
  }

  return [organization, website, itemList]
}

const renderOptionGroupsMarkup = (product) => {
  const groups = getDisplayOptionGroups(product)

  if (groups.length === 0) {
    return ''
  }

  return `
    <div class="product-options">
      ${groups
        .map(
          (group) => `
            <div class="product-option-group">
              <div class="product-option-group-head">
                <strong>${escapeHtml(group.name)}</strong>
                ${group.values.some((value) => value.detail || value.price !== undefined) ? `<span class="muted small">${getOptionMetaHeader(group.name)}</span>` : ''}
              </div>
              <div class="product-option-list">
                ${group.values
                  .map(
                    (value, index) => `
                      <label class="product-option-row ${index === 0 ? 'active' : ''}">
                        <span class="product-option-main">
                          <input type="radio" ${index === 0 ? 'checked' : ''} disabled />
                          <span>${escapeHtml(value.label)}</span>
                        </span>
                        <span class="muted">${formatOptionValueMeta(group.name, value, product.priceUnit)}</span>
                      </label>
                    `,
                  )
                  .join('')}
              </div>
            </div>
          `,
        )
        .join('')}
    </div>
  `
}

const getCategoryProductIds = (catalog, category) => {
  if (!category) {
    return null
  }
  if (category.parentId) {
    return new Set([category.id])
  }

  return new Set([
    category.id,
    ...catalog.categories.filter((item) => item.parentId === category.id).map((item) => item.id),
  ])
}

const renderHomeMarkup = ({ catalog, activeCategory = null }) => {
  const featuredCards = getFeaturedProducts(catalog.products, 12)
  const categoryMap = new Map(catalog.categories.map((item) => [item.id, item]))
  const categories = catalog.categories.filter((item) => item.id !== 'muut' && !item.parentId)
  const activeMainCategory = activeCategory?.parentId ? categoryMap.get(activeCategory.parentId) : activeCategory
  const activeSubcategories = activeMainCategory
    ? catalog.categories.filter((item) => item.parentId === activeMainCategory.id)
    : []
  const activeCategoryIds = getCategoryProductIds(catalog, activeCategory)
  const productCards = [...catalog.products]
    .filter((product) => !activeCategoryIds || activeCategoryIds.has(product.category))
    .sort(compareFeaturedPriority)
    .slice(0, 36)
  const categoryCounts = catalog.products.reduce((acc, product) => {
    acc[product.category] = (acc[product.category] ?? 0) + 1
    const parentId = categoryMap.get(product.category)?.parentId
    if (parentId) {
      acc[parentId] = (acc[parentId] ?? 0) + 1
    }
    return acc
  }, {})

  return `
    <div class="page">
      <header class="top">
        <a class="brand" href="/" aria-label="Suomen Paperitukku etusivu">
          <img src="/brand-logo.png" alt="Suomen Paperitukku logo" decoding="async" fetchpriority="high" />
        </a>
        <nav class="nav" aria-label="Päänavigaatio">
          <a class="nav-button" href="/#categories">Kategoriat</a>
          <a class="nav-button" href="/#products">Tuotteet</a>
          <a class="nav-button header-contact-link" href="/#contact">Yhteystiedot</a>
        </nav>
      </header>
      <main class="main">
        <section class="hero" id="home">
          <h1>Tervetuloa Suomen Paperitukkuun</h1>
          <p>Suomen edullisimpia saniteettitarvikkeita laskulla?<br />Meilt&auml; mahdollista tilata helposti, nopeasti ja kilpailukykyisin hinnoin.</p>
        </section>

        <section class="section" id="categories">
          <h2>Kategoriat</h2>
          <div class="category-grid">
            ${categories
              .map(
                (category) => `
                  <a class="category-card ${activeMainCategory?.id === category.id ? 'active' : ''}" href="${getCategoryPath(category)}">
                    <strong>${escapeHtml(category.nameFi)}</strong>
                    <span class="muted">${categoryCounts[category.id] ?? 0}</span>
                  </a>
                `,
              )
              .join('')}
          </div>
          ${
            activeMainCategory && activeSubcategories.length > 0
              ? `
                <div class="subcategory-panel">
                  <span class="subcategory-title">Valitse Kategoria</span>
                  <div class="subcategory-list">
                    <a class="subcategory-button ${activeCategory?.id === activeMainCategory.id ? 'active' : ''}" href="${getCategoryPath(activeMainCategory)}">
                      Kaikki: ${escapeHtml(activeMainCategory.nameFi)}
                    </a>
                    ${activeSubcategories
                      .map(
                        (subcategory) => `
                          <a class="subcategory-button ${activeCategory?.id === subcategory.id ? 'active' : ''}" href="${getCategoryPath(subcategory)}">
                            ${escapeHtml(subcategory.nameFi)}
                          </a>
                        `,
                      )
                      .join('')}
                  </div>
                </div>
              `
              : ''
          }
        </section>

        ${
          featuredCards.length > 0
            ? `
              <section class="section featured-section">
                <div class="products-header">
                  <div>
                    <h2>Suosittelemme juuri nyt</h2>
                    <p class="muted">Tutustu ajankohtaisiin suosikkeihimme ja löydä parhaat tuotteet helposti.</p>
                  </div>
                </div>
                <div class="grid featured-grid home-featured-grid">
                  ${featuredCards
                    .map(
                      (product) => `
                        <article class="card product-card featured-card">
                          <a class="product-card-button" href="/tuote/${encodeURIComponent(product.slug)}">
                            <div class="product-link">
                              <img class="product-image" src="${escapeHtml(product.images?.[0] ?? product.image)}" alt="${escapeHtml(getProductAlt(product))}" loading="lazy" decoding="async" />
                              <h3 class="product-name">${escapeHtml(product.name)}</h3>
                            </div>
                            <div class="product-body">
                              <div class="availability">
                                <span class="status ${product.stock > 0 ? 'status-ok' : 'status-low'}">
                                  <span class="dot"></span> ${product.stock > 0 ? 'Varastossa' : 'Loppu'}
                                </span>
                              </div>
                              <div class="price-block">
                                <span class="muted">${formatPrice(Number(product.price) * 1.255)} € (sis. alv)</span>
                                <span class="price-top"><span class="price-main">${formatPrice(product.price)} €</span><span class="price-suffix">${escapeHtml(getPriceUnitSuffix(product.priceUnit))}</span></span>
                              </div>
                            </div>
                          </a>
                        </article>
                      `,
                    )
                    .join('')}
                </div>
              </section>
            `
            : ''
        }

        <section class="section products-section" id="products">
          <div class="products-header">
            <div>
              <h2>${escapeHtml(activeCategory?.nameFi ?? 'Tuotteet')}</h2>
              <p class="muted">Maksu laskulla</p>
              <p class="muted shipping-note">Ilmainen toimitus yli 300 € tilauksille</p>
            </div>
          </div>
          <div class="grid products-grid">
            ${productCards
              .map(
                (product) => `
                  <article class="card product-card">
                    <a class="product-card-button" href="/tuote/${encodeURIComponent(product.slug)}">
                      <div class="product-link">
                        <img class="product-image" src="${escapeHtml(product.images?.[0] ?? product.image)}" alt="${escapeHtml(getProductAlt(product))}" loading="lazy" decoding="async" />
                        <h3 class="product-name">${escapeHtml(product.name)}</h3>
                      </div>
                      <div class="product-body">
                        <div class="availability">
                          <span class="status ${product.stock > 0 ? 'status-ok' : 'status-low'}">
                            <span class="dot"></span> ${product.stock > 0 ? 'Varastossa' : 'Loppu'}
                          </span>
                        </div>
                        <div class="price-block">
                          <span class="muted">${formatPrice(Number(product.price) * 1.255)} € (sis. alv)</span>
                          <span class="price-top"><span class="price-main">${formatPrice(product.price)} €</span><span class="price-suffix">${escapeHtml(getPriceUnitSuffix(product.priceUnit))}</span></span>
                        </div>
                      </div>
                    </a>
                  </article>
                `,
              )
              .join('')}
          </div>
        </section>

        <section class="section delivery-area" aria-labelledby="delivery-area-title">
          <div class="delivery-area-copy">
            <span class="delivery-area-kicker">Toimitusalue</span>
            <h2 id="delivery-area-title">Toimitamme yrityksille ympäri Suomen</h2>
            <p>Palvelemme yritysasiakkaita koko Suomessa. Tilaa työpaikan paperi-, hygienia- ja siivoustuotteet suoraan Suomen Paperitukusta.</p>
          </div>
        </section>

        <section class="section contact" id="contact">
          <h2>Yhteystiedot</h2>
          <p class="muted">Tarvitsetko tarjouksen tai isomman erän? Ota yhteyttä Suomen Paperitukkuun.</p>
          <div class="contact-layout">
            <div class="contact-info">
              <div class="contact-info-card">
                <strong>Sähköposti</strong>
                <a href="mailto:info@suomenpaperitukku.fi">info@suomenpaperitukku.fi</a>
              </div>
              <div class="contact-info-card">
                <strong>Puhelin</strong>
                <a href="tel:+358449782446">+358 44 978 2446</a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer class="footer">
        <div>
          <strong>Suomen Paperitukku</strong>
          <p>Asiakaspalvelu</p>
          <p>+358 44 978 2446</p>
          <p>info@suomenpaperitukku.fi</p>
        </div>
        <div class="footer-center">
          <p>&copy; 2026 Suomen Paperitukku - Kastamonu Tmi</p>
        </div>
        <div class="footer-meta">
          <p>3590057-8</p>
          <p><a class="footer-text-link" href="/ehdot">Tilaus- ja toimitusehdot</a></p>
        </div>
      </footer>
    </div>
  `
}

const renderHead = ({ siteUrl, meta }) => {
  const canonical = meta.canonical ?? siteUrl
  const image = meta.image ?? absoluteUrl(siteUrl, '/brand-logo.png')
  const robots = meta.robots ?? 'index,follow,max-image-preview:large'
  const structuredData = Array.isArray(meta.structuredData) ? meta.structuredData : []
  const preloadImages = Array.isArray(meta.preloadImages) ? meta.preloadImages.filter(Boolean) : []

  return `
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="${fontsStylesheetHref}" />
    ${preloadImages.map((href) => `<link rel="preload" as="image" href="${escapeHtml(href)}" />`).join('\n')}
    <title>${escapeHtml(meta.title)}</title>
    <meta name="description" content="${escapeHtml(meta.description)}" />
    <meta name="robots" content="${escapeHtml(robots)}" />
    ${meta.keywords ? `<meta name="keywords" content="${escapeHtml(meta.keywords)}" />` : ''}
    <meta property="og:type" content="${escapeHtml(meta.type ?? 'website')}" />
    <meta property="og:locale" content="fi_FI" />
    <meta property="og:site_name" content="Suomen Paperitukku" />
    <meta property="og:title" content="${escapeHtml(meta.title)}" />
    <meta property="og:description" content="${escapeHtml(meta.description)}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(meta.title)}" />
    <meta name="twitter:description" content="${escapeHtml(meta.description)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />
    <meta name="twitter:url" content="${escapeHtml(canonical)}" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="shortcut icon" href="/favicon.svg" />
    ${structuredData.length > 0 ? `<script type="application/ld+json" data-seo="structured-data">${jsonScript(structuredData)}</script>` : ''}
  `
}

const renderAssetTags = () => {
  const assets = getEntryAssets()
  const css = assets.css.map((href) => `<link rel="stylesheet" crossorigin href="${href}" />`).join('\n')
  const script = assets.script ? `<script type="module" crossorigin src="${assets.script}"></script>` : ''

  return `${css}
${script}`
}

const renderProductMarkup = ({ product, category, related }) => {
  const effectivePrice = getDefaultSelectedOptionPrice(product)
  const breadcrumbs = `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/">Etusivu</a>
      <span aria-hidden="true">/</span>
      <a href="${category ? getCategoryPath(category) : '/'}">${escapeHtml(category?.nameFi ?? 'Tuotteet')}</a>
      <span aria-hidden="true">/</span>
      <span>${escapeHtml(product.name)}</span>
    </nav>
  `

  const relatedMarkup =
    related.length > 0
      ? `
        <section class="related">
          <h3>Ehdotetut tuotteet</h3>
          <div class="grid related-grid">
            ${related
              .map(
                (item) => `
                  <a class="card related-card" href="/tuote/${encodeURIComponent(item.slug)}">
                    <img class="product-image" src="${escapeHtml(item.images?.[0] ?? item.image)}" alt="${escapeHtml(getProductAlt(item))}" loading="lazy" decoding="async" />
                    <strong class="product-name">${escapeHtml(item.name)}</strong>
                  </a>
                `,
              )
              .join('')}
          </div>
        </section>
      `
      : ''

  return `
    <div class="page">
      <header class="top">
        <a class="brand" href="/" aria-label="Suomen Paperitukku etusivu">
          <img src="/brand-logo.png" alt="Suomen Paperitukku logo" decoding="async" fetchpriority="high" />
        </a>
        <nav class="nav" aria-label="Päänavigaatio">
          <a class="nav-button" href="/#products">Tuotteet</a>
          <a class="nav-button header-contact-link" href="/#contact">Yhteystiedot</a>
        </nav>
      </header>
      <main class="main">
        <section class="detail section" id="product-detail">
          ${breadcrumbs}
          <div class="detail-layout">
            <div class="detail-media">
              <div class="detail-image-wrap">
                <img class="detail-image" src="${escapeHtml(product.images?.[0] ?? product.image)}" alt="${escapeHtml(getProductAlt(product))}" decoding="async" fetchpriority="high" />
              </div>
            </div>
            <div class="detail-info">
              <h1>${escapeHtml(product.name)}</h1>
              <p class="muted detail-description">${escapeHtml(product.description)}</p>
              <div class="price-block">
                <span class="muted">${formatPrice(Number(effectivePrice) * 1.255)} € (sis. alv)</span>
                <span class="price-top"><span class="price-main">${formatPrice(effectivePrice)} €</span><span class="price-suffix">${escapeHtml(getPriceUnitSuffix(product.priceUnit))}</span></span>
                ${product.unitNote ? `<span class="muted">${escapeHtml(product.unitNote)}</span>` : ''}
              </div>
              ${renderOptionGroupsMarkup(product)}
              <p class="stock-note">${product.stock > 0 ? 'Varastossa' : 'Loppu'}</p>
              <div class="detail-seo-meta">
                <span>SKU ${escapeHtml(product.sku)}</span>
                <span>${escapeHtml(category?.nameFi ?? 'Tuotteet')}</span>
              </div>
              <a class="primary product-detail-link" href="/">Avaa tuote kaupassa</a>
            </div>
          </div>
          ${relatedMarkup}
        </section>
      </main>
      <footer class="footer">
        <div>
          <strong>Suomen Paperitukku</strong>
          <p>Asiakaspalvelu</p>
          <p>+358 44 978 2446</p>
          <p>info@suomenpaperitukku.fi</p>
        </div>
        <div class="footer-center">
          <p>&copy; 2026 Suomen Paperitukku - Kastamonu Tmi</p>
        </div>
        <div class="footer-meta">
          <p>3590057-8</p>
          <p><a class="footer-text-link" href="/ehdot">Tilaus- ja toimitusehdot</a></p>
        </div>
      </footer>
    </div>
  `
}

const renderCategoryProductCards = (products) =>
  products
    .map(
      (product) => `
        <article class="card product-card">
          <a class="product-card-button" href="/tuote/${encodeURIComponent(product.slug)}">
            <div class="product-link">
              <img class="product-image" src="${escapeHtml(product.images?.[0] ?? product.image)}" alt="${escapeHtml(getProductAlt(product))}" loading="lazy" decoding="async" />
              <h2 class="product-name">${escapeHtml(product.name)}</h2>
            </div>
            <div class="product-body">
              <div class="availability">
                <span class="status ${product.stock > 0 ? 'status-ok' : 'status-low'}">
                  <span class="dot"></span> ${product.stock > 0 ? 'Varastossa' : 'Loppu'}
                </span>
              </div>
              <div class="price-block">
                <span class="muted">${formatPrice(Number(product.price) * 1.255)} € (sis. alv)</span>
                <span class="price-top"><span class="price-main">${formatPrice(product.price)} €</span><span class="price-suffix">${escapeHtml(getPriceUnitSuffix(product.priceUnit))}</span></span>
              </div>
            </div>
          </a>
        </article>
      `,
    )
    .join('')

const renderCategoryMarkup = ({ catalog, category }) => {
  const categoryMap = new Map(catalog.categories.map((item) => [item.id, item]))
  const parentCategory = category.parentId ? categoryMap.get(category.parentId) ?? null : null
  const subcategories = category.parentId
    ? []
    : catalog.categories.filter((item) => item.parentId === category.id)
  const categoryIds = getCategoryProductIds(catalog, category)
  const categoryProducts = [...catalog.products]
    .filter((product) => categoryIds.has(product.category))
    .sort(compareFeaturedPriority)

  return `
    <div class="page">
      <header class="top">
        <a class="brand" href="/" aria-label="Suomen Paperitukku etusivu">
          <img src="/brand-logo.png" alt="Suomen Paperitukku logo" decoding="async" fetchpriority="high" />
        </a>
        <nav class="nav" aria-label="Päänavigaatio">
          <a class="nav-button" href="/#categories">Kategoriat</a>
          <a class="nav-button" href="/#products">Tuotteet</a>
          <a class="nav-button header-contact-link" href="/#contact">Yhteystiedot</a>
        </nav>
      </header>
      <main class="main">
        <section class="section category-landing">
          <nav class="breadcrumbs" aria-label="Breadcrumb">
            <a href="/">Etusivu</a>
            <span aria-hidden="true">/</span>
            ${
              parentCategory
                ? `<a href="${getCategoryPath(parentCategory)}">${escapeHtml(parentCategory.nameFi)}</a><span aria-hidden="true">/</span>`
                : ''
            }
            <span>${escapeHtml(category.nameFi)}</span>
          </nav>
          <div class="category-landing-copy">
            <span class="category-landing-kicker">Tuotekategoria</span>
            <h1>${escapeHtml(category.nameFi)}</h1>
            <p>${escapeHtml(getCategoryDescription(category, parentCategory))}</p>
          </div>
          ${
            subcategories.length > 0
              ? `<div class="subcategory-panel">
                  <span class="subcategory-title">Valitse Kategoria</span>
                  <div class="subcategory-list">
                    ${subcategories
                      .map(
                        (subcategory) => `<a class="subcategory-button" href="${getCategoryPath(subcategory)}">${escapeHtml(subcategory.nameFi)}</a>`,
                      )
                      .join('')}
                  </div>
                </div>`
              : ''
          }
        </section>
        <section class="section products-section category-products" id="products">
          <div class="products-header">
            <div>
              <h2>Tuotteet</h2>
              <p class="muted">${categoryProducts.length} tuotetta kategoriassa ${escapeHtml(category.nameFi)}</p>
            </div>
          </div>
          <div class="grid products-grid">
            ${renderCategoryProductCards(categoryProducts)}
          </div>
        </section>
      </main>
      <footer class="footer">
        <div>
          <strong>Suomen Paperitukku</strong>
          <p>Asiakaspalvelu</p>
          <p>+358 44 978 2446</p>
          <p>info@suomenpaperitukku.fi</p>
        </div>
        <div class="footer-center">
          <p>&copy; 2026 Suomen Paperitukku - Kastamonu Tmi</p>
        </div>
        <div class="footer-meta">
          <p>3590057-8</p>
          <p><a class="footer-text-link" href="/ehdot">Tilaus- ja toimitusehdot</a></p>
        </div>
      </footer>
    </div>
  `
}

const getUtilityPageMeta = (siteUrl, route) => {
  switch (route?.type) {
    case 'cart':
      return {
        title: 'Ostoskori | Suomen Paperitukku',
        description: 'Tarkista ostoskorin sisältö ja siirry kassalle.',
        canonical: absoluteUrl(siteUrl, '/ostoskori'),
      }
    case 'checkout':
      return {
        title: 'Kassa | Suomen Paperitukku',
        description: route?.guestCheckout
          ? 'Viimeistele korttimaksu ilman rekisteröitymistä.'
          : 'Viimeistele tilaus yritystilillä.',
        canonical: absoluteUrl(siteUrl, route?.guestCheckout ? '/kassa?guest=1' : '/kassa'),
      }
    case 'auth':
      return {
        title: route?.authMode === 'register' ? 'Rekisteröidy | Suomen Paperitukku' : 'Kirjaudu | Suomen Paperitukku',
        description: 'Luo yritystili tai kirjaudu sisään tilausta varten.',
        canonical: absoluteUrl(siteUrl, '/tili'),
      }
    case 'terms':
      return {
        title: 'Tilaus- ja toimitusehdot | Suomen Paperitukku',
        description: 'Suomen Paperitukun verkkokaupan myynti-, toimitus- ja maksuehdot.',
        canonical: absoluteUrl(siteUrl, '/ehdot'),
      }
    case 'paytrail-return':
      return {
        title: 'Maksun vahvistus | Suomen Paperitukku',
        description: 'Korttimaksun vahvistus.',
        canonical: absoluteUrl(siteUrl, route?.paytrailResult === 'cancel' ? '/kassa/paytrail/cancel' : '/kassa/paytrail/success'),
      }
    default:
      return null
  }
}

const renderUtilityMarkup = (route) => {
  if (!route?.type) {
    return ''
  }

  let title = 'Suomen Paperitukku'
  let description = 'Ladataan sivua...'

  if (route.type === 'cart') {
    title = 'Ostoskori'
    description = 'Ladataan ostoskoria...'
  } else if (route.type === 'checkout') {
    title = 'Kassa'
    description = route.guestCheckout ? 'Valmistellaan korttimaksua...' : 'Valmistellaan kassaa...'
  } else if (route.type === 'auth') {
    title = route.authMode === 'register' ? 'Rekisteröidy' : 'Kirjaudu'
    description = 'Ladataan asiakastiliä...'
  } else if (route.type === 'terms') {
    title = 'Tilaus- ja toimitusehdot'
    description = 'Ladataan ehtoja...'
  } else if (route.type === 'paytrail-return') {
    title = 'Maksun vahvistus'
    description = 'Vahvistetaan korttimaksun tila...'
  }

  return `
    <div class="page">
      <main class="main">
        <section class="section utility-page">
          <div class="utility-page-head">
            <div>
              <h1>${escapeHtml(title)}</h1>
              <p class="muted">${escapeHtml(description)}</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  `
}

const renderDocument = ({ siteUrl, meta, initialState, ssrMarkup = '' }) => {
  const rootAttributes = ssrMarkup ? ' data-booting="true"' : ''

  return `<!doctype html>
<html lang="fi">
  <head>
    ${renderHead({ siteUrl, meta })}
    ${renderAssetTags()}
  </head>
  <body>
    ${ssrMarkup ? `<div id="ssr-root">${ssrMarkup}</div>` : ''}
    <div id="root"${rootAttributes}></div>
    <script>
      window.__INITIAL_CATALOG__ = ${jsonScript(initialState.catalog)};
      window.__INITIAL_ROUTE__ = ${jsonScript(initialState.route)};
      window.__SITE_URL__ = ${jsonScript(siteUrl)};
    </script>
  </body>
</html>`
}

export const renderSpaPage = ({ siteUrl, catalog, route = null }) => {
  const utilityMeta = getUtilityPageMeta(siteUrl, route)
  const activeCategory =
    route?.type === 'home' && route.categorySlug
      ? catalog.categories.find((category) => category.slug === route.categorySlug || category.id === route.categorySlug) ?? null
      : null
  const parentCategory = activeCategory?.parentId
    ? catalog.categories.find((category) => category.id === activeCategory.parentId) ?? null
    : null
  const categoryMeta = activeCategory ? getCategorySeo(siteUrl, activeCategory, parentCategory) : null
  const categoryProductIds = activeCategory ? getCategoryProductIds(catalog, activeCategory) : null
  const categoryProducts = categoryProductIds
    ? catalog.products.filter((product) => categoryProductIds.has(product.category))
    : []
  const homeProducts = Array.from(
    new Map(
      [...getFeaturedProducts(catalog.products, 12), ...[...catalog.products].sort(compareFeaturedPriority).slice(0, 36)].map((product) => [
        product.id,
        product,
      ]),
    ).values(),
  )
  const initialCatalog = {
    categories: catalog.categories,
    products: utilityMeta ? [] : activeCategory ? categoryProducts : homeProducts,
  }

  return renderDocument({
    siteUrl,
    meta: utilityMeta
      ? {
          ...utilityMeta,
          type: 'website',
          image: absoluteUrl(siteUrl, '/brand-logo.png'),
          structuredData: [],
          preloadImages: [],
        }
      : categoryMeta ?? {
          ...homeMeta,
          type: 'website',
          canonical: absoluteUrl(siteUrl, '/'),
          image: absoluteUrl(siteUrl, '/brand-logo.png'),
          structuredData: buildHomeStructuredData(siteUrl, catalog),
          preloadImages: [getManifestAssetPath('src/assets/hero-background.webp')].filter(Boolean),
        },
    initialState: { catalog: initialCatalog, route },
    ssrMarkup: utilityMeta
      ? renderUtilityMarkup(route)
      : activeCategory
        ? renderCategoryMarkup({ catalog, category: activeCategory })
        : renderHomeMarkup({ catalog }),
  })
}

export const renderProductPage = ({ siteUrl, catalog, product, category, related }) =>
  renderDocument({
    siteUrl,
    meta: productSeo(siteUrl, product, category),
    initialState: {
      catalog: {
        categories: catalog.categories,
        products: [product, ...related],
      },
      route: { type: 'product', slug: product.slug },
    },
    ssrMarkup: renderProductMarkup({ product, category, related }),
  })

export const renderProductOgSvg = ({ product, category }) => {
  const title = escapeHtml(product.name)
  const categoryName = escapeHtml(category?.nameFi ?? 'Tuote')
  const price = `${formatPrice(product.price)} EUR`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f4f8ff" />
      <stop offset="100%" stop-color="#e9f2ff" />
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" rx="36" />
  <rect x="72" y="74" width="1056" height="482" rx="34" fill="#ffffff" stroke="#dbe4f1" stroke-width="4" />
  <text x="120" y="170" font-family="Arial, sans-serif" font-size="32" fill="#1d4ed8">${categoryName}</text>
  <text x="120" y="258" font-family="Arial, sans-serif" font-size="58" font-weight="700" fill="#0f172a">${title}</text>
  <text x="120" y="356" font-family="Arial, sans-serif" font-size="34" fill="#475569">SKU ${escapeHtml(product.sku)}</text>
  <text x="120" y="430" font-family="Arial, sans-serif" font-size="46" font-weight="700" fill="#1d4ed8">${escapeHtml(price)}</text>
  <text x="120" y="510" font-family="Arial, sans-serif" font-size="30" fill="#334155">Suomen Paperitukku</text>
  <circle cx="940" cy="252" r="130" fill="#eef4ff" />
  <circle cx="940" cy="252" r="74" fill="#dbe7ff" />
  <path d="M1018 170c74 12 132 74 132 150 0 82-66 148-148 148" fill="none" stroke="#1d4ed8" stroke-width="18" stroke-linecap="round" />
</svg>`
}

export const renderSitemapXml = ({ siteUrl, catalog }) => {
  const latestCatalogUpdate = catalog.products
    .map((product) => product.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1)
  const urls = [
    {
      loc: absoluteUrl(siteUrl, '/'),
      lastmod: latestCatalogUpdate,
    },
    ...catalog.categories.map((category) => ({
      loc: absoluteUrl(siteUrl, getCategoryPath(category)),
      lastmod:
        catalog.products
          .filter((product) => getCategoryProductIds(catalog, category).has(product.category))
          .map((product) => product.updatedAt)
          .filter(Boolean)
          .sort()
          .at(-1),
    })),
    ...catalog.products.map((product) => ({
      loc: absoluteUrl(siteUrl, `/tuote/${product.slug}`),
      lastmod: product.updatedAt,
    })),
  ]

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (item) => `  <url>
    <loc>${escapeHtml(item.loc)}</loc>
    ${item.lastmod ? `<lastmod>${escapeHtml(item.lastmod)}</lastmod>` : ''}
  </url>`,
  )
  .join('\n')}
</urlset>`
}

export const renderRobotsTxt = ({ siteUrl }) => `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${absoluteUrl(siteUrl, '/sitemap.xml')}
`
