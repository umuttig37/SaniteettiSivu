import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties } from 'react'
import './App.css'
import brandLogo from './assets/paperitukkuLogo.png'
import heroBgImage from './assets/high-angle-hand-disinfecting-laptop-desk.jpg'

type Lang = 'fi' | 'en'

type Product = {
  id: string
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
  nameFi: string
  nameEn: string
}

type OrderStatus = 'new' | 'shipped'

type AdminOrderItem = {
  productId: string
  name: string
  quantity: number
  unitPrice: number
  priceUnit: string
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
    productsNote: 'Toimitus 1–3 arkipäivässä. Lasku 14 pv.',
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
    productsNote: 'Delivery in 1–3 business days. Net 14 days.',
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

const productStorageKey = 'saniteetti-products-v1'
const categoriesStorageKey = 'saniteetti-categories-v1'
const pageSize = 16
const defaultCategories: CategoryDef[] = [
  { id: 'WC-paperit', nameFi: 'WC-paperit', nameEn: 'Toilet paper' },
  { id: 'K?sipyyhkeet', nameFi: 'K?sipyyhkeet', nameEn: 'Hand towels' },
  { id: 'Saippuat', nameFi: 'Saippuat', nameEn: 'Soaps' },
  { id: 'Puhdistus', nameFi: 'Puhdistus', nameEn: 'Cleaning' },
  { id: 'J?tes?kit', nameFi: 'J?tes?kit', nameEn: 'Waste bags' },
]
const vatMultiplier = 1.255
const categoryAliases = defaultCategories.reduce<Record<string, string>>((acc, item) => {
  acc[item.id] = item.id
  acc[item.nameFi] = item.id
  acc[item.nameEn] = item.id
  return acc
}, { Other: 'Muut', Muut: 'Muut' })

const getProductIdFromUrl = () => {
  if (typeof window === 'undefined') {
    return null
  }
  return new URLSearchParams(window.location.search).get('product')
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

const deliveryCost = (subtotal: number) => (subtotal >= 250 ? 0 : 15)

const formatDelivery = (value: number, lang: Lang) => {
  if (value === 0) {
    return lang === 'fi' ? 'Ilmainen' : 'Free'
  }
  return `${formatPrice(value, lang)} €`
}

const grossPrice = (value: number) => value * vatMultiplier

const normalizeCategoryId = (rawCategory: string) => {
  const trimmed = rawCategory.trim()
  if (!trimmed) {
    return 'Muut'
  }
  return categoryAliases[trimmed] ?? trimmed
}

const normalizeCategoryDef = (item: CategoryDef | string): CategoryDef => {
  if (typeof item === 'string') {
    const id = normalizeCategoryId(item)
    return { id, nameFi: id, nameEn: id }
  }
  const id = normalizeCategoryId(item.id || item.nameFi || item.nameEn)
  return {
    id,
    nameFi: item.nameFi?.trim() || id,
    nameEn: item.nameEn?.trim() || item.nameFi?.trim() || id,
  }
}

const normalizeProduct = (product: Product): Product => {
  const images = Array.isArray(product.images) && product.images.length > 0 ? product.images : [product.image]
  return {
    ...product,
    category: normalizeCategoryId(product.category),
    image: images[0],
    images,
  }
}

const getProductImage = (product: Product) => (product.images && product.images.length > 0 ? product.images[0] : product.image)

const getRelated = (items: Product[], currentId: string) => {
  return items.filter((item) => item.id !== currentId).slice(0, 3)
}

function App() {
  const [lang, setLang] = useState<Lang>('fi')
  const [productCatalog, setProductCatalog] = useState<Product[]>(() => {
    if (typeof window === 'undefined') {
      return products.fi.map(normalizeProduct)
    }
    const raw = window.localStorage.getItem(productStorageKey)
    if (!raw) {
      return products.fi.map(normalizeProduct)
    }
    try {
      const parsed = JSON.parse(raw) as Product[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(normalizeProduct)
      }
    } catch {
      // Fall back to defaults if persisted value is invalid.
    }
    return products.fi.map(normalizeProduct)
  })
  const [categories, setCategories] = useState<CategoryDef[]>(() => {
    if (typeof window === 'undefined') {
      return defaultCategories
    }
    const raw = window.localStorage.getItem(categoriesStorageKey)
    if (!raw) {
      return defaultCategories
    }
    try {
      const parsed = JSON.parse(raw) as Array<string | CategoryDef>
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(normalizeCategoryDef)
      }
    } catch {
      // Fall back to defaults if persisted value is invalid.
    }
    return defaultCategories
  })
  const [cart, setCart] = useState<Record<string, number>>({})
  const [orderSent, setOrderSent] = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState<1 | 2>(1)
  const [isAdminPage, setIsAdminPage] = useState(false)
  const [adminUser, setAdminUser] = useState('')
  const [adminPass, setAdminPass] = useState('')
  const [adminError, setAdminError] = useState('')
  const [adminAuthed, setAdminAuthed] = useState(false)
  const [productQuery, setProductQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [sortBy, setSortBy] = useState<'relevance' | 'price' | 'name'>('relevance')
  const [adminQuery, setAdminQuery] = useState('')
  const [adminPage, setAdminPage] = useState(1)
  const [adminCategoryName, setAdminCategoryName] = useState('')
  const [adminCategoryNameEn, setAdminCategoryNameEn] = useState('')
  const [selectedQuantity, setSelectedQuantity] = useState(1)
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
  })
  const [selectedProductId, setSelectedProductId] = useState<string | null>(() => getProductIdFromUrl())
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

  const filteredProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase()
    let next = productCatalog.filter((item) => {
      const categoryTerms = categoryMap[item.category]
        ? `${categoryMap[item.category].nameFi} ${categoryMap[item.category].nameEn}`
        : item.category
      const haystack = `${item.name} ${item.sku} ${item.description} ${item.category} ${categoryTerms}`.toLowerCase()
      const matchesQuery = query === '' || haystack.includes(query)
      const matchesCategory = activeCategory === 'all' || item.category === activeCategory
      return matchesQuery && matchesCategory
    })

    if (sortBy === 'price') {
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
  const selectedProduct = selectedProductId ? productCatalog.find((item) => item.id === selectedProductId) : null
  const selectedProductImages = selectedProduct ? (selectedProduct.images.length > 0 ? selectedProduct.images : [selectedProduct.image]) : []
  const relatedProducts = selectedProduct ? getRelated(productCatalog, selectedProduct.id) : []

  useEffect(() => {
    window.localStorage.setItem(productStorageKey, JSON.stringify(productCatalog))
  }, [productCatalog])

  useEffect(() => {
    window.localStorage.setItem(categoriesStorageKey, JSON.stringify(categories))
  }, [categories])

  useEffect(() => {
    setCurrentPage(1)
  }, [productQuery, activeCategory, sortBy])

  useEffect(() => {
    setSelectedQuantity(1)
    setDetailImageIndex(0)
  }, [selectedProductId])

  useEffect(() => {
    const onPopState = () => {
      setSelectedProductId(getProductIdFromUrl())
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    setAdminPage(1)
  }, [adminQuery])

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

  const addToCart = (product: Product, quantity = 1) => {
    setOrderSent(false)
    const qty = Math.max(1, quantity)
    setCart((prev) => ({ ...prev, [product.id]: (prev[product.id] ?? 0) + qty }))
  }

  const removeFromCart = (product: Product) => {
    setOrderSent(false)
    setCart((prev) => {
      const next = { ...prev }
      const count = (next[product.id] ?? 0) - 1
      if (count <= 0) {
        delete next[product.id]
      } else {
        next[product.id] = count
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

  const syncProductInUrl = (productId: string | null) => {
    const url = new URL(window.location.href)
    if (productId) {
      url.searchParams.set('product', productId)
    } else {
      url.searchParams.delete('product')
    }
    const next = `${url.pathname}${url.search}${url.hash}`
    window.history.pushState({}, '', next)
  }

  const handleTopSearch = (value: string) => {
    setProductQuery(value)
    if (selectedProductId) {
      setSelectedProductId(null)
      syncProductInUrl(null)
    }
    setTimeout(() => {
      document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' })
    }, 0)
  }

  const openProduct = (productId: string) => {
    setSelectedProductId(productId)
    syncProductInUrl(productId)
    setTimeout(() => {
      document.getElementById('product-detail')?.scrollIntoView({ behavior: 'smooth' })
    }, 0)
  }

  const closeProduct = () => {
    setSelectedProductId(null)
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
    setSelectedProductId(null)
    syncProductInUrl(null)
    setTimeout(() => {
      document.getElementById('home')?.scrollIntoView({ behavior: 'smooth' })
    }, 0)
  }

  const goToSection = (sectionId: 'categories' | 'products') => {
    setIsAdminPage(false)
    if (selectedProductId) {
      setSelectedProductId(null)
      syncProductInUrl(null)
    }
    setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' })
    }, 0)
  }

  const cartItems = productCatalog.filter((item) => cart[item.id])
  const totalItems = Object.values(cart).reduce((sum, qty) => sum + qty, 0)
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * (cart[item.id] ?? 0), 0)
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
    setFormError('')
    setPlacingOrder(true)
    try {
      const payload = {
        lang,
        customer: checkoutForm,
        items: cartItems.map((item) => ({
          productId: item.id,
          name: item.name,
          quantity: cart[item.id] ?? 0,
          unitPrice: item.price,
          priceUnit: item.priceUnit,
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
        setFormError(data.message ?? (lang === 'fi' ? 'Tilauksen lähetys epäonnistui.' : 'Order submission failed.'))
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
    'x-admin-user': adminCreds.user,
    'x-admin-pass': adminCreds.pass,
  })

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
    })
    setAdminImageUrl('')
  }

  const saveAdminProduct = () => {
    const name = adminProductForm.name.trim()
    const sku = adminProductForm.sku.trim()
    const category = normalizeCategoryId(adminProductForm.category)
    const price = Number(adminProductForm.price)
    const stock = Number(adminProductForm.stock)

    if (!name || !sku || !category || Number.isNaN(price) || Number.isNaN(stock)) {
      setAdminError(lang === 'fi' ? 'Täytä nimi, SKU, kategoria, hinta ja varasto.' : 'Fill name, SKU, category, price and stock.')
      return
    }

    const payload: Product = {
      id: adminProductForm.id ?? `p-${Date.now()}`,
      name,
      sku,
      category,
      price,
      priceUnit: adminProductForm.priceUnit.trim() || (lang === 'fi' ? '€ / kpl' : '€ / pc'),
      unitNote: adminProductForm.unitNote.trim() || undefined,
      stock,
      image: adminProductForm.images[0] ?? productImages.soap,
      images: adminProductForm.images.length > 0 ? adminProductForm.images : [productImages.soap],
      description: adminProductForm.description.trim() || name,
    }

    setProductCatalog((prev) => {
      if (adminProductForm.id) {
        return prev.map((item) => (item.id === adminProductForm.id ? { ...item, ...payload } : item))
      }
      return [payload, ...prev]
    })
    if (!categories.some((item) => item.id === category)) {
      setCategories((prev) => [...prev, { id: category, nameFi: category, nameEn: category }])
    }

    setAdminError('')
    resetAdminForm()
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
    })
    setAdminImageUrl('')
  }

  const deleteProductFromAdmin = (productId: string) => {
    setProductCatalog((prev) => prev.filter((item) => item.id !== productId))
    setCart((prev) => {
      const next = { ...prev }
      delete next[productId]
      return next
    })
    if (selectedProductId === productId) {
      setSelectedProductId(null)
    }
    if (adminProductForm.id === productId) {
      resetAdminForm()
    }
  }

  const addCategory = () => {
    const nameFi = adminCategoryName.trim()
    const nameEn = adminCategoryNameEn.trim()
    if (!nameFi) {
      return
    }
    if (categories.some((item) => item.id === nameFi || item.nameFi === nameFi || item.nameEn === nameEn)) {
      setAdminError(lang === 'fi' ? 'Kategoria on jo olemassa.' : 'Category already exists.')
      return
    }
    setCategories((prev) => [...prev, { id: nameFi, nameFi, nameEn: nameEn || nameFi }])
    setAdminCategoryName('')
    setAdminCategoryNameEn('')
    setAdminError('')
  }

  const deleteCategory = (categoryId: string) => {
    setCategories((prev) => {
      const next = prev.filter((item) => item.id !== categoryId)
      if (!next.some((item) => item.id === 'Muut')) {
        next.push({ id: 'Muut', nameFi: 'Muut', nameEn: 'Other' })
      }
      return next
    })
    setProductCatalog((prev) =>
      prev.map((item) => (item.category === categoryId ? { ...item, category: 'Muut' } : item))
    )
    if (activeCategory === categoryId) {
      setActiveCategory('all')
    }
  }

  const adminFilteredProducts = useMemo(() => {
    const q = adminQuery.trim().toLowerCase()
    return productCatalog.filter((item) => {
      const categoryTerms = categoryMap[item.category]
        ? `${categoryMap[item.category].nameFi} ${categoryMap[item.category].nameEn}`
        : item.category
      return q === '' ? true : `${item.name} ${item.sku} ${item.category} ${categoryTerms}`.toLowerCase().includes(q)
    })
  }, [adminQuery, categoryMap, productCatalog])

  const adminPages = Math.max(1, Math.ceil(adminFilteredProducts.length / pageSize))
  const safeAdminPage = Math.min(adminPage, adminPages)
  const adminPageItems = adminFilteredProducts.slice((safeAdminPage - 1) * pageSize, safeAdminPage * pageSize)

  return (
    <div className="page">
      <header className="top">
        <button className="brand" onClick={goHome} aria-label="Suomen Paperitukku etusivu">
          <img src={brandLogo} alt="Suomen Paperitukku" />
        </button>
        <nav className="nav">
          <button className="nav-button" onClick={() => goToSection('categories')}>
            {t.nav[0]}
          </button>
          <button className="nav-button" onClick={() => goToSection('products')}>
            {t.nav[1]}
          </button>
          <button className="nav-button" onClick={() => setIsAdminPage(true)}>
            {t.nav[2]}
          </button>
        </nav>
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
      </header>

      <main>
        {isAdminPage ? (
          <section className="section admin-page">
            <div className="admin-page-head">
              <h1>{t.adminTitle}</h1>
              <p className="muted">
                {lang === 'fi'
                  ? 'Kirjaudu sisään hallintapaneeliin.'
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
                    {categories.map((category) => (
                      <div key={category.id} className="admin-category-chip">
                        <span>{category.nameFi} / {category.nameEn}</span>
                        <button className="ghost tiny danger" type="button" onClick={() => deleteCategory(category.id)}>
                          {lang === 'fi' ? 'Poista' : 'Delete'}
                        </button>
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
                        ←
                      </button>
                      <button className="ghost tiny">{safeAdminPage}</button>
                      <button className="ghost tiny" disabled={safeAdminPage === adminPages} onClick={() => setAdminPage((prev) => Math.min(adminPages, prev + 1))}>
                        →
                      </button>
                    </div>
                  </div>
                  <div className="admin-table">
                    {adminPageItems.map((item) => (
                      <div key={item.id} className="admin-row">
                        <div className="admin-row-main">
                          <img className="admin-row-image" src={getProductImage(item)} alt={item.name} />
                          <div>
                            <strong>{item.name}</strong>
                            <p className="muted small">{item.sku} · {getCategoryLabel(item.category)}</p>
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
                        {lang === 'fi' ? 'P?ivit?' : 'Refresh'}
                      </button>
                    </div>
                    {adminOrdersError && <div className="error">{adminOrdersError}</div>}
                    {adminOrdersLoading ? (
                      <p className="muted">{lang === 'fi' ? 'Haetaan tilauksia...' : 'Loading orders...'}</p>
                    ) : adminOrders.length === 0 ? (
                      <p className="muted">{lang === 'fi' ? 'Ei tilauksia viel?.' : 'No orders yet.'}</p>
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
                              {order.items.map((item) => (
                                <div key={`${order.id}-${item.productId}-${item.name}`} className="admin-order-item">
                                  <span>{item.name}</span>
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
                    alt={selectedProduct.name}
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
                        <img src={image} alt={`${selectedProduct.name} ${index + 1}`} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="detail-info">
                <h2>{selectedProduct.name}</h2>
                <p className="muted">{selectedProduct.description}</p>
                <div className="price-block">
                  <span className="muted">
                    {formatPrice(grossPrice(selectedProduct.price), lang)} € {lang === 'fi' ? '(sis. alv)' : '(incl. VAT)'}
                  </span>
                  <span className="price-top">
                    {formatPrice(selectedProduct.price, lang)} {selectedProduct.priceUnit} {t.product.vatNote}
                  </span>
                  {selectedProduct.unitNote && <span className="muted">{selectedProduct.unitNote}</span>}
                </div>
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
                  <button className="primary" onClick={() => addToCart(selectedProduct, selectedQuantity)}>
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
                    <img className="product-image" src={getProductImage(item)} alt={item.name} />
                    <strong className="product-name">{item.name}</strong>
                    <button className="ghost" onClick={() => openProduct(item.id)}>
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
          <div className="category-grid">
            <button className={`category-card ${activeCategory === 'all' ? 'active' : ''}`} onClick={() => setActiveCategory('all')}>
              <strong>{lang === 'fi' ? 'Kaikki tuotteet' : 'All products'}</strong>
              <span className="muted">{productCatalog.length}</span>
            </button>
            {categoriesForFilters.map((item) => (
              <button key={item.id} className={`category-card ${activeCategory === item.id ? 'active' : ''}`} onClick={() => setActiveCategory(item.id)}>
                <strong>{lang === 'fi' ? item.nameFi : item.nameEn}</strong>
                <span className="muted">{productCatalog.filter((product) => product.category === item.id).length}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="section products-section" id="products">
          <div className="products-header">
            <div>
              <h2>{t.productsTitle}</h2>
              <p className="muted">{t.productsNote}</p>
              <p className="muted shipping-note">
                {lang === 'fi' ? 'Toimitus 15 € alle 250 € tilauksille, yli 250 € ilmainen.' : 'Delivery is 15 € below 250 €, free above 250 €.'}
              </p>
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
              {t.productsShown} {totalCount === 0 ? 0 : listStart + 1}–{Math.min(listStart + pageSize, totalCount)} / {totalCount}
            </span>
            <div className="meta-right">
              <div className="pagination">
                <button className="ghost tiny" disabled={safeCurrentPage === 1} onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}>
                  ←
                </button>
                <button className="ghost tiny">{safeCurrentPage}</button>
                <button className="ghost tiny" disabled={safeCurrentPage === totalPages} onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}>
                  →
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
                <button className="product-card-button" type="button" onClick={() => openProduct(item.id)}>
                  <div className="product-link">
                    <img className="product-image" src={getProductImage(item)} alt={item.name} loading="lazy" />
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
                        {formatPrice(item.price, lang)} {item.priceUnit} {t.product.vatNote}
                      </span>
                      {item.unitNote && <span className="muted">{item.unitNote}</span>}
                    </div>
                  </div>
                </button>
              </div>
            ))}
          </div>
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
                  <strong>{lang === 'fi' ? 'Puhelinnumerot' : 'Phone numbers'}</strong>
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
                          <input value={checkoutForm.email} onChange={(e) => updateForm('email', e.target.value)} />
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
                          <strong>{item.name}</strong>
                          <span className="tag">
                            {formatPrice(item.price, lang)} {item.priceUnit}
                          </span>
                        </div>
                        <div className="cart-actions">
                          <button className="ghost" onClick={() => removeFromCart(item)}>
                            -
                          </button>
                          <span>{cart[item.id]}</span>
                          <button className="ghost" onClick={() => addToCart(item)}>
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
