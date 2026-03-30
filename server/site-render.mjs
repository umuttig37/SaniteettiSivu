import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '..', 'dist')
const distIndexFile = path.join(distDir, 'index.html')
const manifestFile = path.join(distDir, '.vite', 'manifest.json')

const homeMeta = {
  title: 'Suomen Paperitukku â KÃ¤si- ja wc-paperit sekÃ¤ saniteettitarvikkeet yrityksille',
  description: 'Suomen Paperitukku toimittaa kÃ¤sipaperit, WC-paperit ja saniteettitarvikkeet yrityksille nopeasti ja edullisesti koko Suomeen. | Suomen Paperitukku',
}

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const readManifest = () => {
  if (!fs.existsSync(manifestFile)) {
    return null
  }
  return JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
}

const readBuiltIndexAssets = () => {
  if (!fs.existsSync(distIndexFile)) {
    return { script: null, css: [] }
  }

  const html = fs.readFileSync(distIndexFile, 'utf8')
  const scriptMatch = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i)
  const cssMatches = Array.from(html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/gi))

  return {
    script: scriptMatch?.[1] ?? null,
    css: cssMatches.map((match) => match[1]),
  }
}

const getEntryAssets = () => {
  const manifest = readManifest()
  const entry = manifest?.['index.html'] ?? manifest?.['src/main.tsx']
  if (entry) {
    return {
      script: entry.file ? `/${entry.file}` : null,
      css: Array.isArray(entry.css) ? entry.css.map((item) => `/${item}`) : [],
    }
  }
  return readBuiltIndexAssets()
}

const jsonScript = (value) =>
  JSON.stringify(value).replace(/</g, '\u003c').replace(/>/g, '\u003e')

const absoluteUrl = (siteUrl, target) => {
  if (!target) {
    return siteUrl
  }
  if (/^https?:\/\//i.test(target)) {
    return target
  }
  return new URL(target, siteUrl).toString()
}

const formatPrice = (value) =>
  new Intl.NumberFormat('fi-FI', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0))

const getPriceUnitSuffix = (priceUnit, vatNote = '(alv 0%)') => {
  const suffix = String(priceUnit ?? '')
    .replace(/^€\s*/u, '')
    .trim()

  return suffix ? `${suffix} ${vatNote}` : vatNote
}

const stripTags = (value) => String(value ?? '').replace(/<[^>]*>/g, '').trim()

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

  return String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'fi')
}

const getFeaturedProducts = (products, limit = 4) =>
  [...products]
    .filter((item) => item?.featured)
    .sort(compareFeaturedPriority)
    .slice(0, limit)

const productSeo = (siteUrl, product, category) => {
  const canonical = absoluteUrl(siteUrl, `/tuote/${product.slug}`)
  const title = product.seoTitle || `${product.name} | Suomen Paperitukku`
  const description = stripTags(product.metaDescription || product.description || homeMeta.description)
  const image = absoluteUrl(siteUrl, `/og/product/${product.slug}.svg`)
  const keywords = Array.isArray(product.searchKeywords) ? product.searchKeywords.join(', ') : ''
  const effectivePrice = getDefaultSelectedOptionPrice(product)

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
        name: category?.nameFi ?? 'Tuotteet',
        item: absoluteUrl(siteUrl, `/?category=${encodeURIComponent(category?.slug ?? '')}`),
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: product.name,
        item: canonical,
      },
    ],
  }

  const productData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description,
    sku: product.sku,
    image: [absoluteUrl(siteUrl, product.images?.[0] ?? product.image)],
    category: category?.nameFi ?? product.category,
    keywords: Array.isArray(product.searchKeywords) ? product.searchKeywords.join(', ') : undefined,
    brand: {
      '@type': 'Brand',
      name: 'Suomen Paperitukku',
    },
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
  }
}

const buildHomeStructuredData = (siteUrl, catalog) => {
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Suomen Paperitukku',
    url: siteUrl,
    logo: absoluteUrl(siteUrl, '/brand-logo.png'),
    email: 'suomenpaperitukku@gmail.com',
    telephone: '+358449782446',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'SÃ¤ynetie 16',
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

  const homeProducts = getFeaturedProducts(catalog.products, 8)
  const itemListProducts =
    homeProducts.length > 0 ? homeProducts : [...catalog.products].sort(compareFeaturedPriority).slice(0, 8)

  const featuredProducts = itemListProducts.map((product, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    url: absoluteUrl(siteUrl, `/tuote/${product.slug}`),
    item: {
      '@type': 'Product',
      name: product.name,
      image: absoluteUrl(siteUrl, product.images?.[0] ?? product.image),
      description: product.metaDescription || product.description,
      sku: product.sku,
      brand: {
        '@type': 'Brand',
        name: 'Suomen Paperitukku',
      },
      offers: {
        '@type': 'Offer',
        priceCurrency: 'EUR',
        price: Number(product.price ?? 0).toFixed(2),
        availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: absoluteUrl(siteUrl, `/tuote/${product.slug}`),
      },
    },
  }))

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: homeProducts.length > 0 ? 'Suosittelemme juuri nyt' : 'Suosittuja tuotteita',
    itemListElement: featuredProducts,
  }

  return [organization, website, itemList]
}

const getProductAlt = (product) => `${product.name} yrityksille`

const extractUnitLabel = (priceUnit) => {
  const unit = String(priceUnit ?? '')
    .replace(/â¬/g, '')
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
      name: 'YksikkÃ¶',
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

const renderHomeMarkup = ({ catalog }) => {
  const featuredCards = getFeaturedProducts(catalog.products, 4)
  const productCards = [...catalog.products].sort(compareFeaturedPriority).slice(0, 8)
  const categories = catalog.categories.filter((item) => item.id !== 'muut')

  return `
    <div class="page">
      <header class="top">
        <a class="brand" href="/" aria-label="Suomen Paperitukku etusivu">
          <img src="/brand-logo.png" alt="Suomen Paperitukku logo" />
        </a>
        <nav class="nav" aria-label="Päänavigaatio">
          <a class="nav-button" href="/#categories">Kategoriat</a>
          <a class="nav-button" href="/#products">Tuotteet</a>
          <a class="nav-button" href="/#contact">Yhteystiedot</a>
        </nav>
      </header>
      <main class="main">
        <section class="hero" id="home">
          <h1>Suomen Paperitukku</h1>
          <p>Suomen Paperitukku toimittaa kÃ¤si- ja wc-paperit, annostelijat ja saniteettitarvikkeet yrityksille nopeasti ja edullisesti koko Suomeen.</p>
        </section>

        <section class="section" id="categories">
          <h2>Kategoriat</h2>
          <div class="category-grid">
            ${categories
              .map(
                (category) => `
                  <a class="category-card" href="/?category=${encodeURIComponent(category.slug)}">
                    <strong>${escapeHtml(category.nameFi)}</strong>
                    <span class="muted">${catalog.products.filter((product) => product.category === category.id).length}</span>
                  </a>
                `,
              )
              .join('')}
          </div>
        </section>

        ${
          featuredCards.length > 0
            ? `
              <section class="section featured-section">
                <div class="products-header">
                  <div>
                    <h2>Suosittelemme juuri nyt</h2>
                    <p class="muted">Tutustu ajankohtaisiin suosikkeihimme ja lÃ¶ydÃ¤ parhaat tuotteet helposti.</p>
                  </div>
                </div>
                <div class="grid featured-grid">
                  ${featuredCards
                    .map(
                      (product) => `
                        <article class="card product-card featured-card">
                          <a class="product-card-button" href="/tuote/${encodeURIComponent(product.slug)}">
                            <div class="product-link">
                              <img class="product-image" src="${escapeHtml(product.images?.[0] ?? product.image)}" alt="${escapeHtml(getProductAlt(product))}" />
                              <h3 class="product-name">${escapeHtml(product.name)}</h3>
                            </div>
                            <div class="product-body">
                              <div class="availability">
                                <span class="status ${product.stock > 0 ? 'status-ok' : 'status-low'}">
                                  <span class="dot"></span> ${product.stock > 0 ? 'Varastossa' : 'Loppu'}
                                </span>
                              </div>
                              <div class="price-block">
                                <span class="muted">${formatPrice(Number(product.price) * 1.255)} â¬ (sis. alv)</span>
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
              <h2>Tuotteet</h2>
              <p class="muted">Toimitus arkipÃ¤ivÃ¤ssÃ¤</p>
              <p class="muted">Maksu laskulla 14 pv</p>
              <p class="muted shipping-note">Toimitus: 15 â¬ alle 300 â¬ tilauksille</p>
              <p class="muted shipping-note">Ilmainen toimitus yli 300 â¬ tilauksille</p>
            </div>
          </div>
          <div class="grid products-grid">
            ${productCards
              .map(
                (product) => `
                  <article class="card product-card">
                    <a class="product-card-button" href="/tuote/${encodeURIComponent(product.slug)}">
                      <div class="product-link">
                        <img class="product-image" src="${escapeHtml(product.images?.[0] ?? product.image)}" alt="${escapeHtml(getProductAlt(product))}" />
                        <h3 class="product-name">${escapeHtml(product.name)}</h3>
                      </div>
                      <div class="product-body">
                        <div class="availability">
                          <span class="status ${product.stock > 0 ? 'status-ok' : 'status-low'}">
                            <span class="dot"></span> ${product.stock > 0 ? 'Varastossa' : 'Loppu'}
                          </span>
                        </div>
                        <div class="price-block">
                          <span class="muted">${formatPrice(Number(product.price) * 1.255)} â¬ (sis. alv)</span>
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

        <section class="section contact" id="contact">
          <h2>Yhteystiedot</h2>
          <p class="muted">Tarvitsetko tarjouksen tai isomman erÃ¤n? Ota yhteyttÃ¤ Suomen Paperitukkuun.</p>
          <div class="contact-layout">
            <div class="contact-info">
              <div class="contact-info-card">
                <strong>SÃ¤hkÃ¶posti</strong>
                <a href="mailto:suomenpaperitukku@gmail.com">suomenpaperitukku@gmail.com</a>
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
          <p>suomenpaperitukku@gmail.com</p>
        </div>
        <div>
          <p>SÃ¤ynetie 16, 01490 Vantaa</p>
          <p>3590057-8</p>
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

  return `
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(meta.title)}</title>
    <meta name="description" content="${escapeHtml(meta.description)}" />
    <meta name="robots" content="${escapeHtml(robots)}" />
    ${meta.keywords ? `<meta name="keywords" content="${escapeHtml(meta.keywords)}" />` : ''}
    <meta property="og:type" content="${escapeHtml(meta.type ?? 'product')}" />
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
    ${structuredData
      .map(
        (item) =>
          `<script type="application/ld+json">${jsonScript(item)}</script>`,
      )
      .join('\n')}
  `
}

const renderAssetTags = () => {
  const assets = getEntryAssets()
  const css = assets.css.map((href) => `<link rel="stylesheet" href="${href}" />`).join('\n')
  const script = assets.script ? `<script type="module" src="${assets.script}"></script>` : ''
  return `${css}
${script}`
}

const renderProductMarkup = ({ product, category, related }) => {
  const effectivePrice = getDefaultSelectedOptionPrice(product)
  const breadcrumbs = `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/">Etusivu</a>
      <span aria-hidden="true">/</span>
      <a href="/?category=${encodeURIComponent(category?.slug ?? '')}">${escapeHtml(category?.nameFi ?? 'Tuotteet')}</a>
      <span aria-hidden="true">/</span>
      <span>${escapeHtml(product.name)}</span>
    </nav>
  `

  const relatedMarkup = related.length > 0
    ? `
      <section class="related">
        <h3>Ehdotetut tuotteet</h3>
        <div class="grid related-grid">
          ${related
            .map(
              (item) => `
                <a class="card related-card" href="/tuote/${encodeURIComponent(item.slug)}">
                  <img class="product-image" src="${escapeHtml(item.images?.[0] ?? item.image)}" alt="${escapeHtml(getProductAlt(item))}" />
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
          <img src="/brand-logo.png" alt="Suomen Paperitukku logo" />
        </a>
        <nav class="nav" aria-label="Päänavigaatio">
          <a class="nav-button" href="/#products">Tuotteet</a>
          <a class="nav-button" href="/#contact">Yhteystiedot</a>
        </nav>
      </header>
      <main class="main">
        <section class="detail section" id="product-detail">
          ${breadcrumbs}
          <div class="detail-shell">
            <div class="detail-media">
              <div class="detail-image-frame">
                <img class="detail-image active" src="${escapeHtml(product.images?.[0] ?? product.image)}" alt="${escapeHtml(getProductAlt(product))}" />
              </div>
            </div>
            <div class="detail-info">
              <h1>${escapeHtml(product.name)}</h1>
              <p class="muted detail-description">${escapeHtml(product.description)}</p>
              <div class="price-block">
                <span class="muted">${formatPrice(Number(effectivePrice) * 1.255)} â¬ (sis. alv)</span>
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
          <p>suomenpaperitukku@gmail.com</p>
        </div>
        <div>
          <p>SÃ¤ynetie 16, 01490 Vantaa</p>
          <p>3590057-8</p>
        </div>
      </footer>
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

export const renderSpaPage = ({ siteUrl, catalog, route = null }) =>
  renderDocument({
    siteUrl,
    meta: {
      ...homeMeta,
      type: 'website',
      canonical: absoluteUrl(siteUrl, '/'),
      image: absoluteUrl(siteUrl, '/brand-logo.png'),
      structuredData: buildHomeStructuredData(siteUrl, catalog),
    },
    initialState: { catalog, route },
    ssrMarkup: renderHomeMarkup({ catalog }),
  })

export const renderProductPage = ({ siteUrl, catalog, product, category, related }) =>
  renderDocument({
    siteUrl,
    meta: productSeo(siteUrl, product, category),
    initialState: {
      catalog,
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
  const urls = [
    {
      loc: absoluteUrl(siteUrl, '/'),
      lastmod: new Date().toISOString(),
    },
    ...catalog.products.map((product) => ({
      loc: absoluteUrl(siteUrl, `/tuote/${product.slug}`),
      lastmod: product.updatedAt ?? new Date().toISOString(),
    })),
  ]

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (item) => `  <url>
    <loc>${escapeHtml(item.loc)}</loc>
    <lastmod>${escapeHtml(item.lastmod)}</lastmod>
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
