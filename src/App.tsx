import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import './App.css'
import brandLogo from './assets/paperitukkuLogo-removebg-preview.png'
import heroBgImage from './assets/hero-background.webp'

type Lang = 'fi' | 'en'

type ProductOptionValue = {
  id: string
  label: string
  detail?: string
  price?: number
}

type ProductOptionGroup = {
  id: string
  name: string
  values: ProductOptionValue[]
}

type SelectedProductOption = {
  groupId: string
  groupName: string
  valueId: string
  valueLabel: string
  valueDetail?: string
  valuePrice?: number
}

type CartLine = {
  id: string
  productId: string
  quantity: number
  selectedOptions: SelectedProductOption[]
}

type AdminOptionValueForm = {
  id: string
  label: string
  detail: string
  price: string
}

type AdminOptionGroupForm = {
  id: string
  name: string
  values: AdminOptionValueForm[]
  draftLabel: string
  draftDetail: string
  draftPrice: string
}

type Product = {
  id: string
  slug?: string
  name: string
  category: string
  price: number
  priceUnit: string
  unitNote?: string
  sku: string
  stock: number
  image: string
  images: string[]
  description: string
  seoTitle?: string
  metaDescription?: string
  searchKeywords?: string[]
  featured?: boolean
  featuredRank?: number
  optionGroups?: ProductOptionGroup[]
  createdAt?: string
  updatedAt?: string
}

type AdminProductForm = {
  id: string | null
  name: string
  sku: string
  category: string
  price: string
  priceUnit: string
  unitNote: string
  stock: string
  images: string[]
  description: string
  seoTitle: string
  metaDescription: string
  searchKeywords: string
  featured: boolean
  featuredRank: string
  optionGroups: AdminOptionGroupForm[]
}

type CheckoutForm = {
  company: string
  contact: string
  email: string
  phone: string
  address: string
  zip: string
  city: string
  billingCompany: string
  billingAddress: string
  notes: string
}

type CategoryDef = {
  id: string
  slug: string
  nameFi: string
  nameEn: string
}

type CatalogPayload = {
  products: Product[]
  categories: CategoryDef[]
}

type RouteState = {
  type: 'home' | 'product'
  slug: string | null
  categorySlug: string | null
  searchQuery: string | null
  legacyProductId: string | null
}

type CartToast = {
  id: number
  productName: string
  image: string
  quantity: number
  linePrice: number
  selectedOptionsText?: string
}

type FreeShippingToast = {
  id: number
  message: string
}

declare global {
  interface Window {
    __INITIAL_CATALOG__?: CatalogPayload
    __INITIAL_ROUTE__?: { type?: string; slug?: string } | null
    __SITE_URL__?: string
  }
}

type OrderStatus = 'new' | 'shipped'

type AdminOrderItem = {
  productId: string
  name: string
  quantity: number
  unitPrice: number
  priceUnit: string
  selectedOptions?: SelectedProductOption[]
}

type AdminOrder = {
  id: string
  lang?: Lang
  status: OrderStatus
  createdAt: string
  shippedAt: string | null
  customer: {
    company: string
    contact: string
    email: string
    phone: string
    address: string
    zip: string
    city: string
    billingCompany: string
    billingAddress: string
    notes: string
  }
  items: AdminOrderItem[]
  subtotal: number
  shipping: number
  total: number
}

const svgData = (label: string, color: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="300" viewBox="0 0 420 300">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${color}" />
      <stop offset="100%" stop-color="#ffffff" />
    </linearGradient>
  </defs>
  <rect width="420" height="300" rx="22" fill="url(#g)" />
  <rect x="28" y="28" width="120" height="120" rx="16" fill="#ffffff" opacity="0.9" />
  <rect x="168" y="60" width="200" height="36" rx="10" fill="#ffffff" opacity="0.92" />
  <rect x="168" y="110" width="160" height="22" rx="8" fill="#ffffff" opacity="0.8" />
  <text x="32" y="220" font-family="Manrope, Arial" font-size="26" fill="#1d2a44">${label}</text>
</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const productImages = {
  wc: svgData('WC-paperi', '#dbe8ff'),
  towel: svgData('Käsipyyhe', '#e7f7f0'),
  soap: svgData('Saippua', '#fff0d9'),
  roll: svgData('Rulla', '#f1e9ff'),
  spray: svgData('Suihke', '#e8f2ff'),
  trash: svgData('Jätesäkki', '#fff1f1'),
} as const


const fixMojibake = (value: string) => {
  const pairs: Array<[string, string]> = [
    ['\u00C3\u0192\u00C2\u00A4', '\u00E4'],
    ['\u00C3\u0192\u00C2\u00B6', '\u00F6'],
    ['\u00C3\u0192\u00C2\u00A5', '\u00E5'],
    ['\u00C3\u0192\u00E2\u20AC\u017E', '\u00C4'],
    ['\u00C3\u0192\u00E2\u20AC\u201C', '\u00D6'],
    ['\u00C3\u0192\u00E2\u20AC\u00A6', '\u00C5'],
    ['\u00C3\u00A4', '\u00E4'],
    ['\u00C3\u00B6', '\u00F6'],
    ['\u00C3\u00A5', '\u00E5'],
    ['\u00C3\u201E', '\u00C4'],
    ['\u00C3\u2013', '\u00D6'],
    ['\u00C3\u2026', '\u00C5'],
    ['\u00C3\u2014', '\u00D7'],
    ['\u00C3\u201A\u00C2\u00B7', '\u00B7'],
    ['\u00C2\u00B7', '\u00B7'],
    ['\u00E2\u201A\u00AC', '\u20AC'],
    ['\u00E2\u20AC\u201C', '\u2013'],
    ['\u00E2\u20AC\u201D', '\u2014'],
  ]

  return pairs.reduce((current, [fromEscaped, toEscaped]) => {
    const from = JSON.parse(`"${fromEscaped}"`) as string
    const to = JSON.parse(`"${toEscaped}"`) as string
    return current.split(from).join(to)
  }, value)
}

const deepFixText = <T,>(input: T): T => {
  if (typeof input === 'string') {
    return fixMojibake(input) as T
  }
  if (Array.isArray(input)) {
    return input.map((item) => deepFixText(item)) as T
  }
  if (input && typeof input === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      result[key] = deepFixText(value)
    }
    return result as T
  }
  return input
}

const freeShippingThreshold = 300
const shippingFee = 15

const rawText = {
  fi: {
    nav: ['Kategoriat', 'Tuotteet', 'Kirjaudu'],
    heroTitle: 'Tervetuloa Suomen Paperitukkuun',
    heroText: 'Tilaa laskulla saniteettitarvikkeet, paperituotteet ja paljon muuta helposti.',
    ctaShop: 'Selaa tuotteita',
    ctaAccount: 'Pyydä yritystili',
    trustTitle: 'Luotettava yritystoimittaja',
    trustItems: [
      { title: 'Nopea toimitus', text: '1–3 arkipäivää varastolta.' },
      { title: 'Laskulla', text: 'Selkeä yrityslaskutus 14 pv.' },
      { title: 'Asiakastuki', text: 'Ma–Pe 8–16, nopea vaste.' },
    ],
    categoriesTitle: 'Kategoriat',
    productsTitle: 'Tuotteet',
    productsNote: 'Toimitus arkipäivässä',
    productsBillingNote: 'Maksu laskulla',
    productsShippingNote: `Toimitus: ${shippingFee} € alle ${freeShippingThreshold} € tilauksille`,
    productsFreeShippingNote: `Ilmainen toimitus yli ${freeShippingThreshold} € tilauksille`,
    featuredTitle: 'Suosittelemme juuri nyt',
    featuredText: 'Tutustu ajankohtaisiin suosikkeihimme ja löydä parhaat tuotteet helposti.',
    productsShown: 'Näkyvillä',
    filtersTitle: 'Rajaa tuotteita',
    clearFilters: 'Tyhjennä kaikki',
    search: 'Etsi tuotteita',
    add: 'Lisää koriin',
    view: 'Näytä tuote',
    backToProducts: 'Takaisin tuotteisiin',
    related: 'Ehdotetut tuotteet',
    cartTitle: 'Ostoskori',
    cartEmpty: 'Ostoskori on tyhjä',
    subtotal: 'Välisummaa',
    delivery: 'Toimitus',
    total: 'Yhteensä',
    clearCart: 'Tyhjennä kori',
    cartAddedSingle: 'tuote lisätty ostoskoriin',
    cartAddedMulti: 'tuotetta lisätty ostoskoriin',
    freeShippingHintPrefix: 'Tilaa vielä',
    freeShippingHintSuffix: 'niin saat ilmaisen toimituksen.',
    checkoutTitle: 'Tilauksen tiedot',
    checkoutNote: 'Täytä ensin yhteystiedot, sitten laskutustiedot.',
    checkoutStepInfo: 'Yhteystiedot',
    checkoutStepBilling: 'Laskutustiedot',
    checkoutContinue: 'Jatka laskutustietoihin',
    checkoutBack: 'Takaisin',
    checkoutClose: 'Sulje',
    checkoutSuccess: 'Kiitos! Tilauksen tiedot on vastaanotettu.',
    form: {
      company: 'Yrityksen nimi',
      contact: 'Yhteyshenkilö',
      email: 'Sähköposti',
      phone: 'Puhelin',
      address: 'Toimitusosoite',
      zip: 'Postinumero',
      city: 'Kaupunki',
      billingCompany: 'Laskutusyritys',
      billingAddress: 'Laskutusosoite',
      notes: 'Lisätiedot',
      order: 'Tee tilaus',
    },
    product: {
      online: 'Verkkokaupan saatavuus',
      inStock: 'Varastossa',
      priceLabel: 'Hinta',
      vatNote: '(alv 0%)',
    },
    contactTitle: 'Ota yhteyttä',
    contactText: 'Tarvitsetko tarjouksen tai isomman erän? Autetaan nopeasti.',
    contactCta: 'Lähetä viesti',
    adminTitle: 'Kirjaudu',
    adminNote: 'Tuotteiden lisäys (demo)',
    adminLogin: {
      title: 'Kirjaudu',
      user: 'Käyttäjä',
      pass: 'Salasana',
      login: 'Kirjaudu',
      hint: '',
    },
    adminForm: {
      name: 'Tuotteen nimi',
      price: 'Hinta',
      category: 'Kategoria',
      stock: 'Varasto',
      save: 'Tallenna',
      logout: 'Kirjaudu ulos',
    },
    footer: {
      brand: 'Suomen Paperitukku',
      service: 'Asiakaspalvelu',
      phone: '+358 44 978 2446',
      email: 'suomenpaperitukku@gmail.com',
      address: 'Säynetie 16, 01490 Vantaa',
      hours: '',
      legal: '3590057-8',
    },
  },
  en: {
    nav: ['Categories', 'Products', 'Login'],
    heroTitle: 'Suomen Paperitukku',
    heroText: 'Order sanitary supplies for your business. Add to cart, fill delivery details, and order by invoice.',
    ctaShop: 'Browse products',
    ctaAccount: 'Request company account',
    trustTitle: 'Reliable business supplier',
    trustItems: [
      { title: 'Fast delivery', text: '1–3 business days from stock.' },
      { title: 'Invoice', text: 'Simple B2B billing, Net 14.' },
      { title: 'Support', text: 'Mon–Fri 8–16, quick response.' },
    ],
    categoriesTitle: 'Categories',
    productsTitle: 'Products',
    productsNote: 'Delivery on business days',
    productsBillingNote: 'Pay by invoice',
    productsShippingNote: `Delivery: ${shippingFee} € for orders below ${freeShippingThreshold} €`,
    productsFreeShippingNote: `Free delivery for orders above ${freeShippingThreshold} €`,
    featuredTitle: 'Recommended right now',
    featuredText: 'Browse current favorites and find the best products quickly.',
    productsShown: 'Showing',
    filtersTitle: 'Filters',
    clearFilters: 'Clear all',
    search: 'Search products',
    add: 'Add to cart',
    view: 'View product',
    backToProducts: 'Back to products',
    related: 'Related products',
    cartTitle: 'Cart',
    cartEmpty: 'Your cart is empty',
    subtotal: 'Subtotal',
    delivery: 'Delivery',
    total: 'Total',
    clearCart: 'Clear cart',
    cartAddedSingle: 'item added to cart',
    cartAddedMulti: 'items added to cart',
    freeShippingHintPrefix: 'Order',
    freeShippingHintSuffix: 'more to get free delivery.',
    checkoutTitle: 'Order details',
    checkoutNote: 'First fill contact details, then billing details.',
    checkoutStepInfo: 'Contact details',
    checkoutStepBilling: 'Billing details',
    checkoutContinue: 'Continue to billing',
    checkoutBack: 'Back',
    checkoutClose: 'Close',
    checkoutSuccess: 'Thanks! Your order details were received.',
    form: {
      company: 'Company name',
      contact: 'Contact person',
      email: 'Email',
      phone: 'Phone',
      address: 'Delivery address',
      zip: 'Postal code',
      city: 'City',
      billingCompany: 'Billing company',
      billingAddress: 'Billing address',
      notes: 'Notes',
      order: 'Place order',
    },
    product: {
      online: 'Online availability',
      inStock: 'In stock',
      priceLabel: 'Price',
      vatNote: '(VAT 0%)',
    },
    contactTitle: 'Contact us',
    contactText: 'Need a quote or a larger batch? We reply quickly.',
    contactCta: 'Send message',
    adminTitle: 'Login',
    adminNote: 'Add products (demo)',
    adminLogin: {
      title: 'Login',
      user: 'Username',
      pass: 'Password',
      login: 'Login',
      hint: '',
    },
    adminForm: {
      name: 'Product name',
      price: 'Price',
      category: 'Category',
      stock: 'Stock',
      save: 'Save',
      logout: 'Log out',
    },
    footer: {
      brand: 'Suomen Paperitukku',
      service: 'Customer service',
      phone: '+358 44 978 2446',
      email: 'suomenpaperitukku@gmail.com',
      address: 'Säynetie 16, 01490 Vantaa',
      hours: '',
      legal: '3590057-8',
    },
  },
} as const

const text = deepFixText(rawText)

const products: Record<Lang, Product[]> = {
  fi: [
    {
      id: 'wc',
      name: 'Tork H2 Xpress® Multifold Soft käsipyyhe 2-ker. luonnonvalkoinen 3800 ark',
      category: 'Käsipyyhkeet',
      price: 21.55,
      priceUnit: '€ / säkki',
      unitNote: '5,67 € / 1000 ark',
      sku: '471103',
      stock: 140,
      image: productImages.towel,
      images: [productImages.towel],
      description: 'Pehmeä ja imukykyinen käsipyyhe suurkulutukseen.',
    },
    {
      id: 'towel',
      name: 'Tork T4 Universal wc-paperi 2-krs 38,30m/42rll',
      category: 'WC-paperit',
      price: 15.86,
      priceUnit: '€ / säkki',
      unitNote: '9,94 € / 1000 m',
      sku: '472246',
      stock: 122,
      image: productImages.wc,
      images: [productImages.wc],
      description: 'Luotettava peruspaperi yrityskäyttöön.',
    },
    {
      id: 'soap',
      name: 'Tork H3 Universal käsipyyhe C-taitto 2-krs luonnonvalkoinen 2400 ark',
      category: 'Käsipyyhkeet',
      price: 18.68,
      priceUnit: '€ / säkki',
      unitNote: '7,78 € / 1000 ark',
      sku: 'N953102',
      stock: 96,
      image: productImages.roll,
      images: [productImages.roll],
      description: 'Laadukas taittopaperi annostelijoihin.',
    },
    {
      id: 'spray',
      name: 'Yleispuhdistussuihke 750 ml, sitrus',
      category: 'Puhdistus',
      price: 6.95,
      priceUnit: '€ / kpl',
      sku: 'S71421',
      stock: 28,
      image: productImages.spray,
      images: [productImages.spray],
      description: 'Raikas ja tehokas yleispuhdistaja pinnoille.',
    },
    {
      id: 'bag',
      name: 'Jätesäkki 240 L, vahva 10 kpl',
      category: 'Jätesäkit',
      price: 8.9,
      priceUnit: '€ / rulla',
      sku: 'B24010',
      stock: 88,
      image: productImages.trash,
      images: [productImages.trash],
      description: 'Vahvat jätesäkit isoihin astioihin.',
    },
    {
      id: 'soap5',
      name: 'Nestesaippua 5 L, hellävarainen',
      category: 'Saippuat',
      price: 14.9,
      priceUnit: '€ / kanisteri',
      sku: 'S5001',
      stock: 8,
      image: productImages.soap,
      images: [productImages.soap],
      description: 'Hellävarainen nestesaippua ammattilaiskäyttöön.',
    },
  ],  en: [
    {
      id: 'wc',
      name: 'Tork H2 Xpress® Multifold Soft hand towel 2-ply 3800 sheets',
      category: 'Hand towels',
      price: 21.55,
      priceUnit: '€ / pack',
      unitNote: '5.67 € / 1000 sheets',
      sku: '471103',
      stock: 140,
      image: productImages.towel,
      images: [productImages.towel],
      description: 'Soft and absorbent towels for heavy use.',
    },
    {
      id: 'towel',
      name: 'Tork T4 Universal toilet paper 2-ply 38.3m/42 rolls',
      category: 'Toilet paper',
      price: 15.86,
      priceUnit: '€ / pack',
      unitNote: '9.94 € / 1000 m',
      sku: '472246',
      stock: 122,
      image: productImages.wc,
      images: [productImages.wc],
      description: 'Reliable everyday toilet paper for businesses.',
    },
    {
      id: 'soap',
      name: 'Tork H3 Universal C-fold hand towel 2-ply 2400 sheets',
      category: 'Hand towels',
      price: 18.68,
      priceUnit: '€ / pack',
      unitNote: '7.78 € / 1000 sheets',
      sku: 'N953102',
      stock: 96,
      image: productImages.roll,
      images: [productImages.roll],
      description: 'Quality folded towels for dispensers.',
    },
    {
      id: 'spray',
      name: 'All-purpose spray 750 ml, citrus',
      category: 'Cleaning',
      price: 6.95,
      priceUnit: '€ / pc',
      sku: 'S71421',
      stock: 28,
      image: productImages.spray,
      images: [productImages.spray],
      description: 'Fresh, effective cleaner for daily surfaces.',
    },
    {
      id: 'bag',
      name: 'Waste bag 240 L, heavy duty 10 pcs',
      category: 'Waste bags',
      price: 8.9,
      priceUnit: '€ / roll',
      sku: 'B24010',
      stock: 88,
      image: productImages.trash,
      images: [productImages.trash],
      description: 'Durable waste bags for large bins.',
    },
    {
      id: 'soap5',
      name: 'Liquid soap 5 L, gentle',
      category: 'Soaps',
      price: 14.9,
      priceUnit: '€ / canister',
      sku: 'S5001',
      stock: 8,
      image: productImages.soap,
      images: [productImages.soap],
      description: 'Gentle liquid soap for professional use.',
    },
  ],
}

const adminCreds = {
  user: 'admin',
  pass: 'saniteetti123',
}

const pageSize = 16
const defaultCategories: CategoryDef[] = [
  { id: 'wc-paperit', slug: 'wc-paperit', nameFi: 'WC-paperit', nameEn: 'Toilet paper' },
  { id: 'kasipyyhkeet', slug: 'kasipyyhkeet', nameFi: 'Käsipyyhkeet', nameEn: 'Hand towels' },
  { id: 'saippuat', slug: 'saippuat', nameFi: 'Saippuat', nameEn: 'Soaps' },
  { id: 'puhdistus', slug: 'puhdistus', nameFi: 'Puhdistus', nameEn: 'Cleaning' },
  { id: 'jatesakit', slug: 'jatesakit', nameFi: 'Jätesäkit', nameEn: 'Waste bags' },
  { id: 'muut', slug: 'muut', nameFi: 'Muut', nameEn: 'Other' },
]
const vatMultiplier = 1.255
const categoryAliases = defaultCategories.reduce<Record<string, string>>((acc, item) => {
  acc[item.id] = item.id
  acc[item.slug] = item.id
  acc[item.nameFi] = item.id
  acc[item.nameEn] = item.id
  return acc
}, { Other: 'muut', Muut: 'muut' })

const slugify = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')

const parseOptionPrice = (value: string) => {
  const normalized = value.replace(/€/g, '').replace(/\s+/g, '').replace(',', '.').trim()
  if (!normalized) {
    return undefined
  }
  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? numeric : undefined
}

const normalizeOptionGroups = (groups?: ProductOptionGroup[]): ProductOptionGroup[] => {
  if (!Array.isArray(groups)) {
    return []
  }

  return groups.reduce<ProductOptionGroup[]>((acc, group, groupIndex) => {
    const name = String(group?.name ?? '').trim()
    const values = Array.isArray(group?.values)
      ? group.values.reduce<ProductOptionValue[]>((valueAcc, value, valueIndex) => {
          const label = String(value?.label ?? '').trim()
          if (!label) {
            return valueAcc
          }

          valueAcc.push({
            id: String(value?.id ?? '').trim() || slugify(`${name || 'option'}-${label}-${valueIndex + 1}`) || `value-${valueIndex + 1}`,
            label,
            detail: String(value?.detail ?? '').trim() || undefined,
            price: Number.isFinite(Number(value?.price)) ? Number(value.price) : undefined,
          })
          return valueAcc
        }, [])
      : []

    if (!name || values.length === 0) {
      return acc
    }

    acc.push({
      id: String(group?.id ?? '').trim() || slugify(`${name}-${groupIndex + 1}`) || `option-${groupIndex + 1}`,
      name,
      values,
    })
    return acc
  }, [])
}

const createAdminOptionGroup = (): AdminOptionGroupForm => ({
  id: `option-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: '',
  values: [],
  draftLabel: '',
  draftDetail: '',
  draftPrice: '',
})

const parseAdminOptionGroups = (groups: AdminOptionGroupForm[]): ProductOptionGroup[] =>
  normalizeOptionGroups(
    groups.map((group, groupIndex) => ({
      id: group.id || `option-${groupIndex + 1}`,
      name: group.name,
      values: group.values.map((value, valueIndex) => ({
        id: value.id || slugify(`${group.name || 'option'}-${value.label}-${valueIndex + 1}`) || `value-${valueIndex + 1}`,
        label: value.label,
        detail: value.detail.trim() || undefined,
        price: parseOptionPrice(value.price),
      })),
    })),
  )

const formatAdminOptionGroups = (groups?: ProductOptionGroup[]): AdminOptionGroupForm[] =>
  normalizeOptionGroups(groups).map((group) => ({
    id: group.id,
    name: group.name,
    values: group.values.map((value) => ({
      id: value.id,
      label: value.label,
      detail: value.detail ?? '',
      price: value.price !== undefined ? String(value.price).replace('.', ',') : '',
    })),
    draftLabel: '',
    draftDetail: '',
    draftPrice: '',
  }))

const extractUnitLabel = (priceUnit: string, lang: Lang) => {
  const unit = priceUnit
    .replace(/€/g, '')
    .split('/')
    .pop()
    ?.trim()
    .replace(/^\(|\)$/g, '')

  if (unit) {
    return unit.charAt(0).toUpperCase() + unit.slice(1)
  }

  return lang === 'fi' ? 'Kpl' : 'Pc'
}

const getPriceUnitSuffix = (priceUnit: string, vatNote: string) => {
  const suffix = String(priceUnit ?? '')
    .replace(/[€?]/g, '')
    .trim()

  return suffix ? `${suffix} ${vatNote}` : vatNote
}

const getDisplayOptionGroups = (product: Product | null, lang: Lang): ProductOptionGroup[] => {
  const groups = normalizeOptionGroups(product?.optionGroups)
  if (groups.length > 0) {
    return groups
  }

  if (!product) {
    return []
  }

  return [
    {
      id: 'default-unit',
      name: lang === 'fi' ? 'Yksikkö' : 'Unit',
      values: [
        {
          id: 'default-unit-value',
          label: extractUnitLabel(product.priceUnit, lang),
          detail: '1',
          price: product.price,
        },
      ],
    },
  ]
}

const getDefaultOptionSelections = (product: Product | null, lang: Lang): Record<string, string> => {
  const groups = getDisplayOptionGroups(product, lang)

  return groups.reduce<Record<string, string>>((acc, group) => {
    if (group.values[0]) {
      acc[group.id] = group.values[0].id
    }
    return acc
  }, {})
}

const resolveSelectedOptions = (product: Product | null, selections: Record<string, string>, lang: Lang): SelectedProductOption[] => {
  const groups = getDisplayOptionGroups(product, lang)

  return groups.reduce<SelectedProductOption[]>((acc, group) => {
      const selectedValueId = selections[group.id] || group.values[0]?.id
      const value = group.values.find((item) => item.id === selectedValueId) ?? group.values[0]
      if (!value) {
        return acc
      }
      acc.push({
        groupId: group.id,
        groupName: group.name,
        valueId: value.id,
        valueLabel: value.label,
        valueDetail: value.detail,
        valuePrice: value.price,
      })
      return acc
    }, [])
}

const buildCartLineId = (productId: string, selectedOptions: SelectedProductOption[]) => {
  const suffix = selectedOptions.map((item) => `${item.groupId}:${item.valueId}`).join('|')
  return suffix ? `${productId}__${suffix}` : productId
}

const formatSelectedOptionsText = (selectedOptions: SelectedProductOption[], separator = ' • ') =>
  selectedOptions
    .map((item) => `${item.groupName}: ${item.valueLabel}${item.valueDetail ? ` (${item.valueDetail})` : ''}`)
    .join(separator)

const getRouteFromUrl = (): RouteState => {
  if (typeof window === 'undefined') {
    return { type: 'home', slug: null, categorySlug: null, searchQuery: null, legacyProductId: null }
  }
  const url = new URL(window.location.href)
  const productMatch = url.pathname.match(/^\/tuote\/([^/]+)\/?$/)

  return {
    type: productMatch ? 'product' : 'home',
    slug: productMatch ? decodeURIComponent(productMatch[1]) : null,
    categorySlug: url.searchParams.get('category'),
    searchQuery: url.searchParams.get('q'),
    legacyProductId: url.searchParams.get('product'),
  }
}

const getStockTone = (stock: number): 'ok' | 'warn' | 'low' => {
  if (stock <= 10) {
    return 'low'
  }
  if (stock <= 40) {
    return 'warn'
  }
  return 'ok'
}

const getStockLabel = (stock: number, lang: Lang) => {
  if (stock <= 0) {
    return lang === 'fi' ? 'Loppu' : 'Out of stock'
  }
  if (stock <= 10) {
    return lang === 'fi' ? 'Vähissä' : 'Low stock'
  }
  if (stock <= 40) {
    return lang === 'fi' ? 'Saatavilla' : 'Available'
  }
  return lang === 'fi' ? 'Varastossa' : 'In stock'
}

const formatPrice = (value: number, lang: Lang) => {
  return new Intl.NumberFormat(lang === 'fi' ? 'fi-FI' : 'en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

const getResolvedUnitPrice = (product: Product, selectedOptions: SelectedProductOption[]) =>
  selectedOptions.find((item) => item.valuePrice !== undefined)?.valuePrice ?? product.price

const formatOptionValueMeta = (
  groupName: string,
  detail: string | undefined,
  price: number | undefined,
  lang: Lang,
  priceUnit: string,
) => {
  const isUnitGroup = /yksikk|unit/i.test(groupName)
  const parts: string[] = []
  if (detail) {
    parts.push(detail)
  }
  if (price !== undefined && (!isUnitGroup || !detail)) {
    parts.push(`${formatPrice(price, lang)} ${priceUnit}`)
  }
  return parts.join(' • ')
}

const getOptionMetaHeader = (groupName: string, lang: Lang) =>
  /yksikk|unit/i.test(groupName)
    ? (lang === 'fi' ? 'Määrä' : 'Qty')
    : (lang === 'fi' ? 'Lisätieto' : 'Detail')

const formatDateTime = (value: string, lang: Lang) => {
  const locale = lang === 'fi' ? 'fi-FI' : 'en-GB'
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

const deliveryCost = (subtotal: number) => (subtotal >= freeShippingThreshold ? 0 : shippingFee)

const formatDelivery = (value: number, lang: Lang) => {
  if (value === 0) {
    return lang === 'fi' ? 'Ilmainen' : 'Free'
  }
  return `${formatPrice(value, lang)} €`
}

const getFreeShippingHint = (
  remaining: number,
  lang: Lang,
  t: { freeShippingHintPrefix: string; freeShippingHintSuffix: string },
) => {
  if (remaining <= 0) {
    return ''
  }

  if (lang === 'fi') {
    return `${t.freeShippingHintPrefix} ${formatPrice(remaining, lang)} € ${t.freeShippingHintSuffix}`
  }

  return `${t.freeShippingHintPrefix} ${formatPrice(remaining, lang)} € ${t.freeShippingHintSuffix}`
}

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

const grossPrice = (value: number) => value * vatMultiplier

const normalizeCategoryId = (rawCategory: string) => {
  const trimmed = rawCategory.trim()
  if (!trimmed) {
    return 'muut'
  }
  const alias = categoryAliases[trimmed]
  if (alias) {
    return alias
  }
  return slugify(trimmed) || 'muut'
}

const normalizeCategoryDef = (item: CategoryDef | string): CategoryDef => {
  if (typeof item === 'string') {
    const id = normalizeCategoryId(item)
    return { id, slug: id, nameFi: item, nameEn: item }
  }
  const id = normalizeCategoryId(item.id || item.slug || item.nameFi || item.nameEn)
  return {
    id,
    slug: item.slug?.trim() || id,
    nameFi: item.nameFi?.trim() || id,
    nameEn: item.nameEn?.trim() || item.nameFi?.trim() || id,
  }
}

const normalizeProduct = (product: Product): Product => {
  const images = Array.isArray(product.images) && product.images.length > 0 ? product.images : [product.image]
  return {
    ...product,
    slug: product.slug?.trim() || slugify(product.name || product.id) || product.id,
    category: normalizeCategoryId(product.category),
    image: images[0],
    images,
    seoTitle: product.seoTitle?.trim() || undefined,
    metaDescription: product.metaDescription?.trim() || undefined,
    searchKeywords: Array.isArray(product.searchKeywords)
      ? product.searchKeywords.map((item) => item.trim()).filter(Boolean)
      : [],
    featured: Boolean(product.featured),
    featuredRank: Number.isFinite(Number(product.featuredRank)) ? Number(product.featuredRank) : 999,
    optionGroups: normalizeOptionGroups(product.optionGroups),
  }
}

const normalizeCatalog = (payload?: Partial<CatalogPayload> | null): CatalogPayload => ({
  categories: Array.isArray(payload?.categories) && payload.categories.length > 0
    ? payload.categories.map(normalizeCategoryDef)
    : defaultCategories,
  products: Array.isArray(payload?.products)
    ? payload.products.map(normalizeProduct)
    : [],
})

const getInitialCatalog = () => normalizeCatalog(typeof window !== 'undefined' ? window.__INITIAL_CATALOG__ : null)

const getProductHref = (product: Product) => `/tuote/${encodeURIComponent(product.slug || slugify(product.name || product.id) || product.id)}`

const compareFeaturedPriority = (a: Product, b: Product) => {
  const aFeatured = Boolean(a.featured)
  const bFeatured = Boolean(b.featured)

  if (aFeatured !== bFeatured) {
    return aFeatured ? -1 : 1
  }

  if (aFeatured && bFeatured) {
    const rankDiff = (a.featuredRank ?? 999) - (b.featuredRank ?? 999)
    if (rankDiff !== 0) {
      return rankDiff
    }
  }

  return a.name.localeCompare(b.name, 'fi')
}

const getFeaturedProducts = (items: Product[], limit = 4) =>
  [...items]
    .filter((item) => item.featured)
    .sort(compareFeaturedPriority)
    .slice(0, limit)

const getCategoryHref = (category: CategoryDef) => `/?category=${encodeURIComponent(category.slug)}`

const getProductImage = (product: Product) => (product.images && product.images.length > 0 ? product.images[0] : product.image)
const getProductAlt = (product: Product) => `${product.name} yrityksille`

const getRelated = (items: Product[], currentId: string) => {
  return items.filter((item) => item.id !== currentId).slice(0, 3)
}

const getSiteUrl = () => {
  return (typeof window !== 'undefined' ? window.__SITE_URL__ : '') || 'https://suomenpaperitukku.fi'
}

const seoHintByCategory: Record<string, { fi: string; en: string }> = {
  'wc-paperit': { fi: 'edullinen wc-paperi', en: 'toilet paper for businesses' },
  kasipyyhkeet: { fi: 'laadukas käsipyyhe', en: 'hand towel for businesses' },
  saippuat: { fi: 'ammattitason saippua', en: 'soap for businesses' },
  puhdistus: { fi: 'tehokas puhdistusaine', en: 'cleaning product for businesses' },
  jatesakit: { fi: 'kestävä jätesäkki', en: 'durable waste bag' },
}

const shortenText = (value: string, maxLength: number) => {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) {
    return trimmed
  }
  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trim()}…`
}

const buildSeoTitle = (name: string, categoryId: string, lang: Lang) => {
  if (!name.trim()) {
    return ''
  }
  const suffix = seoHintByCategory[categoryId]?.[lang] || (lang === 'fi' ? 'yrityksille nopeasti' : 'for businesses')
  return `${name} – ${suffix} | Suomen Paperitukku`
}

const buildMetaDescription = (name: string, description: string, categoryLabel: string, lang: Lang) => {
  if (!name.trim()) {
    return ''
  }
  const base =
    lang === 'fi'
      ? `${name}. ${description || `${categoryLabel} yrityksille.`} Tilaa laskulla nopeasti Suomen Paperitukusta.`
      : `${name}. ${description || `${categoryLabel} for businesses.`} Fast invoice ordering from Suomen Paperitukku.`
  return shortenText(base, 155)
}

const buildSearchKeywords = (name: string, categoryLabel: string, sku: string) => {
  if (!name.trim()) {
    return []
  }
  const rawParts = [
    name,
    categoryLabel,
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

const upsertMeta = (selector: string, attributes: Record<string, string>) => {
  let element = document.head.querySelector(selector) as HTMLMetaElement | HTMLLinkElement | null
  if (!element) {
    const tagName = selector.startsWith('link') ? 'link' : 'meta'
    element = document.createElement(tagName) as HTMLMetaElement | HTMLLinkElement
    document.head.appendChild(element)
  }
  Object.entries(attributes).forEach(([key, value]) => {
    element?.setAttribute(key, value)
  })
}

const applyStructuredData = (data: unknown[]) => {
  let script = document.head.querySelector('script[data-seo="structured-data"]') as HTMLScriptElement | null
  if (!script) {
    script = document.createElement('script')
    script.type = 'application/ld+json'
    script.dataset.seo = 'structured-data'
    document.head.appendChild(script)
  }
  script.textContent = JSON.stringify(data)
}

const publicRobotsContent = 'index,follow,max-image-preview:large'
const adminRobotsContent = 'noindex,nofollow,noarchive'
const homeSeoTitle = 'Suomen Paperitukku \u2013 Käsi- ja wc-paperit sekä saniteettitarvikkeet yrityksille'
const homeSeoDescription =
  'Suomen Paperitukku toimittaa käsipaperit, WC-paperit ja saniteettitarvikkeet yrityksille nopeasti ja edullisesti koko Suomeen. | Suomen Paperitukku'

const applyHomeSeo = (products: Product[] = []) => {
  const siteUrl = getSiteUrl()
  document.title = homeSeoTitle
  upsertMeta('meta[name="description"]', { name: 'description', content: homeSeoDescription })
  upsertMeta('meta[name="robots"]', { name: 'robots', content: publicRobotsContent })
  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: homeSeoTitle })
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: homeSeoDescription })
  upsertMeta('meta[property="og:url"]', { property: 'og:url', content: `${siteUrl}/` })
  upsertMeta('meta[property="og:image"]', { property: 'og:image', content: `${siteUrl}/brand-logo.png` })
  upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' })
  upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' })
  upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: homeSeoTitle })
  upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: homeSeoDescription })
  upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: `${siteUrl}/brand-logo.png` })
  upsertMeta('meta[name="twitter:url"]', { name: 'twitter:url', content: `${siteUrl}/` })
  upsertMeta('link[rel="canonical"]', { rel: 'canonical', href: `${siteUrl}/` })

  const featuredProducts = (getFeaturedProducts(products, 8).length > 0 ? getFeaturedProducts(products, 8) : [...products].sort(compareFeaturedPriority).slice(0, 8)).map((product, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    url: `${siteUrl}${getProductHref(product)}`,
    item: {
      '@type': 'Product',
      name: product.name,
      image: `${siteUrl}${product.images[0] || product.image}`,
      description: product.metaDescription || product.description,
      sku: product.sku,
      brand: {
        '@type': 'Brand',
        name: 'Suomen Paperitukku',
      },
      offers: {
        '@type': 'Offer',
        priceCurrency: 'EUR',
        price: product.price.toFixed(2),
        availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: `${siteUrl}${getProductHref(product)}`,
      },
    },
  }))

  applyStructuredData([
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Suomen Paperitukku',
      url: `${siteUrl}/`,
      logo: `${siteUrl}/brand-logo.png`,
      email: 'suomenpaperitukku@gmail.com',
      telephone: '+358449782446',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'S\u00E4ynetie 16',
        postalCode: '01490',
        addressLocality: 'Vantaa',
        addressCountry: 'FI',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Suomen Paperitukku',
      url: `${siteUrl}/`,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${siteUrl}/?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Suosittuja tuotteita',
      itemListElement: featuredProducts,
    },
  ])
}

const applyAdminSeo = (lang: Lang, adminAuthed: boolean) => {
  const siteUrl = getSiteUrl()
  const title = adminAuthed
    ? (lang === 'fi' ? 'Hallinta | Suomen Paperitukku' : 'Admin | Suomen Paperitukku')
    : (lang === 'fi' ? 'Kirjaudu sis\u00E4\u00E4n | Suomen Paperitukku' : 'Sign in | Suomen Paperitukku')
  const description = adminAuthed
    ? (lang === 'fi'
        ? 'Suomen Paperitukun hallintapaneeli tuotteiden ja tilausten k\u00E4sittelyyn.'
        : 'Suomen Paperitukku admin for managing products and orders.')
    : (lang === 'fi'
        ? 'Kirjaudu Suomen Paperitukun hallintaan.'
        : 'Sign in to Suomen Paperitukku admin.')

  document.title = title
  upsertMeta('meta[name="description"]', { name: 'description', content: description })
  upsertMeta('meta[name="robots"]', { name: 'robots', content: adminRobotsContent })
  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title })
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description })
  upsertMeta('meta[property="og:url"]', { property: 'og:url', content: `${siteUrl}/` })
  upsertMeta('meta[property="og:image"]', { property: 'og:image', content: `${siteUrl}/brand-logo.png` })
  upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' })
  upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' })
  upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title })
  upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description })
  upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: `${siteUrl}/brand-logo.png` })
  upsertMeta('meta[name="twitter:url"]', { name: 'twitter:url', content: `${siteUrl}/` })
  upsertMeta('link[rel="canonical"]', { rel: 'canonical', href: `${siteUrl}/` })
  applyStructuredData([])
}

const applyProductSeo = (product: Product, category: CategoryDef | undefined) => {
  const siteUrl = getSiteUrl()
  const canonical = `${siteUrl}${getProductHref(product)}`
  const description =
    product.metaDescription ||
    buildMetaDescription(product.name, product.description, category?.nameFi ?? product.category, 'fi')
  const ogImage = `${siteUrl}/og/product/${encodeURIComponent(product.slug || slugify(product.name || product.id) || product.id)}.svg`
  const title = product.seoTitle || buildSeoTitle(product.name, product.category, 'fi')
  const keywords = (product.searchKeywords ?? []).join(', ')

  document.title = title
  upsertMeta('meta[name="description"]', { name: 'description', content: description })
  upsertMeta('meta[name="keywords"]', { name: 'keywords', content: keywords })
  upsertMeta('meta[name="robots"]', { name: 'robots', content: publicRobotsContent })
  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title })
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description })
  upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonical })
  upsertMeta('meta[property="og:image"]', { property: 'og:image', content: ogImage })
  upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'product' })
  upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' })
  upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title })
  upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description })
  upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: ogImage })
  upsertMeta('meta[name="twitter:url"]', { name: 'twitter:url', content: canonical })
  upsertMeta('link[rel="canonical"]', { rel: 'canonical', href: canonical })
  applyStructuredData([
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Etusivu',
          item: `${siteUrl}/`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: category?.nameFi ?? 'Tuotteet',
          item: `${siteUrl}${category ? getCategoryHref(category) : '/'}`,
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: product.name,
          item: canonical,
        },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description,
      sku: product.sku,
      image: [`${siteUrl}${product.images[0] || product.image}`].filter(Boolean),
      category: category?.nameFi ?? product.category,
      keywords,
      brand: {
        '@type': 'Brand',
        name: 'Suomen Paperitukku',
      },
      offers: {
        '@type': 'Offer',
        priceCurrency: 'EUR',
        price: product.price.toFixed(2),
        availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: canonical,
        seller: {
          '@type': 'Organization',
          name: 'Suomen Paperitukku',
        },
      },
    },
  ])
}

function App() {
  const initialCatalog = getInitialCatalog()
  const initialRoute = typeof window !== 'undefined' ? window.__INITIAL_ROUTE__ : null
  const [lang, setLang] = useState<Lang>('fi')
  const [productCatalog, setProductCatalog] = useState<Product[]>(initialCatalog.products)
  const [categories, setCategories] = useState<CategoryDef[]>(initialCatalog.categories)
  const [, setCatalogLoading] = useState(initialCatalog.products.length === 0)
  const [cart, setCart] = useState<Record<string, CartLine>>({})
  const [cartToast, setCartToast] = useState<CartToast | null>(null)
  const [freeShippingToast, setFreeShippingToast] = useState<FreeShippingToast | null>(null)
  const [orderSent, setOrderSent] = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState<1 | 2>(1)
  const [isAdminPage, setIsAdminPage] = useState(false)
  const [adminUser, setAdminUser] = useState('')
  const [adminPass, setAdminPass] = useState('')
  const [adminError, setAdminError] = useState('')
  const [adminAuthed, setAdminAuthed] = useState(false)
  const [productQuery, setProductQuery] = useState(() => getRouteFromUrl().searchQuery ?? '')
  const [activeCategory, setActiveCategory] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [sortBy, setSortBy] = useState<'relevance' | 'price' | 'name'>('relevance')
  const [adminQuery, setAdminQuery] = useState('')
  const [adminPage, setAdminPage] = useState(1)
  const [adminCategoryName, setAdminCategoryName] = useState('')
  const [adminCategoryNameEn, setAdminCategoryNameEn] = useState('')
  const [adminCategoryDrafts, setAdminCategoryDrafts] = useState<Record<string, { nameFi: string; nameEn: string }>>({})
  const [adminNewOptionGroupName, setAdminNewOptionGroupName] = useState('')
  const [selectedQuantity, setSelectedQuantity] = useState(1)
  const [selectedOptionSelections, setSelectedOptionSelections] = useState<Record<string, string>>({})
  const [detailImageIndex, setDetailImageIndex] = useState(0)
  const [adminImageUrl, setAdminImageUrl] = useState('')
  const [showContactPanel, setShowContactPanel] = useState(false)
  const [adminProductForm, setAdminProductForm] = useState<AdminProductForm>({
    id: null,
    name: '',
    sku: '',
    category: '',
    price: '',
    priceUnit: lang === 'fi' ? '€ / kpl' : '€ / pc',
    unitNote: '',
    stock: '',
    images: [],
    description: '',
    seoTitle: '',
    metaDescription: '',
    searchKeywords: '',
    featured: false,
    featuredRank: '',
    optionGroups: [],
  })
  const [adminSeoTouched, setAdminSeoTouched] = useState(false)
  const [adminMetaTouched, setAdminMetaTouched] = useState(false)
  const [adminKeywordsTouched, setAdminKeywordsTouched] = useState(false)
  const [routeState, setRouteState] = useState<RouteState>(() => {
    const next = getRouteFromUrl()
    if (initialRoute?.type === 'product' && initialRoute.slug) {
      return { ...next, type: 'product', slug: initialRoute.slug }
    }
    return next
  })
  const [checkoutForm, setCheckoutForm] = useState<CheckoutForm>({
    company: '',
    contact: '',
    email: '',
    phone: '',
    address: '',
    zip: '',
    city: '',
    billingCompany: '',
    billingAddress: '',
    notes: '',
  })
  const [formError, setFormError] = useState('')
  const [placingOrder, setPlacingOrder] = useState(false)
  const [lastOrderId, setLastOrderId] = useState('')
  const [adminOrders, setAdminOrders] = useState<AdminOrder[]>([])
  const [adminOrdersLoading, setAdminOrdersLoading] = useState(false)
  const [adminOrdersError, setAdminOrdersError] = useState('')
  const [shipActionOrderId, setShipActionOrderId] = useState<string | null>(null)
  const previousStorePageRef = useRef(currentPage)
  const heroStyle = { '--hero-bg': `url(${heroBgImage})` } as CSSProperties
  const t = useMemo(() => text[lang], [lang])
  const categoriesForFilters = categories
  const categoryMap = useMemo(() => {
    return categories.reduce<Record<string, CategoryDef>>((acc, item) => {
      acc[item.id] = item
      return acc
    }, {})
  }, [categories])
  const getCategoryLabel = (categoryId: string) => {
    const match = categoryMap[categoryId]
    if (!match) {
      return categoryId
    }
    return lang === 'fi' ? match.nameFi : match.nameEn
  }
  const adminCategoryLabel = adminProductForm.category ? (categoryMap[adminProductForm.category]?.nameFi ?? adminProductForm.category) : 'tuote'
  const generatedAdminSeoTitle = buildSeoTitle(adminProductForm.name.trim(), adminProductForm.category, 'fi')
  const generatedAdminMetaDescription = buildMetaDescription(
    adminProductForm.name.trim(),
    adminProductForm.description.trim(),
    adminCategoryLabel,
    'fi',
  )
  const generatedAdminKeywords = buildSearchKeywords(
    adminProductForm.name.trim(),
    adminCategoryLabel,
    adminProductForm.sku.trim(),
  ).join(', ')

  const filteredProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase()
    let next = productCatalog.filter((item) => {
      const categoryTerms = categoryMap[item.category]
        ? `${categoryMap[item.category].nameFi} ${categoryMap[item.category].nameEn}`
        : item.category
      const haystack = `${item.name} ${item.sku} ${item.description} ${item.category} ${categoryTerms}`.toLowerCase()
      const matchesQuery = query === '' || haystack.includes(query)
      const matchesCategory = query !== '' || activeCategory === 'all' || item.category === activeCategory
      return matchesQuery && matchesCategory
    })

    if (sortBy === 'relevance') {
      next = [...next].sort(compareFeaturedPriority)
    } else if (sortBy === 'price') {
      next = [...next].sort((a, b) => a.price - b.price)
    } else if (sortBy === 'name') {
      next = [...next].sort((a, b) => a.name.localeCompare(b.name, lang === 'fi' ? 'fi' : 'en'))
    }

    return next
  }, [activeCategory, categoryMap, lang, productCatalog, productQuery, sortBy])

  const totalCount = filteredProducts.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const listStart = (safeCurrentPage - 1) * pageSize
  const pagedProducts = filteredProducts.slice(listStart, listStart + pageSize)
  const selectedProduct = routeState.slug ? productCatalog.find((item) => item.slug === routeState.slug) ?? null : null
  const selectedCategory = selectedProduct ? categoryMap[selectedProduct.category] : undefined
  const selectedProductImages = selectedProduct ? (selectedProduct.images.length > 0 ? selectedProduct.images : [selectedProduct.image]) : []
  const selectedProductOptionGroups = useMemo(() => getDisplayOptionGroups(selectedProduct, lang), [lang, selectedProduct])
  const selectedProductOptions = useMemo(
    () => resolveSelectedOptions(selectedProduct, selectedOptionSelections, lang),
    [lang, selectedOptionSelections, selectedProduct],
  )
  const selectedProductUnitPrice = selectedProduct ? getResolvedUnitPrice(selectedProduct, selectedProductOptions) : 0
  const relatedProducts = selectedProduct ? getRelated(productCatalog, selectedProduct.id) : [] 
  const featuredHomeProducts = useMemo(() => getFeaturedProducts(productCatalog, 4), [productCatalog])
  const showFeaturedHomeSection = activeCategory === 'all' && productQuery.trim() === ''

  useEffect(() => {
    let active = true

    const loadCatalog = async () => {
      try {
        const response = await fetch('/api/catalog')
        const payload = normalizeCatalog((await response.json()) as CatalogPayload)
        if (!active) {
          return
        }
        setProductCatalog(payload.products)
        setCategories(payload.categories)
      } catch {
        if (!active) {
          return
        }
        if (initialCatalog.products.length === 0) {
          setProductCatalog(products.fi.map(normalizeProduct))
          setCategories(defaultCategories)
        }
      } finally {
        if (active) {
          setCatalogLoading(false)
        }
      }
    }

    void loadCatalog()

    return () => {
      active = false
    }
  }, [initialCatalog.products.length])

  useEffect(() => {
    setCurrentPage(1)
  }, [productQuery, activeCategory, sortBy])

  useEffect(() => {
    setAdminCategoryDrafts(
      categories.reduce<Record<string, { nameFi: string; nameEn: string }>>((acc, category) => {
        acc[category.id] = {
          nameFi: category.nameFi,
          nameEn: category.nameEn,
        }
        return acc
      }, {}),
    )
  }, [categories])

  useEffect(() => {
    setSelectedQuantity(1)
    setSelectedOptionSelections(getDefaultOptionSelections(selectedProduct, lang))
    setDetailImageIndex(0)
  }, [lang, routeState.slug, selectedProduct])

  useEffect(() => {
    if (!cartToast) {
      return
    }
    const timer = window.setTimeout(() => {
      setCartToast(null)
    }, 3200)
    return () => window.clearTimeout(timer)
  }, [cartToast])

  useEffect(() => {
    if (!freeShippingToast) {
      return
    }
    const timer = window.setTimeout(() => {
      setFreeShippingToast(null)
    }, 6000)
    return () => window.clearTimeout(timer)
  }, [freeShippingToast])

  useEffect(() => {
    const onPopState = () => {
      setRouteState(getRouteFromUrl())
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    const currentCategory = routeState.categorySlug
    if (!currentCategory) {
      return
    }
    const match = categories.find((item) => item.slug === currentCategory || item.id === currentCategory)
    if (match) {
      setActiveCategory(match.id)
    }
  }, [categories, routeState.categorySlug])

  useEffect(() => {
    if (routeState.type === 'home') {
      setProductQuery(routeState.searchQuery ?? '')
    }
  }, [routeState.searchQuery, routeState.type])

  useEffect(() => {
    if (routeState.legacyProductId && productCatalog.length > 0) {
      const match = productCatalog.find((item) => item.id === routeState.legacyProductId)
      if (match) {
        window.history.replaceState({}, '', getProductHref(match))
        setRouteState(getRouteFromUrl())
      }
    }
  }, [productCatalog, routeState.legacyProductId])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  useEffect(() => {
    if (isAdminPage) {
      applyAdminSeo(lang, adminAuthed)
      return
    }
    if (selectedProduct) {
      applyProductSeo(selectedProduct, selectedCategory)
      return
    }
    applyHomeSeo(productCatalog)
  }, [adminAuthed, isAdminPage, productCatalog, selectedCategory, selectedProduct, lang])

  useEffect(() => {
    document.getElementById('ssr-root')?.remove()
    document.getElementById('root')?.removeAttribute('data-booting')
  }, [])

  useEffect(() => {
    setAdminPage(1)
  }, [adminQuery])

  useEffect(() => {
    if (previousStorePageRef.current !== currentPage && !selectedProduct && !isAdminPage) {
      document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    previousStorePageRef.current = currentPage
  }, [currentPage, isAdminPage, selectedProduct])

  useEffect(() => {
    if (isAdminPage && adminAuthed) {
      void loadAdminOrders()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminPage, adminAuthed])

  useEffect(() => {
    setAdminProductForm((prev) =>
      prev.id
        ? prev
        : {
            ...prev,
            priceUnit: lang === 'fi' ? '€ / kpl' : '€ / pc',
          }
    )
  }, [lang])

  useEffect(() => {
    setAdminProductForm((prev) => {
      const next = { ...prev }
      let changed = false

      if (!adminSeoTouched && prev.seoTitle !== generatedAdminSeoTitle) {
        next.seoTitle = generatedAdminSeoTitle
        changed = true
      }

      if (!adminMetaTouched && prev.metaDescription !== generatedAdminMetaDescription) {
        next.metaDescription = generatedAdminMetaDescription
        changed = true
      }

      if (!adminKeywordsTouched && prev.searchKeywords !== generatedAdminKeywords) {
        next.searchKeywords = generatedAdminKeywords
        changed = true
      }

      return changed ? next : prev
    })
  }, [
    adminKeywordsTouched,
    adminMetaTouched,
    adminSeoTouched,
    generatedAdminKeywords,
    generatedAdminMetaDescription,
    generatedAdminSeoTitle,
  ])

  const addToCart = (product: Product, quantity = 1, selectedOptions: SelectedProductOption[] = []) => {
    setOrderSent(false)
    const qty = Math.max(1, quantity)
    const lineId = buildCartLineId(product.id, selectedOptions)
    const unitPrice = getResolvedUnitPrice(product, selectedOptions)
    const nextSubtotal = subtotal + unitPrice * qty
    const nextRemaining = Math.max(0, freeShippingThreshold - nextSubtotal)
    setCart((prev) => ({
      ...prev,
      [lineId]: {
        id: lineId,
        productId: product.id,
        quantity: (prev[lineId]?.quantity ?? 0) + qty,
        selectedOptions,
      },
    }))
    setCartToast({
      id: Date.now(),
      productName: product.name,
      image: getProductImage(product),
      quantity: qty,
      linePrice: unitPrice * qty,
      selectedOptionsText: selectedOptions.length > 0 ? formatSelectedOptionsText(selectedOptions, ' • ') : undefined,
    })
    setFreeShippingToast(
      nextRemaining > 0
        ? {
            id: Date.now() + 1,
            message: getFreeShippingHint(nextRemaining, lang, t),
          }
        : null,
    )
  }

  const updateCartLineQuantity = (lineId: string, delta: number) => {
    setOrderSent(false)
    setCart((prev) => {
      const next = { ...prev }
      const line = next[lineId]
      if (!line) {
        return prev
      }
      const count = line.quantity + delta
      if (count <= 0) {
        delete next[lineId]
      } else {
        next[lineId] = { ...line, quantity: count }
      }
      return next
    })
  }

  const clearCart = () => {
    setOrderSent(false)
    setCart({})
  }

  const updateForm = (field: keyof CheckoutForm, value: string) => {
    setCheckoutForm((prev) => ({ ...prev, [field]: value }))
  }

  const syncProductInUrl = (product: Product | null) => {
    const url = new URL(window.location.href)
    if (product) {
      url.pathname = getProductHref(product)
      url.search = ''
      url.hash = ''
    } else {
      url.pathname = '/'
      url.searchParams.delete('product')
      if (activeCategory !== 'all' && categoryMap[activeCategory]) {
        url.searchParams.set('category', categoryMap[activeCategory].slug)
      } else {
        url.searchParams.delete('category')
      }
      if (productQuery.trim()) {
        url.searchParams.set('q', productQuery.trim())
      } else {
        url.searchParams.delete('q')
      }
    }
    const next = `${url.pathname}${url.search}${url.hash}`
    window.history.pushState({}, '', next)
    setRouteState(getRouteFromUrl())
  }

  const handleTopSearch = (value: string) => {
    setProductQuery(value)
    if (selectedProduct) {
      syncProductInUrl(null)
    } else {
      const url = new URL(window.location.href)
      if (value.trim()) {
        url.searchParams.set('q', value.trim())
      } else {
        url.searchParams.delete('q')
      }
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
      setRouteState(getRouteFromUrl())
    }
    setTimeout(() => {
      document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' })
    }, 0)
  }

  const openProduct = (product: Product) => {
    syncProductInUrl(product)
    setTimeout(() => {
      document.getElementById('product-detail')?.scrollIntoView({ behavior: 'smooth' })
    }, 0)
  }

  const closeProduct = () => {
    syncProductInUrl(null)
    setTimeout(() => {
      document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' })
    }, 0)
  }

  const goPrevDetailImage = () => {
    if (selectedProductImages.length <= 1) {
      return
    }
    setDetailImageIndex((prev) => (prev - 1 + selectedProductImages.length) % selectedProductImages.length)
  }

  const goNextDetailImage = () => {
    if (selectedProductImages.length <= 1) {
      return
    }
    setDetailImageIndex((prev) => (prev + 1) % selectedProductImages.length)
  }

  const goHome = () => {
    setIsAdminPage(false)
    setActiveCategory('all')
    window.history.pushState({}, '', '/')
    setRouteState(getRouteFromUrl())
    setTimeout(() => {
      document.getElementById('home')?.scrollIntoView({ behavior: 'smooth' })
    }, 0)
  }

  const goToSection = (sectionId: 'categories' | 'products') => {
    setIsAdminPage(false)
    if (selectedProduct) {
      syncProductInUrl(null)
    }
    setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' })
    }, 0)
  }

  const cartItems = Object.values(cart)
    .map((line) => {
      const product = productCatalog.find((item) => item.id === line.productId)
      return product ? { ...line, product } : null
    })
    .filter((item): item is CartLine & { product: Product } => Boolean(item))
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0)
  const subtotal = cartItems.reduce((sum, item) => sum + getResolvedUnitPrice(item.product, item.selectedOptions) * item.quantity, 0)
  const shipping = totalItems === 0 ? 0 : deliveryCost(subtotal)
  const total = subtotal + shipping

  const handleNextStep = () => {
    if (totalItems === 0) {
      setFormError(lang === 'fi' ? 'Lisää tuotteita koriin.' : 'Add items to cart.')
      return
    }
    if (!checkoutForm.company || !checkoutForm.contact || !checkoutForm.email || !checkoutForm.address) {
      setFormError(
        lang === 'fi'
          ? 'Täytä vähintään yritys, yhteyshenkilö, sähköposti ja osoite.'
          : 'Fill company, contact, email, and address.'
      )
      return
    }
    if (!isValidEmail(checkoutForm.email)) {
      setFormError(lang === 'fi' ? 'Anna kelvollinen sähköpostiosoite.' : 'Enter a valid email address.')
      return
    }
    setFormError('')
    setCheckoutStep(2)
  }

  const handleOrder = async () => {
    if (!checkoutForm.billingCompany || !checkoutForm.billingAddress) {
      setFormError(
        lang === 'fi'
          ? 'Täytä vähintään laskutusyritys ja laskutusosoite.'
          : 'Fill at least billing company and billing address.'
      )
      return
    }
    if (!isValidEmail(checkoutForm.email)) {
      setFormError(lang === 'fi' ? 'Anna kelvollinen sähköpostiosoite.' : 'Enter a valid email address.')
      return
    }
    setFormError('')
    setPlacingOrder(true)
    try {
      const payload = {
        lang,
        customer: checkoutForm,
        items: cartItems.map((item) => ({
          productId: item.product.id,
          name: item.product.name,
          quantity: item.quantity,
          unitPrice: getResolvedUnitPrice(item.product, item.selectedOptions),
          priceUnit: item.product.priceUnit,
          selectedOptions: item.selectedOptions,
        })),
        subtotal,
        shipping,
        total,
      }

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      const data = (await response.json()) as { orderId?: string; message?: string }
      if (!response.ok) {
        const friendlyMessage =
          data.message === 'No recipients defined'
            ? (lang === 'fi' ? 'Anna kelvollinen sähköpostiosoite.' : 'Enter a valid email address.')
            : data.message ?? (lang === 'fi' ? 'Tilauksen lähetys epäonnistui.' : 'Order submission failed.')
        setFormError(friendlyMessage)
        return
      }

      setLastOrderId(data.orderId ?? '')
      setOrderSent(true)
      setCart({})
      setCheckoutStep(1)
    } catch {
      setFormError(lang === 'fi' ? 'Tilauksen lähetys epäonnistui.' : 'Order submission failed.')
    } finally {
      setPlacingOrder(false)
    }
  }

  const openCheckout = () => {
    setShowCheckout(true)
    setCheckoutStep(1)
    setFormError('')
    setOrderSent(false)
    setLastOrderId('')
  }

  const closeCheckout = () => {
    setShowCheckout(false)
    setFormError('')
    setOrderSent(false)
    setLastOrderId('')
  }

  const handleAdminLogin = () => {
    if (adminUser === adminCreds.user && adminPass === adminCreds.pass) {
      setAdminAuthed(true)
      setAdminError('')
      setIsAdminPage(true)
      return
    }
    setAdminAuthed(false)
    setAdminError(lang === 'fi' ? 'Väärä käyttäjä tai salasana.' : 'Invalid username or password.')
  }

  const handleAdminLogout = () => {
    setAdminAuthed(false)
    setAdminUser('')
    setAdminPass('')
    setAdminError('')
    setIsAdminPage(false)
    setAdminOrders([])
    setAdminOrdersError('')
  }

  const adminAuthHeaders = () => ({
    'x-admin-user': adminUser || adminCreds.user,
    'x-admin-pass': adminPass || adminCreds.pass,
  })

  const syncCatalogState = (payload: CatalogPayload) => {
    const normalized = normalizeCatalog(payload)
    setProductCatalog(normalized.products)
    setCategories(normalized.categories)
  }

  const loadAdminOrders = async () => {
    setAdminOrdersLoading(true)
    setAdminOrdersError('')
    try {
      const response = await fetch('/api/orders', {
        headers: adminAuthHeaders(),
      })
      const payload = (await response.json()) as { orders?: AdminOrder[]; message?: string }
      if (!response.ok) {
        setAdminOrdersError(payload.message ?? (lang === 'fi' ? 'Tilausten haku epäonnistui.' : 'Failed to load orders.'))
        return
      }
      setAdminOrders(Array.isArray(payload.orders) ? payload.orders : [])
    } catch {
      setAdminOrdersError(lang === 'fi' ? 'Tilausten haku epäonnistui.' : 'Failed to load orders.')
    } finally {
      setAdminOrdersLoading(false)
    }
  }

  const markOrderShipped = async (orderId: string) => {
    setShipActionOrderId(orderId)
    setAdminOrdersError('')
    try {
      const response = await fetch(`/api/orders/${orderId}/shipped`, {
        method: 'POST',
        headers: adminAuthHeaders(),
      })
      const payload = (await response.json()) as { order?: AdminOrder; message?: string }
      if (!response.ok) {
        setAdminOrdersError(payload.message ?? (lang === 'fi' ? 'Lähetysviestin lähetys epäonnistui.' : 'Failed to send shipped email.'))
        return
      }
      if (payload.order) {
        setAdminOrders((prev) => prev.map((item) => (item.id === orderId ? payload.order! : item)))
      }
    } catch {
      setAdminOrdersError(lang === 'fi' ? 'Lähetysviestin lähetys epäonnistui.' : 'Failed to send shipped email.')
    } finally {
      setShipActionOrderId(null)
    }
  }

  const resetAdminForm = () => {
    setAdminProductForm({
      id: null,
      name: '',
      sku: '',
      category: '',
      price: '',
      priceUnit: lang === 'fi' ? '€ / kpl' : '€ / pc',
      unitNote: '',
      stock: '',
      images: [],
      description: '',
      seoTitle: '',
      metaDescription: '',
      searchKeywords: '',
      featured: false,
      featuredRank: '',
      optionGroups: [],
    })
    setAdminNewOptionGroupName('')
    setAdminImageUrl('')
    setAdminSeoTouched(false)
    setAdminMetaTouched(false)
    setAdminKeywordsTouched(false)
  }

  const saveAdminProduct = async () => {
    const name = adminProductForm.name.trim()
    const sku = adminProductForm.sku.trim()
    const category = normalizeCategoryId(adminProductForm.category)
    const price = Number(adminProductForm.price)
    const stock = Number(adminProductForm.stock)

    if (!name || !sku || !category || Number.isNaN(price) || Number.isNaN(stock)) {
      setAdminError(lang === 'fi' ? 'Täytä nimi, SKU, kategoria, hinta ja varasto.' : 'Fill name, SKU, category, price and stock.')
      return
    }

    const payload = {
      name,
      sku,
      category,
      price,
      priceUnit: adminProductForm.priceUnit.trim() || (lang === 'fi' ? '€ / kpl' : '€ / pc'),
      unitNote: adminProductForm.unitNote.trim() || undefined,
      stock,
      images: adminProductForm.images.length > 0 ? adminProductForm.images : ['/products/liquid-soap.svg'],
      description: adminProductForm.description.trim() || name,
      seoTitle: adminProductForm.seoTitle.trim(),
      metaDescription: adminProductForm.metaDescription.trim(),
      searchKeywords: adminProductForm.searchKeywords
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      featured: adminProductForm.featured,
      featuredRank: adminProductForm.featured ? Number(adminProductForm.featuredRank || 0) : undefined,
      optionGroups: parseAdminOptionGroups(adminProductForm.optionGroups),
    }

    try {
      const response = await fetch(adminProductForm.id ? `/api/admin/products/${adminProductForm.id}` : '/api/admin/products', {
        method: adminProductForm.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...adminAuthHeaders(),
        },
        body: JSON.stringify(payload),
      })
      const result = (await response.json()) as { catalog?: CatalogPayload; message?: string }
      if (!response.ok || !result.catalog) {
        setAdminError(result.message ?? (lang === 'fi' ? 'Tuotteen tallennus epäonnistui.' : 'Failed to save product.'))
        return
      }
      syncCatalogState(result.catalog)
      setAdminError('')
      resetAdminForm()
    } catch {
      setAdminError(lang === 'fi' ? 'Tuotteen tallennus epäonnistui.' : 'Failed to save product.')
    }
  }

  const addAdminImageFromUrl = () => {
    const next = adminImageUrl.trim()
    if (!next) {
      return
    }
    setAdminProductForm((prev) => ({ ...prev, images: [...prev.images, next] }))
    setAdminImageUrl('')
  }

  const removeAdminImage = (index: number) => {
    setAdminProductForm((prev) => ({ ...prev, images: prev.images.filter((_, idx) => idx !== index) }))
  }

  const addAdminOptionGroup = () => {
    const nextName = adminNewOptionGroupName.trim()
    if (!nextName) {
      setAdminError(lang === 'fi' ? 'Anna ensin valikon nimi.' : 'Enter the menu name first.')
      return
    }

    setAdminProductForm((prev) => ({
      ...prev,
      optionGroups: [...prev.optionGroups, { ...createAdminOptionGroup(), name: nextName }],
    }))
    setAdminNewOptionGroupName('')
    setAdminError('')
  }

  const updateAdminOptionGroup = (groupId: string, patch: Partial<AdminOptionGroupForm>) => {
    setAdminProductForm((prev) => ({
      ...prev,
      optionGroups: prev.optionGroups.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
    }))
  }

  const removeAdminOptionGroup = (groupId: string) => {
    setAdminProductForm((prev) => ({
      ...prev,
      optionGroups: prev.optionGroups.filter((group) => group.id !== groupId),
    }))
  }

  const addAdminOptionValue = (groupId: string) => {
    const targetGroup = adminProductForm.optionGroups.find((group) => group.id === groupId)
    if (!targetGroup) {
      return
    }

    if (!targetGroup.name.trim()) {
      setAdminError(lang === 'fi' ? 'Anna valikolle nimi ennen rivin lisäämistä.' : 'Name the menu before adding a row.')
      return
    }

    const label = targetGroup.draftLabel.trim()
    if (!label) {
      setAdminError(lang === 'fi' ? 'Anna vaihtoehdolle nimi ennen lisäämistä.' : 'Enter a name for the option before adding it.')
      return
    }

    setAdminProductForm((prev) => ({
      ...prev,
      optionGroups: prev.optionGroups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              values: [
                ...group.values,
                {
                  id: `value-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  label,
                  detail: targetGroup.draftDetail.trim(),
                  price: targetGroup.draftPrice.trim(),
                },
              ],
              draftLabel: '',
              draftDetail: '',
              draftPrice: '',
            }
          : group,
      ),
    }))
    setAdminError('')
  }

  const updateAdminOptionValue = (groupId: string, valueId: string, patch: Partial<AdminOptionValueForm>) => {
    setAdminProductForm((prev) => ({
      ...prev,
      optionGroups: prev.optionGroups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              values: group.values.map((value) => (value.id === valueId ? { ...value, ...patch } : value)),
            }
          : group,
      ),
    }))
  }

  const removeAdminOptionValue = (groupId: string, valueId: string) => {
    setAdminProductForm((prev) => ({
      ...prev,
      optionGroups: prev.optionGroups.map((group) =>
        group.id === groupId
          ? { ...group, values: group.values.filter((value) => value.id !== valueId) }
          : group,
      ),
    }))
  }

  const handleAdminImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) {
      return
    }
    files.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result
        if (typeof result === 'string') {
          setAdminProductForm((prev) => ({ ...prev, images: [...prev.images, result] }))
        }
      }
      reader.readAsDataURL(file)
    })
    event.target.value = ''
  }

  const editProductFromAdmin = (product: Product) => {
    const generatedTitle = buildSeoTitle(product.name, product.category, 'fi')
    const generatedDescription = buildMetaDescription(
      product.name,
      product.description,
      categoryMap[product.category]?.nameFi ?? product.category,
      'fi',
    )
    const generatedKeywords = buildSearchKeywords(product.name, categoryMap[product.category]?.nameFi ?? product.category, product.sku).join(', ')

    setAdminProductForm({
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      price: String(product.price),
      priceUnit: product.priceUnit,
      unitNote: product.unitNote ?? '',
      stock: String(product.stock),
      images: product.images ?? [product.image],
      description: product.description,
      seoTitle: product.seoTitle ?? generatedTitle,
      metaDescription: product.metaDescription ?? generatedDescription,
      searchKeywords: (product.searchKeywords ?? []).join(', ') || generatedKeywords,
      featured: Boolean(product.featured),
      featuredRank: product.featured ? String(product.featuredRank ?? 0) : '',
      optionGroups: formatAdminOptionGroups(product.optionGroups),
    })
    setAdminNewOptionGroupName('')
    setAdminImageUrl('')
    setAdminSeoTouched(Boolean(product.seoTitle && product.seoTitle !== generatedTitle))
    setAdminMetaTouched(Boolean(product.metaDescription && product.metaDescription !== generatedDescription))
    setAdminKeywordsTouched(Boolean(product.searchKeywords?.length && product.searchKeywords.join(', ') !== generatedKeywords))
  }

  const deleteProductFromAdmin = async (productId: string) => {
    try {
      const response = await fetch(`/api/admin/products/${productId}`, {
        method: 'DELETE',
        headers: adminAuthHeaders(),
      })
      const result = (await response.json()) as { catalog?: CatalogPayload; message?: string }
      if (!response.ok || !result.catalog) {
        setAdminError(result.message ?? (lang === 'fi' ? 'Tuotteen poisto epäonnistui.' : 'Failed to delete product.'))
        return
      }
      syncCatalogState(result.catalog)
      setAdminError('')
    } catch {
      setAdminError(lang === 'fi' ? 'Tuotteen poisto epäonnistui.' : 'Failed to delete product.')
      return
    }
    setCart((prev) => {
      return Object.fromEntries(Object.entries(prev).filter(([, item]) => item.productId !== productId))
    })
    if (selectedProduct?.id === productId) {
      syncProductInUrl(null)
    }
    if (adminProductForm.id === productId) {
      resetAdminForm()
    }
  }

  const addCategory = async () => {
    const nameFi = adminCategoryName.trim()
    const nameEn = adminCategoryNameEn.trim()
    if (!nameFi) {
      return
    }
    if (categories.some((item) => item.nameFi === nameFi || item.nameEn === nameEn)) {
      setAdminError(lang === 'fi' ? 'Kategoria on jo olemassa.' : 'Category already exists.')
      return
    }
    try {
      const response = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...adminAuthHeaders(),
        },
        body: JSON.stringify({ nameFi, nameEn }),
      })
      const result = (await response.json()) as { catalog?: CatalogPayload; message?: string }
      if (!response.ok || !result.catalog) {
        setAdminError(result.message ?? (lang === 'fi' ? 'Kategorian lisäys epäonnistui.' : 'Failed to add category.'))
        return
      }
      syncCatalogState(result.catalog)
      setAdminCategoryName('')
      setAdminCategoryNameEn('')
      setAdminError('')
    } catch {
      setAdminError(lang === 'fi' ? 'Kategorian lisäys epäonnistui.' : 'Failed to add category.')
    }
  }

  const deleteCategory = async (categoryId: string) => {
    try {
      const response = await fetch(`/api/admin/categories/${categoryId}`, {
        method: 'DELETE',
        headers: adminAuthHeaders(),
      })
      const result = (await response.json()) as { catalog?: CatalogPayload; message?: string }
      if (!response.ok || !result.catalog) {
        setAdminError(result.message ?? (lang === 'fi' ? 'Kategorian poisto epäonnistui.' : 'Failed to delete category.'))
        return
      }
      syncCatalogState(result.catalog)
      if (activeCategory === categoryId) {
        setActiveCategory('all')
      }
      setAdminError('')
    } catch {
      setAdminError(lang === 'fi' ? 'Kategorian poisto epäonnistui.' : 'Failed to delete category.')
    }
  }

  const moveCategory = async (categoryId: string, direction: -1 | 1) => {
    const currentIndex = categories.findIndex((item) => item.id === categoryId)
    const nextIndex = currentIndex + direction

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= categories.length) {
      return
    }

    const nextOrder = [...categories]
    const [moved] = nextOrder.splice(currentIndex, 1)
    nextOrder.splice(nextIndex, 0, moved)

    try {
      const response = await fetch('/api/admin/categories/reorder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...adminAuthHeaders(),
        },
        body: JSON.stringify({ order: nextOrder.map((item) => item.id) }),
      })
      const result = (await response.json()) as { catalog?: CatalogPayload; message?: string }
      if (!response.ok || !result.catalog) {
        setAdminError(result.message ?? (lang === 'fi' ? 'Kategorian järjestyksen päivitys epäonnistui.' : 'Failed to update category order.'))
        return
      }
      syncCatalogState(result.catalog)
      setAdminError('')
    } catch {
      setAdminError(lang === 'fi' ? 'Kategorian järjestyksen päivitys epäonnistui.' : 'Failed to update category order.')
    }
  }

  const updateCategoryDraft = (categoryId: string, patch: Partial<{ nameFi: string; nameEn: string }>) => {
    setAdminCategoryDrafts((prev) => ({
      ...prev,
      [categoryId]: {
        nameFi: prev[categoryId]?.nameFi ?? categoryMap[categoryId]?.nameFi ?? '',
        nameEn: prev[categoryId]?.nameEn ?? categoryMap[categoryId]?.nameEn ?? '',
        ...patch,
      },
    }))
  }

  const saveCategoryNames = async (categoryId: string) => {
    const draft = adminCategoryDrafts[categoryId]
    const nameFi = draft?.nameFi?.trim() ?? ''
    const nameEn = draft?.nameEn?.trim() ?? ''

    if (!nameFi || !nameEn) {
      setAdminError(lang === 'fi' ? 'Täytä kategorian nimi molemmilla kielillä.' : 'Fill category names in both languages.')
      return
    }

    try {
      const response = await fetch(`/api/admin/categories/${categoryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nameFi, nameEn }),
      })
      const result = (await response.json()) as { catalog?: CatalogPayload; message?: string }
      if (!response.ok || !result.catalog) {
        setAdminError(result.message ?? (lang === 'fi' ? 'Kategorian päivitys epäonnistui.' : 'Failed to update category.'))
        return
      }
      const normalized = normalizeCatalog(result.catalog)
      setCategories(normalized.categories)
      setProductCatalog(normalized.products)
      setAdminError('')
    } catch {
      setAdminError(lang === 'fi' ? 'Kategorian päivitys epäonnistui.' : 'Failed to update category.')
    }
  }

  const adminFilteredProducts = useMemo(() => {
    const q = adminQuery.trim().toLowerCase()
    return productCatalog.filter((item) => {
      const categoryTerms = categoryMap[item.category]
        ? `${categoryMap[item.category].nameFi} ${categoryMap[item.category].nameEn}`
        : item.category
      return q === '' ? true : `${item.name} ${item.sku} ${item.category} ${categoryTerms}`.toLowerCase().includes(q)
    }).sort(compareFeaturedPriority)
  }, [adminQuery, categoryMap, productCatalog])

  const adminPages = Math.max(1, Math.ceil(adminFilteredProducts.length / pageSize))
  const safeAdminPage = Math.min(adminPage, adminPages)
  const adminPageItems = adminFilteredProducts.slice((safeAdminPage - 1) * pageSize, safeAdminPage * pageSize)

  return (
    <div className="page">
      <header className="top">
        <a
          className="brand"
          href="/"
          aria-label="Suomen Paperitukku etusivu"
          onClick={(event) => {
            event.preventDefault()
            goHome()
          }}
        >
          <img src={brandLogo} alt="Suomen Paperitukku logo" />
        </a>
        <nav className="nav" aria-label={lang === 'fi' ? 'Päänavigaatio' : 'Main navigation'}>
          <a
            className="nav-button"
            href="/#categories"
            onClick={(event) => {
              event.preventDefault()
              goToSection('categories')
            }}
          >
            {t.nav[0]}
          </a>
          <a
            className="nav-button"
            href="/#products"
            onClick={(event) => {
              event.preventDefault()
              goToSection('products')
            }}
          >
            {t.nav[1]}
          </a>
        </nav>
        <div className="top-right">
          {!isAdminPage && (
            <div className="top-highlights" aria-label={lang === 'fi' ? 'Yhteys- ja toimitustiedot' : 'Contact and delivery details'}>
            <div className="top-highlight-card">
              <span className="top-highlight-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.61 2.61a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.47-1.27a2 2 0 0 1 2.11-.45c.84.28 1.71.49 2.61.61A2 2 0 0 1 22 16.92Z" />
                  </svg>
                </span>
                <div className="top-highlight-copy">
                  <strong>{lang === 'fi' ? 'Puhelin' : 'Phone'}</strong>
                  <span>{t.footer.phone}</span>
                </div>
              </div>
              <div className="top-highlight-card">
                <span className="top-highlight-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 17h4V5H2v12h3" />
                    <path d="M14 8h4l4 4v5h-3" />
                    <circle cx="7.5" cy="17.5" r="2.5" />
                    <circle cx="17.5" cy="17.5" r="2.5" />
                  </svg>
                </span>
                <div className="top-highlight-copy">
                  <strong>{lang === 'fi' ? 'Ilmainen toimitus' : 'Free delivery'}</strong>
                  <span>{lang === 'fi' ? `yli ${freeShippingThreshold} € tilauksille` : `for orders over ${freeShippingThreshold} €`}</span>
                </div>
              </div>
              <div className="top-highlight-card">
                <span className="top-highlight-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="M3 10h18" />
                    <path d="M7 15h3" />
                  </svg>
                </span>
                <div className="top-highlight-copy">
                  <strong>{lang === 'fi' ? 'Maksu laskulla' : 'Pay by invoice'}</strong>
                </div>
              </div>
            </div>
          )}
          <div className="actions">
          {!isAdminPage && (
            <>
              <div className="top-search">
                <span className="search-icon">{lang === 'fi' ? 'Haku' : 'Search'}</span>
                <input value={productQuery} onChange={(event) => handleTopSearch(event.target.value)} placeholder={t.search} />
              </div>
              <button className={`ghost cart-pill ${totalItems > 0 ? 'has-items' : ''}`} onClick={openCheckout}>
                <span>{t.cartTitle}: {totalItems}</span>
                {totalItems > 0 && <strong>{lang === 'fi' ? 'tilaa' : 'order'}</strong>}
              </button>
            </>
          )}
          {isAdminPage && (
            <button className="ghost" onClick={() => goToSection('products')}>
              {lang === 'fi' ? 'Takaisin kauppaan' : 'Back to store'}
            </button>
          )}
          <div className="lang">
            <button className={lang === 'fi' ? 'active' : ''} onClick={() => setLang('fi')}>
              FI
            </button>
            <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>
              EN
            </button>
          </div>
          </div>
        </div>
      </header>

      {!isAdminPage && cartToast && (
        <div className="cart-toast" role="status" aria-live="polite">
          <div className="cart-toast-head">
            <strong>
              {cartToast.quantity} {cartToast.quantity === 1 ? t.cartAddedSingle : t.cartAddedMulti}
            </strong>
            <button className="ghost tiny" type="button" onClick={() => setCartToast(null)}>
              x
            </button>
          </div>
          <div className="cart-toast-body">
            <img src={cartToast.image} alt={cartToast.productName} />
            <div>
              <span className="muted small">{cartToast.quantity}x</span>
              <strong>{cartToast.productName}</strong>
              {cartToast.selectedOptionsText && <span className="muted small">{cartToast.selectedOptionsText}</span>}
              <span>{formatPrice(cartToast.linePrice, lang)} €</span>
            </div>
          </div>
        </div>
      )}

      {!isAdminPage && freeShippingToast && !showCheckout && (
        <div className="free-shipping-banner" role="status" aria-live="polite">
          <span className="free-shipping-banner-icon">!</span>
          <span>{freeShippingToast.message}</span>
        </div>
      )}

      <main>
        {isAdminPage ? (
          <section className="section admin-page">
            <div className="admin-page-head">
              <h1>{t.adminTitle}</h1>
              <p className="muted">
                {lang === 'fi'
                  ? 'Kirjaudu sisään'
                  : 'Sign in to the management panel.'}
              </p>
            </div>
            {!adminAuthed ? (
              <div className="admin-login-page">
                <div className="admin-login">
                  <input
                    placeholder={t.adminLogin.user}
                    value={adminUser}
                    onChange={(event) => setAdminUser(event.target.value)}
                  />
                  <input
                    placeholder={t.adminLogin.pass}
                    type="password"
                    value={adminPass}
                    onChange={(event) => setAdminPass(event.target.value)}
                  />
                  {adminError && <div className="error">{adminError}</div>}
                  <button className="primary" type="button" onClick={handleAdminLogin}>
                    {t.adminLogin.login}
                  </button>
                  {t.adminLogin.hint ? <span className="muted small">{t.adminLogin.hint}</span> : null}
                </div>
              </div>
            ) : (
              <div className="admin-panel admin-page-panel">
                <form className="admin-form admin-form-wide" onSubmit={(event) => event.preventDefault()}>
                  <input
                    placeholder={t.adminForm.name}
                    value={adminProductForm.name}
                    onChange={(event) => setAdminProductForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                  <div className="admin-form-row">
                    <input
                      placeholder="SKU"
                      value={adminProductForm.sku}
                      onChange={(event) => setAdminProductForm((prev) => ({ ...prev, sku: event.target.value }))}
                    />
                    <input
                      placeholder={t.adminForm.stock}
                      type="number"
                      min={0}
                      value={adminProductForm.stock}
                      onChange={(event) => setAdminProductForm((prev) => ({ ...prev, stock: event.target.value }))}
                    />
                  </div>
                  <div className="admin-form-row">
                    <select
                      value={adminProductForm.category}
                      onChange={(event) => setAdminProductForm((prev) => ({ ...prev, category: event.target.value }))}
                    >
                      <option value="">{lang === 'fi' ? 'Valitse kategoria' : 'Select category'}</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {lang === 'fi' ? category.nameFi : category.nameEn}
                        </option>
                      ))}
                    </select>
                    <div className="admin-category-row">
                      <input
                        placeholder={lang === 'fi' ? 'Uusi kategoria (FI)' : 'New category (FI)'}
                        value={adminCategoryName}
                        onChange={(event) => setAdminCategoryName(event.target.value)}
                      />
                      <input
                        placeholder={lang === 'fi' ? 'Kategorian nimi (EN)' : 'Category name (EN)'}
                        value={adminCategoryNameEn}
                        onChange={(event) => setAdminCategoryNameEn(event.target.value)}
                      />
                      <button className="ghost tiny" type="button" onClick={addCategory}>
                        {lang === 'fi' ? 'Lisää' : 'Add'}
                      </button>
                    </div>
                  </div>
                  <div className="admin-form-row">
                    <input
                      placeholder={t.adminForm.price}
                      type="number"
                      min={0}
                      step="0.01"
                      value={adminProductForm.price}
                      onChange={(event) => setAdminProductForm((prev) => ({ ...prev, price: event.target.value }))}
                    />
                    <input
                      placeholder={lang === 'fi' ? 'Hintayksikkö' : 'Price unit'}
                      value={adminProductForm.priceUnit}
                      onChange={(event) => setAdminProductForm((prev) => ({ ...prev, priceUnit: event.target.value }))}
                    />
                  </div>
                  <div className="admin-form-row admin-priority-row">
                    <label className="admin-check">
                      <input
                        type="checkbox"
                        checked={adminProductForm.featured}
                        onChange={(event) =>
                          setAdminProductForm((prev) => ({
                            ...prev,
                            featured: event.target.checked,
                            featuredRank: event.target.checked ? (prev.featuredRank || '1') : '',
                          }))
                        }
                      />
                      <span>{lang === 'fi' ? 'Nosta suosituksi etusivulle' : 'Show in featured section'}</span>
                    </label>
                    <input
                      placeholder={lang === 'fi' ? 'Järjestys (1 = ensimmäinen)' : 'Order (1 = first)'}
                      type="number"
                      min={1}
                      value={adminProductForm.featuredRank}
                      disabled={!adminProductForm.featured}
                      onChange={(event) => setAdminProductForm((prev) => ({ ...prev, featuredRank: event.target.value }))}
                    />
                  </div>
                  <input
                    placeholder={lang === 'fi' ? 'Yksikköhuomio (valinnainen)' : 'Unit note (optional)'}
                    value={adminProductForm.unitNote}
                    onChange={(event) => setAdminProductForm((prev) => ({ ...prev, unitNote: event.target.value }))}
                  />
                  <div className="admin-image-row">
                    <input
                      placeholder={lang === 'fi' ? 'Kuvan URL (valinnainen)' : 'Image URL (optional)'}
                      value={adminImageUrl}
                      onChange={(event) => setAdminImageUrl(event.target.value)}
                    />
                    <button className="ghost tiny" type="button" onClick={addAdminImageFromUrl}>
                      {lang === 'fi' ? 'Lisää kuva' : 'Add image'}
                    </button>
                  </div>
                  <input type="file" accept="image/*" multiple onChange={handleAdminImageUpload} />
                  {adminProductForm.images.length > 0 && (
                    <div className="admin-image-grid">
                      {adminProductForm.images.map((image, index) => (
                        <div key={`${image}-${index}`} className="admin-image-item">
                          <img className="admin-image-preview" src={image} alt={`Product preview ${index + 1}`} />
                          <button className="ghost tiny danger" type="button" onClick={() => removeAdminImage(index)}>
                            {lang === 'fi' ? 'Poista' : 'Remove'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <textarea
                    rows={2}
                    placeholder={lang === 'fi' ? 'Kuvaus' : 'Description'}
                    value={adminProductForm.description}
                    onChange={(event) => setAdminProductForm((prev) => ({ ...prev, description: event.target.value }))}
                  />
                  <div className="admin-options-box">
                    <div className="admin-options-head">
                      <strong>{lang === 'fi' ? 'Tuotevalinnat' : 'Product options'}</strong>
                      <div className="admin-option-create">
                        <input
                          placeholder={lang === 'fi' ? 'Uuden valikon nimi, esim. Yksikkö tai Väri' : 'New menu name, e.g. Unit or Color'}
                          value={adminNewOptionGroupName}
                          onChange={(event) => setAdminNewOptionGroupName(event.target.value)}
                        />
                        <button className="ghost tiny" type="button" onClick={addAdminOptionGroup}>
                          {lang === 'fi' ? 'Luo valikko' : 'Create menu'}
                        </button>
                      </div>
                    </div>
                    {adminProductForm.optionGroups.length === 0 ? (
                      <div className="admin-option-default-preview">
                        <p className="muted small">
                          {lang === 'fi'
                            ? 'Jos et lisää omaa valikkoa, tuote näyttää automaattisesti yhden oletusrivin.'
                            : 'If you do not add a custom menu, the product will use one default row automatically.'}
                        </p>
                        <div className="admin-option-preview-table">
                          <div className="admin-option-preview-head">
                            <span>{lang === 'fi' ? 'Yksikkö' : 'Unit'}</span>
                            <span>{lang === 'fi' ? 'Määrä' : 'Qty'}</span>
                          </div>
                          <div className="admin-option-preview-row">
                            <span>{extractUnitLabel(adminProductForm.priceUnit || (lang === 'fi' ? '€ / kpl' : '€ / pc'), lang)}</span>
                            <span>1</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="admin-options-list">
                        {adminProductForm.optionGroups.map((group) => (
                          <div key={group.id} className="admin-option-group">
                            <div className="admin-option-group-head">
                              <div className="admin-option-group-title">
                                <strong>{lang === 'fi' ? 'Valikko' : 'Menu'}</strong>
                                <span className="muted small">
                                  {lang === 'fi' ? 'Esim. Yksikkö, Väri tai Koko' : 'For example Unit, Color, or Size'}
                                </span>
                              </div>
                              <input
                                placeholder={lang === 'fi' ? 'Valikon nimi, esim. Yksikkö tai Väri' : 'Menu name, e.g. Unit or Color'}
                                value={group.name}
                                onChange={(event) => updateAdminOptionGroup(group.id, { name: event.target.value })}
                              />
                              <button className="ghost tiny danger" type="button" onClick={() => removeAdminOptionGroup(group.id)}>
                                {lang === 'fi' ? 'Poista valikko' : 'Remove menu'}
                              </button>
                            </div>
                            <div className="admin-option-values">
                              <div className="admin-option-value-head">
                                <span>{lang === 'fi' ? 'Valinta' : 'Choice'}</span>
                                <span>{lang === 'fi' ? 'Määrä / lisätieto' : 'Qty / detail'}</span>
                                <span>{lang === 'fi' ? 'Hinta' : 'Price'}</span>
                                <span aria-hidden="true" />
                              </div>
                              {group.values.length === 0 && (
                                <p className="muted small admin-option-empty">
                                  {lang === 'fi' ? 'Tälle valikolle ei ole vielä rivejä. Lisää ensimmäinen vaihtoehto alta.' : 'This menu has no rows yet. Add the first option below.'}
                                </p>
                              )}
                              {group.values.map((value) => (
                                <div key={value.id} className="admin-option-value-row">
                                  <input
                                    placeholder={lang === 'fi' ? 'Valinta, esim. Lava' : 'Choice, e.g. Pallet'}
                                    value={value.label}
                                    onChange={(event) => updateAdminOptionValue(group.id, value.id, { label: event.target.value })}
                                  />
                                  <input
                                    placeholder={lang === 'fi' ? 'Määrä / lisätieto, esim. 100 kpl' : 'Qty / detail, e.g. 100 pcs'}
                                    value={value.detail}
                                    onChange={(event) => updateAdminOptionValue(group.id, value.id, { detail: event.target.value })}
                                  />
                                  <input
                                    placeholder={lang === 'fi' ? 'Hinta tälle valinnalle' : 'Price for this choice'}
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={value.price}
                                    onChange={(event) => updateAdminOptionValue(group.id, value.id, { price: event.target.value })}
                                  />
                                  <button className="ghost tiny danger" type="button" onClick={() => removeAdminOptionValue(group.id, value.id)}>
                                    {lang === 'fi' ? 'Poista' : 'Remove'}
                                  </button>
                                </div>
                              ))}
                              <div className="admin-option-add-row">
                                <input
                                  placeholder={lang === 'fi' ? 'Valinta, esim. Lava' : 'Choice, e.g. Pallet'}
                                  value={group.draftLabel}
                                  onChange={(event) => updateAdminOptionGroup(group.id, { draftLabel: event.target.value })}
                                />
                                <input
                                  placeholder={lang === 'fi' ? 'Määrä / lisätieto, esim. 100 kpl' : 'Qty / detail, e.g. 100 pcs'}
                                  value={group.draftDetail}
                                  onChange={(event) => updateAdminOptionGroup(group.id, { draftDetail: event.target.value })}
                                />
                                <input
                                  placeholder={lang === 'fi' ? 'Hinta tälle valinnalle' : 'Price for this choice'}
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={group.draftPrice}
                                  onChange={(event) => updateAdminOptionGroup(group.id, { draftPrice: event.target.value })}
                                />
                                <button className="primary tiny" type="button" onClick={() => addAdminOptionValue(group.id)}>
                                  {lang === 'fi' ? 'Hyväksy rivi' : 'Add row'}
                                </button>
                              </div>
                            </div>
                            <div className="admin-option-tools">
                              <span className="muted small">
                                {lang === 'fi'
                                  ? 'Kirjoita uusi rivi ja paina Hyväksy rivi. Jos hinnan antaa, se vaihtaa tuotesivun hinnan, korin ja tilauksen hinnan.'
                                  : 'Write the row and click Add row. If a price is set, it will control the product page, cart, and order price.'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
<div className="admin-seo-box">
                    <div className="admin-seo-head">
                      <strong>{lang === 'fi' ? 'SEO' : 'SEO'}</strong>
                      <div className="admin-seo-tools">
                        <span className="muted small">
                          {lang === 'fi' ? 'Täyttyy automaattisesti, mutta on muokattavissa.' : 'Filled automatically, but editable.'}
                        </span>
                        <button
                          className="ghost tiny"
                          type="button"
                          onClick={() => {
                            setAdminSeoTouched(false)
                            setAdminMetaTouched(false)
                            setAdminKeywordsTouched(false)
                            setAdminProductForm((prev) => ({
                              ...prev,
                              seoTitle: generatedAdminSeoTitle,
                              metaDescription: generatedAdminMetaDescription,
                              searchKeywords: generatedAdminKeywords,
                            }))
                          }}
                        >
                          {lang === 'fi' ? 'Palauta automaattinen' : 'Reset automatic'}
                        </button>
                      </div>
                    </div>
                    <input
                      placeholder={lang === 'fi' ? 'SEO-otsikko' : 'SEO title'}
                      value={adminProductForm.seoTitle}
                      onChange={(event) => {
                        setAdminSeoTouched(true)
                        setAdminProductForm((prev) => ({ ...prev, seoTitle: event.target.value }))
                      }}
                    />
                    <textarea
                      rows={3}
                      placeholder={lang === 'fi' ? 'Meta description' : 'Meta description'}
                      value={adminProductForm.metaDescription}
                      onChange={(event) => {
                        setAdminMetaTouched(true)
                        setAdminProductForm((prev) => ({ ...prev, metaDescription: event.target.value }))
                      }}
                    />
                    <textarea
                      rows={2}
                      placeholder={lang === 'fi' ? 'Hakutermit, erottele pilkulla' : 'Search keywords, comma separated'}
                      value={adminProductForm.searchKeywords}
                      onChange={(event) => {
                        setAdminKeywordsTouched(true)
                        setAdminProductForm((prev) => ({ ...prev, searchKeywords: event.target.value }))
                      }}
                    />
                  </div>
                  {adminError && <div className="error">{adminError}</div>}
                  <div className="admin-actions">
                    <button className="primary" type="button" onClick={saveAdminProduct}>
                      {adminProductForm.id ? (lang === 'fi' ? 'Päivitä tuote' : 'Update product') : (lang === 'fi' ? 'Lisää tuote' : 'Add product')}
                    </button>
                    {adminProductForm.id && (
                      <button className="ghost" type="button" onClick={resetAdminForm}>
                        {lang === 'fi' ? 'Peru muokkaus' : 'Cancel edit'}
                      </button>
                    )}
                    <button className="ghost" type="button" onClick={handleAdminLogout}>
                      {t.adminForm.logout}
                    </button>
                  </div>
                </form>

                <div className="admin-list">
                  <div className="admin-categories-list">
                    {categories.map((category, index) => (
                      <div key={category.id} className="admin-category-chip">
                        <div className="admin-category-fields">
                          <input
                            className="filter-input"
                            value={adminCategoryDrafts[category.id]?.nameFi ?? category.nameFi}
                            onChange={(event) => updateCategoryDraft(category.id, { nameFi: event.target.value })}
                            placeholder={lang === 'fi' ? 'Kategorian nimi (FI)' : 'Category name (FI)'}
                          />
                          <input
                            className="filter-input"
                            value={adminCategoryDrafts[category.id]?.nameEn ?? category.nameEn}
                            onChange={(event) => updateCategoryDraft(category.id, { nameEn: event.target.value })}
                            placeholder={lang === 'fi' ? 'Kategorian nimi (EN)' : 'Category name (EN)'}
                          />
                        </div>
                        <div className="admin-category-actions">
                          <button className="ghost tiny" type="button" onClick={() => saveCategoryNames(category.id)}>
                            {lang === 'fi' ? 'Tallenna' : 'Save'}
                          </button>
                          <button className="ghost tiny" type="button" disabled={index === 0} onClick={() => moveCategory(category.id, -1)}>
                            {lang === 'fi' ? 'Ylös' : 'Up'}
                          </button>
                          <button className="ghost tiny" type="button" disabled={index === categories.length - 1} onClick={() => moveCategory(category.id, 1)}>
                            {lang === 'fi' ? 'Alas' : 'Down'}
                          </button>
                          <button className="ghost tiny danger" type="button" onClick={() => deleteCategory(category.id)}>
                            {lang === 'fi' ? 'Poista' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="admin-list-head">
                    <input
                      className="filter-input"
                      placeholder={lang === 'fi' ? 'Hae tuotteita...' : 'Search products...'}
                      value={adminQuery}
                      onChange={(event) => setAdminQuery(event.target.value)}
                    />
                    <div className="pagination">
                      <button className="ghost tiny" disabled={safeAdminPage === 1} onClick={() => setAdminPage((prev) => Math.max(1, prev - 1))}>
                        {'<'}
                      </button>
                      <button className="ghost tiny">{safeAdminPage}</button>
                      <button className="ghost tiny" disabled={safeAdminPage === adminPages} onClick={() => setAdminPage((prev) => Math.min(adminPages, prev + 1))}>
                        {'>'}
                      </button>
                    </div>
                  </div>
                  <div className="admin-table">
                    {adminPageItems.map((item) => (
                      <div key={item.id} className="admin-row">
                        <div className="admin-row-main">
                          <img className="admin-row-image" src={getProductImage(item)} alt={getProductAlt(item)} />
                          <div>
                            <strong>{item.name}</strong>
                            <p className="muted small">{item.sku} · {getCategoryLabel(item.category)}</p>
                            {item.featured && <p className="admin-featured-badge">{lang === 'fi' ? 'Suositeltu' : 'Featured'} #{item.featuredRank ?? 0}</p>}
                          </div>
                        </div>
                        <div className="admin-row-meta">
                          <span>{formatPrice(item.price, lang)} €</span>
                          <span>{lang === 'fi' ? 'Varasto' : 'Stock'}: {item.stock}</span>
                          <button className="ghost tiny" onClick={() => editProductFromAdmin(item)}>
                            {lang === 'fi' ? 'Muokkaa' : 'Edit'}
                          </button>
                          <button className="ghost tiny danger" onClick={() => deleteProductFromAdmin(item.id)}>
                            {lang === 'fi' ? 'Poista' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    ))}
                    {adminPageItems.length === 0 && (
                      <p className="muted">{lang === 'fi' ? 'Ei tuotteita tällä haulla.' : 'No products for this search.'}</p>
                    )}
                  </div>

                  <div className="admin-orders">
                    <div className="admin-orders-head">
                      <h3>{lang === 'fi' ? 'Tilaukset' : 'Orders'}</h3>
                      <button className="ghost tiny" type="button" onClick={() => void loadAdminOrders()} disabled={adminOrdersLoading}>
                        {lang === 'fi' ? 'P\u00E4ivit\u00E4' : 'Refresh'}
                      </button>
                    </div>
                    {adminOrdersError && <div className="error">{adminOrdersError}</div>}
                    {adminOrdersLoading ? (
                      <p className="muted">{lang === 'fi' ? 'Haetaan tilauksia...' : 'Loading orders...'}</p>
                    ) : adminOrders.length === 0 ? (
                      <p className="muted">{lang === 'fi' ? 'Ei tilauksia viel\u00E4.' : 'No orders yet.'}</p>
                    ) : (
                      <div className="admin-orders-list">
                        {adminOrders.map((order) => (
                          <div key={order.id} className="admin-order-card">
                            <div className="admin-order-top">
                              <div>
                                <strong>{order.id}</strong>
                                <p className="muted small">{formatDateTime(order.createdAt, lang)}</p>
                              </div>
                              <span className={`order-badge ${order.status === 'shipped' ? 'is-shipped' : 'is-new'}`}>
                                {order.status === 'shipped'
                                  ? (lang === 'fi' ? 'Matkalla' : 'Shipped')
                                  : (lang === 'fi' ? 'Uusi' : 'New')}
                              </span>
                            </div>
                            <p className="small">
                              <strong>{order.customer.company}</strong> {'\u00B7'} {order.customer.contact} {'\u00B7'} {order.customer.email}
                            </p>
                            <p className="muted small">{order.customer.address}, {order.customer.zip} {order.customer.city}</p>
                            <div className="admin-order-items">
                              {order.items.map((item, index) => (
                                <div key={`${order.id}-${item.productId}-${index}`} className="admin-order-item">
                                  <span>
                                    {item.name}
                                    {item.selectedOptions && item.selectedOptions.length > 0 && (
                                      <span className="admin-order-option-text">{formatSelectedOptionsText(item.selectedOptions)}</span>
                                    )}
                                  </span>
                                  <span>{item.quantity} {'\u00D7'} {formatPrice(item.unitPrice, lang)} {'\u20AC'}</span>
                                </div>
                              ))}
                            </div>
                            <div className="admin-order-footer">
                              <strong>{lang === 'fi' ? 'Yhteens\u00E4' : 'Total'}: {formatPrice(order.total, lang)} {'\u20AC'}</strong>
                              <button
                                className="ghost tiny"
                                type="button"
                                disabled={order.status === 'shipped' || shipActionOrderId === order.id}
                                onClick={() => void markOrderShipped(order.id)}
                              >
                                {order.status === 'shipped'
                                  ? (lang === 'fi' ? 'L\u00E4hetetty' : 'Shipped')
                                  : shipActionOrderId === order.id
                                    ? (lang === 'fi' ? 'L\u00E4hetet\u00E4\u00E4n...' : 'Sending...')
                                    : (lang === 'fi' ? 'Merkitse matkalla + email' : 'Mark shipped + email')}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : (
        selectedProduct ? (
          <section className="section product-detail" id="product-detail">
            <nav className="breadcrumbs" aria-label="Breadcrumb">
              <a href="/" onClick={(event) => { event.preventDefault(); goHome() }}>
                {lang === 'fi' ? 'Etusivu' : 'Home'}
              </a>
              <span aria-hidden="true">/</span>
              {selectedCategory ? (
                <a
                  href={getCategoryHref(selectedCategory)}
                  onClick={(event) => {
                    event.preventDefault()
                    window.history.pushState({}, '', getCategoryHref(selectedCategory))
                    setRouteState(getRouteFromUrl())
                    setActiveCategory(selectedCategory.id)
                    setTimeout(() => {
                      document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' })
                    }, 0)
                  }}
                >
                  {lang === 'fi' ? selectedCategory.nameFi : selectedCategory.nameEn}
                </a>
              ) : (
                <span>{lang === 'fi' ? 'Tuotteet' : 'Products'}</span>
              )}
              <span aria-hidden="true">/</span>
              <span>{selectedProduct.name}</span>
            </nav>
            <button className="ghost back" onClick={closeProduct}>
              ← {t.backToProducts}
            </button>
            <div className="detail-layout">
              <div className="detail-media">
                <div className="detail-image-wrap">
                  <img
                    key={selectedProductImages[detailImageIndex] ?? getProductImage(selectedProduct)}
                    className="detail-image detail-image-fade"
                    src={selectedProductImages[detailImageIndex] ?? getProductImage(selectedProduct)}
                    alt={getProductAlt(selectedProduct)}
                  />
                  {selectedProductImages.length > 1 && (
                    <>
                      <button className="detail-arrow detail-arrow-left" type="button" onClick={goPrevDetailImage} aria-label={lang === 'fi' ? 'Edellinen kuva' : 'Previous image'}>
                        ‹
                      </button>
                      <button className="detail-arrow detail-arrow-right" type="button" onClick={goNextDetailImage} aria-label={lang === 'fi' ? 'Seuraava kuva' : 'Next image'}>
                        ›
                      </button>
                    </>
                  )}
                </div>
                {selectedProductImages.length > 1 && (
                  <div className="detail-thumbs">
                    {selectedProductImages.map((image, index) => (
                      <button
                        key={`${image}-${index}`}
                        className={`detail-thumb ${detailImageIndex === index ? 'active' : ''}`}
                        type="button"
                        onClick={() => setDetailImageIndex(index)}
                      >
                        <img src={image} alt={`${getProductAlt(selectedProduct)} ${index + 1}`} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="detail-info">
                <h1>{selectedProduct.name}</h1>
                <p className="muted detail-description">{selectedProduct.description}</p>
                <div className="price-block">
                  <span className="muted">
                    {formatPrice(grossPrice(selectedProductUnitPrice), lang)} € {lang === 'fi' ? '(sis. alv)' : '(incl. VAT)'}
                  </span>
                  <span className="price-top">
                    <span className="price-main">{formatPrice(selectedProductUnitPrice, lang)} €</span>
                    <span className="price-suffix">{getPriceUnitSuffix(selectedProduct.priceUnit, t.product.vatNote)}</span>
                  </span>
                  {selectedProduct.unitNote && <span className="muted">{selectedProduct.unitNote}</span>}
                </div>
                {selectedProductOptionGroups.length > 0 && (
                  <div className="product-options">
                    {selectedProductOptionGroups.map((group) => (
                      <div key={group.id} className="product-option-group">
                        <div className="product-option-group-head">
                          <strong>{group.name}</strong>
                          {group.values.some((value) => value.detail || value.price !== undefined) && (
                            <span className="muted small">{getOptionMetaHeader(group.name, lang)}</span>
                          )}
                        </div>
                        <div className="product-option-list">
                          {group.values.map((value) => {
                            const checked = (selectedOptionSelections[group.id] || group.values[0]?.id) === value.id
                            return (
                              <label key={value.id} className={`product-option-row ${checked ? 'active' : ''}`}>
                                <span className="product-option-main">
                                  <input
                                    type="radio"
                                    name={`product-option-${group.id}`}
                                    checked={checked}
                                    onChange={() => setSelectedOptionSelections((prev) => ({ ...prev, [group.id]: value.id }))}
                                  />
                                  <span>{value.label}</span>
                                </span>
                                <span className="muted">{formatOptionValueMeta(group.name, value.detail, value.price, lang, selectedProduct.priceUnit)}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="stock-note">
                  {lang === 'fi' ? 'Varastossa' : 'In stock'}
                </p>
                <div className="detail-actions">
                  <div className="qty-selector">
                    <button className="ghost tiny" onClick={() => setSelectedQuantity((prev) => Math.max(1, prev - 1))}>
                      -
                    </button>
                    <span>{selectedQuantity}</span>
                    <button className="ghost tiny" onClick={() => setSelectedQuantity((prev) => prev + 1)}>
                      +
                    </button>
                  </div>
                  <button className="primary" onClick={() => addToCart(selectedProduct, selectedQuantity, selectedProductOptions)}>
                    {t.add}
                  </button>
                </div>
              </div>
            </div>
            <div className="related">
              <h3>{t.related}</h3>
              <div className="grid related-grid">
                {relatedProducts.map((item) => (
                  <div key={item.id} className="card related-card">
                    <a
                      className="related-link"
                      href={getProductHref(item)}
                      onClick={(event) => {
                        event.preventDefault()
                        openProduct(item)
                      }}
                    >
                      <img className="product-image" src={getProductImage(item)} alt={getProductAlt(item)} />
                      <strong className="product-name">{item.name}</strong>
                    </a>
                    <button className="ghost" onClick={() => openProduct(item)}>
                      {t.view}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <>
        <section className="hero" id="home" style={heroStyle}>
          <h1>{t.heroTitle}</h1>
          <p>{t.heroText}</p>
          <div className="cta">
            <button className="primary" onClick={() => goToSection('products')}>
              {t.ctaShop}
            </button>
          </div>
        </section>

        <section className="section" id="categories">
          <h2 className="sr-only">{t.categoriesTitle}</h2>
          <div className="category-grid">
            <button className={`category-card ${activeCategory === 'all' ? 'active' : ''}`} onClick={() => setActiveCategory('all')}>
              <strong>{lang === 'fi' ? 'Kaikki tuotteet' : 'All products'}</strong>
            </button>
            {categoriesForFilters.map((item) => (
              <button key={item.id} className={`category-card ${activeCategory === item.id ? 'active' : ''}`} onClick={() => setActiveCategory(item.id)}>
                <strong>{lang === 'fi' ? item.nameFi : item.nameEn}</strong>
              </button>
            ))}
          </div>
        </section>

        {showFeaturedHomeSection && featuredHomeProducts.length > 0 && (
          <section className="section featured-section">
            <div className="products-header">
              <div>
                <h2>{t.featuredTitle}</h2>
                <p className="muted">{t.featuredText}</p>
              </div>
            </div>
            <div className="grid featured-grid">
              {featuredHomeProducts.map((item) => (
                <div key={`featured-${item.id}`} className="card product-card featured-card">
                  <a
                    className="product-card-button"
                    href={getProductHref(item)}
                    onClick={(event) => {
                      event.preventDefault()
                      openProduct(item)
                    }}
                  >
                    <div className="product-link">
                      <img className="product-image" src={getProductImage(item)} alt={getProductAlt(item)} loading="lazy" />
                      <strong className="product-name">{item.name}</strong>
                    </div>
                    <div className="product-body">
                      <div className="availability">
                        <span className={`status status-${getStockTone(item.stock)}`}>
                          <span className="dot" /> {getStockLabel(item.stock, lang)}
                        </span>
                      </div>
                      <div className="price-block">
                        <span className="muted">
                          {formatPrice(grossPrice(item.price), lang)} € {lang === 'fi' ? '(sis. alv)' : '(incl. VAT)'}
                        </span>
                        <span className="price-top">
                          <span className="price-main">{formatPrice(item.price, lang)} €</span>
                          <span className="price-suffix">{getPriceUnitSuffix(item.priceUnit, t.product.vatNote)}</span>
                        </span>
                        {item.unitNote && <span className="muted">{item.unitNote}</span>}
                      </div>
                    </div>
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="section products-section" id="products">
          <div className="products-header">
            <div>
              <h2>{t.productsTitle}</h2>
              <p className="products-info-line">{t.productsNote}</p>
              <p className="products-info-line">{t.productsBillingNote}</p>
              <p className="products-info-line shipping-note">{t.productsFreeShippingNote}</p>
            </div>
          </div>
          <div className="sort sort-floating">
            <span className="muted">{lang === 'fi' ? 'Lajittelu' : 'Sort'}</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as 'relevance' | 'price' | 'name')}>
              <option value="relevance">{lang === 'fi' ? 'Relevanssi' : 'Relevance'}</option>
              <option value="price">{lang === 'fi' ? 'Hinta' : 'Price'}</option>
              <option value="name">{lang === 'fi' ? 'Nimi' : 'Name'}</option>
            </select>
          </div>
          <div className="products-meta">
            <span className="muted">
              {t.productsShown} {totalCount === 0 ? 0 : `${listStart + 1}-${Math.min(listStart + pageSize, totalCount)}`} / {totalCount}
            </span>
            <div className="meta-right">
              <div className="pagination">
                <button className="ghost tiny" disabled={safeCurrentPage === 1} onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}>
                  {'<'}
                </button>
                <button className="ghost tiny">{safeCurrentPage}</button>
                <button className="ghost tiny" disabled={safeCurrentPage === totalPages} onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}>
                  {'>'}
                </button>
              </div>
            </div>
          </div>
          <div className="filters-bar">
            <details className="filter-group">
              <summary>{t.filtersTitle}</summary>
              <div className="filter-panel">
                <div className="filter-block">
                  <span className="filter-title">{t.categoriesTitle}</span>
                  <div className="filter-inline">
                    <button className={`ghost tiny ${activeCategory === 'all' ? 'active-filter' : ''}`} onClick={() => setActiveCategory('all')}>
                      {lang === 'fi' ? 'Kaikki' : 'All'}
                    </button>
                    {categoriesForFilters.map((item) => (
                      <button
                        key={item.id}
                        className={`ghost tiny ${activeCategory === item.id ? 'active-filter' : ''}`}
                        onClick={() => setActiveCategory(item.id)}
                      >
                        {lang === 'fi' ? item.nameFi : item.nameEn}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="filter-block">
                  <span className="filter-title">{t.search}</span>
                  <input className="filter-input" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder={t.search} />
                </div>
                <button className="ghost tiny" onClick={() => { setProductQuery(''); setActiveCategory('all') }}>{t.clearFilters}</button>
              </div>
            </details>
          </div>
          <div className="grid products-grid">
            {pagedProducts.map((item) => (
              <div key={item.id} className="card product-card">
                <a
                  className="product-card-button"
                  href={getProductHref(item)}
                  onClick={(event) => {
                    event.preventDefault()
                    openProduct(item)
                  }}
                >
                  <div className="product-link">
                    <img className="product-image" src={getProductImage(item)} alt={getProductAlt(item)} loading="lazy" />
                    <strong className="product-name">{item.name}</strong>
                  </div>
                  <div className="product-body">
                    <div className="availability">
                      <span className={`status status-${getStockTone(item.stock)}`}>
                        <span className="dot" /> {getStockLabel(item.stock, lang)}
                      </span>
                    </div>
                    <div className="price-block">
                      <span className="muted">
                        {formatPrice(grossPrice(item.price), lang)} € {lang === 'fi' ? '(sis. alv)' : '(incl. VAT)'}
                      </span>
                      <span className="price-top">
                        <span className="price-main">{formatPrice(item.price, lang)} €</span>
                        <span className="price-suffix">{getPriceUnitSuffix(item.priceUnit, t.product.vatNote)}</span>
                      </span>
                      {item.unitNote && <span className="muted">{item.unitNote}</span>}
                    </div>
                  </div>
                </a>
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="products-pagination-bottom">
              <div className="pagination">
                <button className="ghost tiny" disabled={safeCurrentPage === 1} onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}>
                  {'<'}
                </button>
                <button className="ghost tiny">{safeCurrentPage}</button>
                <button className="ghost tiny" disabled={safeCurrentPage === totalPages} onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}>
                  {'>'}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="section contact">
          <button className="contact-toggle" onClick={() => setShowContactPanel((prev) => !prev)}>
            {t.contactTitle}
          </button>
          {showContactPanel ? (
            <div className="contact-layout">
              <div className="contact-info">
                <div className="contact-info-card">
                  <strong>{lang === 'fi' ? 'Sähköposti' : 'Email'}</strong>
                  <a href="mailto:suomenpaperitukku@gmail.com">suomenpaperitukku@gmail.com</a>
                </div>
                <div className="contact-info-card">
                  <strong>{lang === 'fi' ? 'Puhelinnumero' : 'Phone number'}</strong>
                  <a href={`tel:${t.footer.phone.replace(/\s+/g, '')}`}>{t.footer.phone}</a>
                  <span className="muted">{lang === 'fi' ? 'Ma-Pe 8:00-17:00' : 'Mon-Fri 8:00-17:00'}</span>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h2>{t.contactTitle}</h2>
              <p className="muted">{t.contactText}</p>
            </div>
          )}
        </section>
          </>
        ))}
      </main>

      {!isAdminPage && <footer className="footer">
        <div>
          <strong>{t.footer.brand}</strong>
          <p>{t.footer.service}</p>
          <p>{t.footer.phone}</p>
          <p>{t.footer.email}</p>
          <button
            className="footer-admin-link"
            type="button"
            onClick={() => {
              setIsAdminPage(true)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          >
            {t.nav[2]}
          </button>
        </div>
        <div>
          <p>{t.footer.address}</p>
          {t.footer.hours ? <p>{t.footer.hours}</p> : null}
          <p>{t.footer.legal}</p>
        </div>
      </footer>}

      {showCheckout && !isAdminPage && (
        <div className="checkout-overlay">
          <div className="checkout-backdrop" onClick={closeCheckout} />
          <section className="checkout-panel" id="checkout">
            <div className="checkout-top">
              <div>
                <h2>{t.checkoutTitle}</h2>
                <p className="muted">
                  {orderSent
                    ? (lang === 'fi' ? 'Tilauksesi on vastaanotettu.' : 'Your order has been received.')
                    : t.checkoutNote}
                </p>
              </div>
              <button className="ghost small" onClick={closeCheckout}>
                {t.checkoutClose}
              </button>
            </div>

            {!orderSent && (
              <div className="checkout-steps">
                <div className={`step-chip ${checkoutStep === 1 ? 'active' : 'done'}`}>
                  <span>1</span>
                  <strong>{t.checkoutStepInfo}</strong>
                </div>
                <div className={`step-chip ${checkoutStep === 2 ? 'active' : ''}`}>
                  <span>2</span>
                  <strong>{t.checkoutStepBilling}</strong>
                </div>
              </div>
            )}

            <div className="checkout">
              <div>
                {orderSent && (
                  <div className="order-success-shell">
                    <div className="order-confetti" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="success order-success">
                      <div className="order-success-check" aria-hidden="true">✓</div>
                      <h3>{lang === 'fi' ? 'Tilaus valmis' : 'Order complete'}</h3>
                      <p>{t.checkoutSuccess}</p>
                      {lastOrderId && <p className="order-id">{lang === 'fi' ? 'Tilausnumero' : 'Order ID'}: <strong>{lastOrderId}</strong></p>}
                      <div className="order-success-actions">
                        <button className="primary" type="button" onClick={closeCheckout}>
                          {lang === 'fi' ? 'Jatka ostoksia' : 'Continue shopping'}
                        </button>
                        <button
                          className="ghost"
                          type="button"
                          onClick={() => {
                            closeCheckout()
                            goHome()
                          }}
                        >
                          {lang === 'fi' ? 'Takaisin kotisivuun' : 'Back to home'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {formError && <div className="error">{formError}</div>}
                {!orderSent && (
                  <form className="checkout-form">
                    {checkoutStep === 1 ? (
                      <>
                        <div className="field">
                          <label>{t.form.company}</label>
                          <input value={checkoutForm.company} onChange={(e) => updateForm('company', e.target.value)} />
                        </div>
                        <div className="field">
                          <label>{t.form.contact}</label>
                          <input value={checkoutForm.contact} onChange={(e) => updateForm('contact', e.target.value)} />
                        </div>
                        <div className="field">
                          <label>{t.form.email}</label>
                          <input type="email" value={checkoutForm.email} onChange={(e) => updateForm('email', e.target.value)} />
                        </div>
                        <div className="field">
                          <label>{t.form.phone}</label>
                          <input value={checkoutForm.phone} onChange={(e) => updateForm('phone', e.target.value)} />
                        </div>
                        <div className="field">
                          <label>{t.form.address}</label>
                          <input value={checkoutForm.address} onChange={(e) => updateForm('address', e.target.value)} />
                        </div>
                        <div className="form-row">
                          <div className="field">
                            <label>{t.form.zip}</label>
                            <input value={checkoutForm.zip} onChange={(e) => updateForm('zip', e.target.value)} />
                          </div>
                          <div className="field">
                            <label>{t.form.city}</label>
                            <input value={checkoutForm.city} onChange={(e) => updateForm('city', e.target.value)} />
                          </div>
                        </div>
                        <button className="primary" type="button" onClick={handleNextStep}>
                          {t.checkoutContinue}
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="field">
                          <label>{t.form.billingCompany}</label>
                          <input
                            value={checkoutForm.billingCompany}
                            onChange={(e) => updateForm('billingCompany', e.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label>{t.form.billingAddress}</label>
                          <input
                            value={checkoutForm.billingAddress}
                            onChange={(e) => updateForm('billingAddress', e.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label>{t.form.notes}</label>
                          <textarea rows={3} value={checkoutForm.notes} onChange={(e) => updateForm('notes', e.target.value)} />
                        </div>
                        <div className="checkout-form-actions">
                          <button className="ghost" type="button" onClick={() => setCheckoutStep(1)}>
                            {t.checkoutBack}
                          </button>
                          <button className="primary" type="button" onClick={handleOrder} disabled={placingOrder}>
                            {placingOrder ? (lang === 'fi' ? 'Lähetetään...' : 'Sending...') : (lang === 'fi' ? 'Lähetä tilaus' : 'Send order')}
                          </button>
                        </div>
                      </>
                    )}
                  </form>
                )}
              </div>
              {!orderSent && (
                <aside className="cart">
                <div className="cart-header">
                  <h3>{t.cartTitle}</h3>
                  {totalItems > 0 && (
                    <button className="ghost small" onClick={clearCart}>
                      {t.clearCart}
                    </button>
                  )}
                </div>
                {cartItems.length === 0 ? (
                  <p className="muted">{t.cartEmpty}</p>
                ) : (
                  <div className="cart-items">
                    {cartItems.map((item) => (
                      <div key={item.id} className="cart-item">
                        <div className="cart-item-info">
                          <strong>{item.product.name}</strong>
                          {item.selectedOptions.length > 0 && (
                            <span className="muted small">{formatSelectedOptionsText(item.selectedOptions)}</span>
                          )}
                          <span className="tag">
                            {formatPrice(getResolvedUnitPrice(item.product, item.selectedOptions), lang)} {item.product.priceUnit}
                          </span>
                        </div>
                        <div className="cart-actions">
                          <button className="ghost" onClick={() => updateCartLineQuantity(item.id, -1)}>
                            -
                          </button>
                          <span>{item.quantity}</span>
                          <button className="ghost" onClick={() => updateCartLineQuantity(item.id, 1)}>
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="cart-summary">
                  <div>
                    <span>{t.subtotal}</span>
                    <strong>{formatPrice(subtotal, lang)} €</strong>
                  </div>
                  <div>
                    <span>{t.delivery}</span>
                    <strong>{totalItems === 0 ? '-' : formatDelivery(shipping, lang)}</strong>
                  </div>
                  <div className="cart-total">
                    <span>{t.total}</span>
                    <strong>{formatPrice(total, lang)} €</strong>
                  </div>
                </div>
                </aside>
              )}
            </div>
        </section>
        </div>
      )}

    </div>
  )
}

export default App
