const GOOGLE_NAMESPACE = 'http://base.google.com/ns/1.0'
const ARTIFICIAL_SPT_SKU_PATTERN = /^37[0-2]\d{2,3}$/
const GTIN_LENGTHS = new Set([8, 12, 13, 14])

const knownBrands = [
  ['vileda professional', 'Vileda Professional'],
  ['copy & print', 'Copy & Print'],
  ['soft care', 'Soft Care'],
  ['nord clean', 'Nord Clean'],
  ['kiilto pro', 'Kiilto Pro'],
  ['mr muscle', 'Mr Muscle'],
  ['scotch-brite', 'Scotch-Brite'],
  ['taskisum', 'TASKISUM'],
  ['diversey', 'Diversey'],
  ['comfort', 'Comfort'],
  ['desinfektol', 'Desinfektol'],
  ['easycare', 'Easycare'],
  ['hygicult', 'Hygicult'],
  ['cariness', 'Cariness'],
  ['careness', 'Careness'],
  ['fredman', 'Fredman'],
  ['kärcher', 'Kärcher'],
  ['karcher', 'Kärcher'],
  ['provisor', 'Provisor'],
  ['wc kukka', 'WC Kukka'],
  ['ecolab', 'Ecolab'],
  ['ecotex', 'Ecotex'],
  ['biomat', 'BIOMAT'],
  ['nilfisk', 'Nilfisk'],
  ['biobag', 'BioBag'],
  ['bioska', 'Bioska'],
  ['katrin', 'Katrin'],
  ['kiilto', 'Kiilto'],
  ['oxivir', 'Oxivir'],
  ['teccare', 'TECcare'],
  ['taski', 'TASKI'],
  ['vileda', 'Vileda'],
  ['abena', 'Abena'],
  ['erisan', 'Erisan'],
  ['glade', 'Glade'],
  ['kingfa', 'Kingfa'],
  ['mclean', 'Mclean'],
  ['lambi', 'Lambi'],
  ['nessu', 'Nessu'],
  ['serla', 'Serla'],
  ['swep', 'Swep'],
  ['tena', 'TENA'],
  ['heti', 'HETI'],
  ['clean', 'Clean'],
  ['step', 'STEP'],
  ['ykä', 'Ykä'],
  ['yka', 'Ykä'],
  ['kw', 'KW'],
  ['tork', 'Tork'],
  ['twister', 'Twister'],
  ['sini', 'SINI'],
  ['bliw', 'Bliw'],
  ['omo', 'Omo'],
  ['sun', 'Sun'],
  ['3m', '3M'],
  ['lv', 'LV'],
]

// Only exact product/package matches verified from manufacturer material are allowed here.
const verifiedIdentifierOverrides = new Map([
  [
    'tork-t8-smartone-wc-paperiannostelija-ruostumaton-teras',
    {
      mpn: '472054',
      source: 'https://www.torkglobal.com/gb/en/products/toilet-paper/dispensers',
      confidence: 'varma',
    },
  ],
  [
    'tork-v1-advanced-wc-istuimensuojapaperi-kertakayttoinen-5000-kpl',
    {
      mpn: '750160',
      gtin: '7310791005294',
      source: 'https://www.torkglobal.com/gb/en/product/restroom/toilet-seat-cleaners/toilet-seat-cleaner-covers/750160',
      confidence: 'varma',
    },
  ],
  [
    'tork-f1-kasvopyyheannostelija-seinalle-tai-poydalle-valkoinen',
    {
      mpn: '270023',
      source: 'https://www.torkglobal.com/ae/en/product/restroom/facial-tissues/facial-tissue-dispensers/270023',
      confidence: 'varma',
    },
  ],
  [
    'tork-f1-extra-soft-kasvopyyhe-erittain-pehmea-valkoinen-100-kpl',
    {
      mpn: '140280',
      source: 'https://www.torkglobal.com/pl/pl/products/lazienki',
      confidence: 'varma',
    },
  ],
  [
    'tork-w3-annostelija-laatikossa-oleville-teollisuus-ja-kuitukangaspyyhkeille',
    {
      mpn: '207210',
      source: 'https://www.torkglobal.com/gb/en/products/wiping-cleaning/wiping-cleaning-dispensers/wall-mounted-dispensers',
      confidence: 'varma',
    },
  ],
  [
    'tork-w2-performance-maxi-vetopyyheannostelija-turkoosi-valkoinen',
    {
      mpn: '653000',
      source: 'https://www.torkglobal.com/gb/en/products/wiping-cleaning/wiping-cleaning-dispensers/wall-mounted-dispensers',
      confidence: 'varma',
    },
  ],
  [
    'kiilto-pro-textile-liquid-pyykinpesuneste-5l-hajusteeton',
    {
      mpn: '63264',
      gtin: '6417964632644',
      source: 'https://www.kiilto.fi/tuote/kiilto-green-liquid-textile-wash/',
      confidence: 'varma',
    },
  ],
  [
    'kiilto-pro-remo-strip-vahanpoistoaine-5l',
    {
      mpn: '41075',
      gtin: '6417964410754',
      source: 'https://www.kiilto.fi/tuote/kiilto-remo-green/',
      confidence: 'varma',
    },
  ],
  [
    'kiilto-pro-sointu-spa-puhdistusaine-5l',
    {
      mpn: 'T7082.005',
      gtin: '6417964708257',
      source: 'https://www.kiilto.fi/tuote/kiilto-sointu-spa/',
      confidence: 'varma',
    },
  ],
  [
    'kiilto-pro-plusclean-yleispuhdistusaine-5l',
    {
      mpn: '41117',
      gtin: '6417964411171',
      source: 'https://www.kiilto.fi/tuote/kiilto-plusclean/',
      confidence: 'varma',
    },
  ],
  [
    'kiilto-pro-plusclean-yleispuhdistusaine-1l',
    {
      mpn: '41116',
      gtin: '6417964411164',
      source: 'https://www.kiilto.fi/tuote/kiilto-plusclean/',
      confidence: 'varma',
    },
  ],
  [
    'tork-t4-universal-wc-paperi-2-krs-38-30-metria-rulla-42rullaa-sakki',
    {
      mpn: '472246',
      source: 'https://www.torkglobal.com/fi/fi/product/wc-paperi/tayttopakkaukset/perinteinen-wc-paperi/472246',
      confidence: 'varma',
    },
  ],
  [
    'tork-t4-premium-soft-wc-paperi-3-krs-34-70metria-rulla-42rullaa-sakki',
    {
      mpn: '110317',
      source: 'https://www.siivous.fi/files/tuotekortit/Tork_110317_wc-paperi.pdf',
      confidence: 'varma',
    },
  ],
  [
    'tork-t4-advanced-wc-paperi-2-krs-35-metria-rulla-24-rulla-sakki',
    {
      mpn: '110284',
      source: 'https://www.torkglobal.com/fi/fi/product/wc-paperi/tayttopakkaukset/perinteinen-wc-paperi/110284',
      confidence: 'varma',
    },
  ],
  [
    'tork-t4-premium-extra-soft-wc-paperi-3-krs-18-8-metria-rulla-40-rullaa-sakki',
    {
      mpn: '472241',
      source: 'https://www.torkglobal.com/fi/fi/product/wc-paperi/tayttopakkaukset/perinteinen-wc-paperi/472241',
      confidence: 'varma',
    },
  ],
  [
    'katrin-plus-system-m-rullakasipyyhe-2-krs-valkoinen-6-rll',
    {
      mpn: '82537',
      source: 'https://www.metsagroup.com/fi/katrin/tuotteet/rullakasipyyhkeet/kasipyyherullat/',
      confidence: 'varma',
    },
  ],
  [
    'katrin-foam-soap-clean-vaahtosaippua-1000-ml-6-kpl',
    {
      mpn: '3136',
      gtin: '6414301003136',
      source: 'https://www.metsagroup.com/globalassets/katrin/ab-about-katrin-central/news-and-articles/katrins-clean-and-green-soaps/katrin_cleangreen_soaps_presentation_en_f.pdf',
      confidence: 'varma',
    },
  ],
  [
    'katrin-foam-soap-clean-vaahtosaippua-12-kpl-500ml',
    {
      mpn: '37780',
      gtin: '6414301037780',
      source: 'https://www.metsagroup.com/globalassets/katrin/ab-about-katrin-central/news-and-articles/katrins-clean-and-green-soaps/katrin_cleangreen_soaps_presentation_en_f.pdf',
      confidence: 'varma',
    },
  ],
  [
    'kasisaippua-annostelijaan-12x500ml-katrin-liquid-soap-clean',
    {
      mpn: '57870',
      gtin: '6414301057870',
      source: 'https://www.metsagroup.com/globalassets/katrin/ab-about-katrin-central/news-and-articles/katrins-clean-and-green-soaps/katrin_cleangreen_soaps_presentation_en_f.pdf',
      confidence: 'varma',
    },
  ],
  [
    'katrin-head-body-suihkusaippua-6x1l',
    {
      mpn: '47550',
      gtin: '6414301047550',
      source: 'https://www.metsagroup.com/globalassets/katrin/ab-about-katrin-central/news-and-articles/katrins-clean-and-green-soaps/katrin_cleangreen_soaps_presentation_en_f.pdf',
      confidence: 'varma',
    },
  ],
  [
    'katrin-plus-kasipyyhe-c-taitto-2-krs-valkoinen-1600-ark',
    {
      mpn: '92512',
      gtin: '6414301092512',
      source: 'https://www.metsagroup.com/katrin/products/paper-hand-towels-folded/c-fold-paper-towels/92512-katrin-plus-c-fold-paper-towels-100-sheets-2-ply/',
      confidence: 'varma',
    },
  ],
  [
    'katrin-plus-kasipyyhe-c-taitto-2-krs-valkoinen-16-pakettia',
    {
      mpn: '92512',
      gtin: '6414301092512',
      source: 'https://www.metsagroup.com/katrin/products/paper-hand-towels-folded/c-fold-paper-towels/92512-katrin-plus-c-fold-paper-towels-100-sheets-2-ply/',
      confidence: 'varma',
    },
  ],
  [
    'katrin-plus-non-stop-m-kasipyyhe-2-krs-z-taitto-2835-arkkia-21-pakettia',
    {
      mpn: '87181',
      source: 'https://www.metsagroup.com/globalassets/katrin/sv-katrin/katrin_product_catalogue_2024_no.pdf',
      confidence: 'varma',
    },
  ],
  [
    'katrin-plus-m-coreless-vetopyyhe-1-krs-valkoinen-280m-6-rullaa',
    {
      mpn: '475355',
      source: 'https://www.metsagroup.com/globalassets/katrin/campaigns/scd/hem---dk/katrin_product_catalogue_2025_dk.pdf',
      confidence: 'varma',
    },
  ],
  [
    'katrin-plus-system-684-wc-paperi-2-krs-36-rullaa',
    {
      mpn: '87365',
      gtin: '6414301087365',
      source: 'https://www.metsagroup.com/sv/katrin/produkter/toalettpapper/toapapper-for-dispensers/87365-katrin-plus-system-toalettpapper-2-lagers/',
      confidence: 'varma',
    },
  ],
  [
    'katrin-classic-gigant-s-2-wc-paperi-2-krs-200-metria-12-rullaa',
    {
      mpn: '106108',
      source: 'https://www.metsagroup.com/globalassets/katrin/sv-katrin/katrin_product_catalogue_2023_no.pdf',
      confidence: 'varma',
    },
  ],
  [
    'katrin-plus-s-coreless-vetopyyhe-1-krs-valkoinen-110-m-12-rullaa',
    {
      mpn: '475218',
      source: 'https://www.metsagroup.com/globalassets/katrin/campaigns/scd/hem---dk/katrin_product_catalogue_2025_dk.pdf',
      confidence: 'varma',
    },
  ],
])

const xmlEscape = (value) =>
  String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const absoluteUrl = (siteUrl, target) => {
  const base = String(siteUrl ?? '').replace(/\/+$/, '')
  const value = String(target ?? '').trim()
  if (/^https?:\/\//i.test(value)) {
    return value
  }
  return `${base}/${value.replace(/^\/+/, '')}`
}

const normalizeWhitespace = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()

const truncate = (value, limit) => {
  const text = normalizeWhitespace(value)
  return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
}

const getBrand = (product) => {
  const explicitBrand = normalizeWhitespace(product.brand)
  if (explicitBrand) {
    return explicitBrand
  }

  const haystack = `${product.name ?? ''} ${product.description ?? ''}`.toLocaleLowerCase('fi')
  return knownBrands.find(([needle]) => new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(haystack))?.[1] ?? null
}

export const isArtificialSptSku = (value) => ARTIFICIAL_SPT_SKU_PATTERN.test(String(value ?? '').trim())

export const isValidGtin = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!GTIN_LENGTHS.has(digits.length)) {
    return false
  }

  const checkDigit = Number(digits.at(-1))
  const body = digits.slice(0, -1)
  const sum = [...body]
    .reverse()
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === checkDigit
}

const extractLabeledGtin = (product) => {
  const text = `${product.name ?? ''}\n${product.description ?? ''}`
  const match = text.match(/\b(?:EAN|GTIN)(?:-?\d{1,2})?\s*:?\s*(\d{8}|\d{12,14})\b/i)
  return match && isValidGtin(match[1]) ? match[1] : null
}

const extractGtin = (product, verified) => {
  if (verified?.gtin && isValidGtin(verified.gtin)) {
    return verified.gtin
  }

  const sku = String(product.sku ?? '').trim()
  if (!isArtificialSptSku(sku) && /^\d{12,14}$/.test(sku) && isValidGtin(sku)) {
    return sku
  }

  return extractLabeledGtin(product)
}

const isPlausibleMpn = (value) => {
  const candidate = String(value ?? '').trim()
  if (!candidate || candidate.length > 50 || isArtificialSptSku(candidate) || isValidGtin(candidate)) {
    return false
  }
  if (/[/,]/.test(candidate) || /\s/.test(candidate)) {
    return false
  }
  if (/^\d+(?:[.,]\d+)?(?:ml|cl|dl|l|g|kg|mm|cm|m|kpl|rll|ark)$/i.test(candidate)) {
    return false
  }
  return /^(?=.*\d)[A-Z0-9]+(?:[.-][A-Z0-9]+)*$/i.test(candidate)
}

const extractNameMpn = (product) => {
  const name = normalizeWhitespace(product.name)
  const suffix = name.match(/\s(?:-|–|—)\s*([A-Z0-9]+(?:[.-][A-Z0-9]+)*)\s*$/i)?.[1]
  if (isPlausibleMpn(suffix)) {
    return suffix
  }

  const sku = String(product.sku ?? '').trim()
  if (!isPlausibleMpn(sku)) {
    return null
  }
  const escaped = sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`, 'i').test(name) ? sku : null
}

const extractLabeledMpn = (product) => {
  const text = `${product.name ?? ''}\n${product.description ?? ''}`
  const match = text.match(/\b(?:valmistajan\s+tuotenumero|tuotenumero|tuotekoodi|MPN)\s*:\s*([A-Z0-9]+(?:[.-][A-Z0-9]+)*)\b/i)
  return match && isPlausibleMpn(match[1]) ? match[1] : null
}

const getIdentifiers = (product) => {
  const verified = verifiedIdentifierOverrides.get(String(product.slug ?? '').trim())
  const brand = getBrand(product)
  const gtin = extractGtin(product, verified)
  const mpn = verified?.mpn ?? (brand ? extractNameMpn(product) ?? extractLabeledMpn(product) : null)

  return {
    brand,
    gtin,
    mpn: isPlausibleMpn(mpn) ? mpn : null,
    source: verified?.source ?? (mpn ? 'current catalog product name/description' : null),
    confidence: verified?.confidence ?? (mpn || gtin ? 'varma' : null),
  }
}

const buildDescription = (product) => {
  const description = normalizeWhitespace(product.description)
  if (description) {
    return truncate(description, 5000)
  }
  return truncate(`${product.name}. Tilaa Suomen Paperitukusta.`, 5000)
}

export const buildGoogleMerchantItems = ({ siteUrl, catalog }) => {
  const products = Array.isArray(catalog?.products)
    ? catalog.products.filter((product) => product.active !== false)
    : []

  return products.map((product) => {
    const identifiers = getIdentifiers(product)
    const image = String(product.image ?? product.images?.[0] ?? '').trim()
    const numericPrice = Number(product.price)
    return {
      id: String(product.id ?? product.slug ?? '').trim(),
      title: truncate(product.name, 150),
      description: buildDescription(product),
      link: absoluteUrl(siteUrl, `/tuote/${product.slug}`),
      imageLink: image ? absoluteUrl(siteUrl, image) : '',
      availability: Number(product.stock) > 0 ? 'in_stock' : 'out_of_stock',
      price: Number.isFinite(numericPrice) && numericPrice > 0 ? `${numericPrice.toFixed(2)} EUR` : '',
      condition: 'new',
      ...identifiers,
      product,
    }
  })
}

const optionalTag = (name, value) => (value ? `    <g:${name}>${xmlEscape(value)}</g:${name}>\n` : '')

export const renderGoogleMerchantXml = ({ siteUrl, catalog }) => {
  const items = buildGoogleMerchantItems({ siteUrl, catalog })
  const itemXml = items
    .map(
      (item) => `  <item>
    <g:id>${xmlEscape(item.id)}</g:id>
    <g:title>${xmlEscape(item.title)}</g:title>
    <g:description>${xmlEscape(item.description)}</g:description>
    <g:link>${xmlEscape(item.link)}</g:link>
    <g:image_link>${xmlEscape(item.imageLink)}</g:image_link>
    <g:availability>${item.availability}</g:availability>
    <g:price>${item.price}</g:price>
    <g:condition>${item.condition}</g:condition>
${optionalTag('brand', item.brand)}${optionalTag('gtin', item.gtin)}${optionalTag('mpn', item.mpn)}  </item>`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="${GOOGLE_NAMESPACE}" version="2.0">
<channel>
  <title>Suomen Paperitukku tuotefeedi</title>
  <link>${xmlEscape(absoluteUrl(siteUrl, '/'))}</link>
  <description>Suomen Paperitukun aktiiviset verkkokauppatuotteet</description>
${itemXml}
</channel>
</rss>`
}

export const auditGoogleMerchantCatalog = ({ siteUrl, catalog }) => {
  const items = buildGoogleMerchantItems({ siteUrl, catalog })
  const missingRequired = items
    .filter(
      (item) =>
        !item.id ||
        !item.title ||
        !item.description ||
        !/^https?:\/\//i.test(item.link) ||
        !/^https?:\/\//i.test(item.imageLink) ||
        !/^\d+\.\d{2} EUR$/.test(item.price) ||
        !['in_stock', 'out_of_stock'].includes(item.availability) ||
        item.condition !== 'new',
    )
    .map((item) => ({ id: item.id, name: item.product.name }))
  const artificialSkuProducts = items
    .filter((item) => isArtificialSptSku(item.product.sku))
    .map((item) => ({
      id: item.id,
      name: item.product.name,
      currentSku: item.product.sku,
      feedMpn: item.mpn,
      source: item.source,
      confidence: item.confidence,
    }))
  const verifiedFindings = items
    .filter((item) => verifiedIdentifierOverrides.has(String(item.product.slug ?? '').trim()))
    .map((item) => ({
      name: item.product.name,
      currentSku: item.product.sku,
      mpn: item.mpn,
      gtin: item.gtin,
      source: item.source,
      confidence: item.confidence,
    }))

  return {
    products: items.length,
    requiredFieldsComplete: items.length - missingRequired.length,
    withMpn: items.filter((item) => item.mpn).length,
    withGtin: items.filter((item) => item.gtin).length,
    withoutManufacturerIdentifier: items.filter((item) => !item.mpn && !item.gtin).length,
    withImage: items.filter((item) => /^https?:\/\//i.test(item.imageLink) && !item.imageLink.startsWith('data:')).length,
    missingRequired,
    missingManufacturerIdentifier: items
      .filter((item) => !item.mpn && !item.gtin)
      .map((item) => ({ id: item.id, name: item.product.name, currentSku: item.product.sku, brand: item.brand })),
    missingImage: items
      .filter((item) => !/^https?:\/\//i.test(item.imageLink) || item.imageLink.startsWith('data:'))
      .map((item) => ({ id: item.id, name: item.product.name, image: item.product.image })),
    artificialSkuProducts,
    verifiedFindings,
  }
}
