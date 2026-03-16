import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '..', 'dist')
const manifestFile = path.join(distDir, '.vite', 'manifest.json')

const homeMeta = {
  title: 'Suomen Paperitukku – WC-paperit ja saniteettitarvikkeet yrityksille',
  description: 'Suomen Paperitukku toimittaa wc-paperit, käsipaperit ja saniteettitarvikkeet yrityksille nopeasti ja edullisesti koko Suomeen.',
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

const getEntryAssets = () => {
  const manifest = readManifest()
  const entry = manifest?.['index.html'] ?? manifest?.['src/main.tsx']
  if (!entry) {
    return { script: null, css: [] }
  }
  return {
    script: entry.file ? `/${entry.file}` : null,
    css: Array.isArray(entry.css) ? entry.css.map((item) => `/${item}`) : [],
  }
}

const jsonScript = (value) =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')

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

const stripTags = (value) => String(value ?? '').replace(/<[^>]*>/g, '').trim()

const productSeo = (siteUrl, product, category) => {
  const canonical = absoluteUrl(siteUrl, `/tuote/${product.slug}`)
  const title = product.seoTitle || `${product.name} | Suomen Paperitukku`
  const description = stripTags(product.metaDescription || product.description || homeMeta.description)
  const image = absoluteUrl(siteUrl, `/og/product/${product.slug}.svg`)
  const keywords = Array.isArray(product.searchKeywords) ? product.searchKeywords.join(', ') : ''

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
      price: Number(product.price ?? 0).toFixed(2),
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

  const featuredProducts = catalog.products.slice(0, 8).map((product, index) => ({
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
    name: 'Suosittuja tuotteita',
    itemListElement: featuredProducts,
  }

  return [organization, website, itemList]
}

const getProductAlt = (product) => `${product.name} yrityksille`

const renderHomeMarkup = ({ catalog }) => {
  const productCards = catalog.products.slice(0, 8)
  const categories = catalog.categories.filter((item) => item.id !== 'muut')

  return `
    <div class="page">
      <header class="top">
        <a class="brand" href="/" aria-label="Suomen Paperitukku etusivu">
          <img src="/brand-logo.png" alt="Suomen Paperitukku logo" />
        </a>
        <nav class="nav" aria-label="P\u00E4\u00E4navigaatio">
          <a class="nav-button" href="/#categories">Kategoriat</a>
          <a class="nav-button" href="/#products">Tuotteet</a>
          <a class="nav-button" href="/#contact">Yhteystiedot</a>
        </nav>
      </header>
      <main class="main">
        <section class="hero" id="home">
          <h1>Suomen Paperitukku</h1>
          <p>Suomen Paperitukku toimittaa wc-paperit, käsipaperit ja saniteettitarvikkeet yrityksille nopeasti ja edullisesti koko Suomeen.</p>
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

        <section class="section products-section" id="products">
          <div class="products-header">
            <div>
              <h2>Tuotteet</h2>
              <p class="muted">WC-paperit, käsipaperit ja saniteettitarvikkeet yrityksille nopeasti koko Suomeen.</p>
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
                          <span class="muted">${formatPrice(Number(product.price) * 1.255)} € (sis. alv)</span>
                          <span class="price-top">${formatPrice(product.price)} ${escapeHtml(product.priceUnit)} (alv 0%)</span>
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
          <p class="muted">Tarvitsetko tarjouksen tai isomman erän? Ota yhteyttä Suomen Paperitukkuun.</p>
          <div class="contact-layout">
            <div class="contact-info">
              <div class="contact-info-card">
                <strong>Sähköposti</strong>
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
          <p>Säynetie 16, 01490 Vantaa</p>
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
  return `${css}\n${script}`
}

const renderProductMarkup = ({ product, category, related }) => {
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
        <nav class="nav" aria-label="P\u00E4\u00E4navigaatio">
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
              <p class="muted">${escapeHtml(product.description)}</p>
              <div class="price-block">
                <span class="muted">${formatPrice(Number(product.price) * 1.255)} € (sis. alv)</span>
                <span class="price-top">${formatPrice(product.price)} ${escapeHtml(product.priceUnit)} (alv 0%)</span>
                ${product.unitNote ? `<span class="muted">${escapeHtml(product.unitNote)}</span>` : ''}
              </div>
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
          <p>Säynetie 16, 01490 Vantaa</p>
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
