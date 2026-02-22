import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import './App.css'

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
  image: string
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

const text = {
  fi: {
    nav: ['Kategoriat', 'Tuotteet', 'Kirjaudu'],
    heroTitle: 'Saniteetti',
    heroText: 'Tilaa saniteettitarvikkeet yritykselle. Lisää koriin, täytä toimitus ja tilaa laskulla.',
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
    adminTitle: 'Admin',
    adminNote: 'Tuotteiden lisäys (demo)',
    adminLogin: {
      title: 'Kirjaudu',
      user: 'Käyttäjä',
      pass: 'Salasana',
      login: 'Kirjaudu',
      hint: 'Demo: admin / saniteetti123',
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
      brand: 'Saniteetti',
      service: 'Asiakaspalvelu',
      phone: '010 123 4567',
      email: 'myynti@saniteetti.fi',
      address: 'Teollisuustie 12, 00510 Helsinki',
      hours: 'Ma–Pe 8–16',
      legal: 'Y-tunnus 1234567-8',
    },
  },
  en: {
    nav: ['Categories', 'Products', 'Login'],
    heroTitle: 'Sanitary',
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
    adminTitle: 'Admin',
    adminNote: 'Add products (demo)',
    adminLogin: {
      title: 'Login',
      user: 'Username',
      pass: 'Password',
      login: 'Login',
      hint: 'Demo: admin / saniteetti123',
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
      brand: 'Saniteetti',
      service: 'Customer service',
      phone: '+358 10 123 4567',
      email: 'sales@saniteetti.fi',
      address: 'Industrial Road 12, 00510 Helsinki',
      hours: 'Mon–Fri 8–16',
      legal: 'VAT 1234567-8',
    },
  },
} as const

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
const pageSize = 12
const defaultCategories = ['WC-paperit', 'Käsipyyhkeet', 'Saippuat', 'Puhdistus', 'Jätesäkit']
const vatMultiplier = 1.255

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

const deliveryCost = (subtotal: number) => (subtotal >= 250 ? 0 : 15)

const formatDelivery = (value: number, lang: Lang) => {
  if (value === 0) {
    return lang === 'fi' ? 'Ilmainen' : 'Free'
  }
  return `${formatPrice(value, lang)} €`
}

const grossPrice = (value: number) => value * vatMultiplier

const getRelated = (items: Product[], currentId: string) => {
  return items.filter((item) => item.id !== currentId).slice(0, 3)
}

function App() {
  const [lang, setLang] = useState<Lang>('fi')
  const [productCatalog, setProductCatalog] = useState<Product[]>(() => {
    if (typeof window === 'undefined') {
      return products.fi
    }
    const raw = window.localStorage.getItem(productStorageKey)
    if (!raw) {
      return products.fi
    }
    try {
      const parsed = JSON.parse(raw) as Product[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    } catch {
      // Fall back to defaults if persisted value is invalid.
    }
    return products.fi
  })
  const [categories, setCategories] = useState<string[]>(() => {
    if (typeof window === 'undefined') {
      return defaultCategories
    }
    const raw = window.localStorage.getItem(categoriesStorageKey)
    if (!raw) {
      return defaultCategories
    }
    try {
      const parsed = JSON.parse(raw) as string[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
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
  const [selectedQuantity, setSelectedQuantity] = useState(1)
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
    image: '',
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
  const t = useMemo(() => text[lang], [lang])
  const categoriesForFilters = categories

  const filteredProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase()
    let next = productCatalog.filter((item) => {
      const haystack = `${item.name} ${item.sku} ${item.description} ${item.category}`.toLowerCase()
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
  }, [activeCategory, lang, productCatalog, productQuery, sortBy])

  const totalCount = filteredProducts.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const listStart = (safeCurrentPage - 1) * pageSize
  const pagedProducts = filteredProducts.slice(listStart, listStart + pageSize)
  const selectedProduct = selectedProductId ? productCatalog.find((item) => item.id === selectedProductId) : null
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

  const handleOrder = () => {
    if (!checkoutForm.billingCompany || !checkoutForm.billingAddress) {
      setFormError(
        lang === 'fi'
          ? 'Täytä vähintään laskutusyritys ja laskutusosoite.'
          : 'Fill at least billing company and billing address.'
      )
      return
    }
    setFormError('')
    setOrderSent(true)
    setCart({})
    setCheckoutStep(1)
  }

  const openCheckout = () => {
    setShowCheckout(true)
    setCheckoutStep(1)
    setFormError('')
  }

  const closeCheckout = () => {
    setShowCheckout(false)
    setFormError('')
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
      image: '',
      description: '',
    })
  }

  const saveAdminProduct = () => {
    const name = adminProductForm.name.trim()
    const sku = adminProductForm.sku.trim()
    const category = adminProductForm.category.trim()
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
      image: adminProductForm.image.trim() || productImages.soap,
      description: adminProductForm.description.trim() || name,
    }

    setProductCatalog((prev) => {
      if (adminProductForm.id) {
        return prev.map((item) => (item.id === adminProductForm.id ? { ...item, ...payload } : item))
      }
      return [payload, ...prev]
    })
    if (!categories.includes(category)) {
      setCategories((prev) => [...prev, category])
    }

    setAdminError('')
    resetAdminForm()
  }

  const handleAdminImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') {
        setAdminProductForm((prev) => ({ ...prev, image: result }))
      }
    }
    reader.readAsDataURL(file)
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
      image: product.image,
      description: product.description,
    })
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
    const next = adminCategoryName.trim()
    if (!next) {
      return
    }
    if (categories.includes(next)) {
      setAdminError(lang === 'fi' ? 'Kategoria on jo olemassa.' : 'Category already exists.')
      return
    }
    setCategories((prev) => [...prev, next])
    setAdminCategoryName('')
    setAdminError('')
  }

  const deleteCategory = (name: string) => {
    setCategories((prev) => prev.filter((item) => item !== name))
    setProductCatalog((prev) =>
      prev.map((item) => (item.category === name ? { ...item, category: lang === 'fi' ? 'Muut' : 'Other' } : item))
    )
    if (activeCategory === name) {
      setActiveCategory('all')
    }
  }

  const adminFilteredProducts = useMemo(() => {
    const q = adminQuery.trim().toLowerCase()
    return productCatalog.filter((item) =>
      q === '' ? true : `${item.name} ${item.sku} ${item.category}`.toLowerCase().includes(q)
    )
  }, [adminQuery, productCatalog])

  const adminPages = Math.max(1, Math.ceil(adminFilteredProducts.length / pageSize))
  const safeAdminPage = Math.min(adminPage, adminPages)
  const adminPageItems = adminFilteredProducts.slice((safeAdminPage - 1) * pageSize, safeAdminPage * pageSize)

  return (
    <div className="page">
      <header className="top">
        <div className="brand">Saniteetti</div>
        <nav className="nav">
          <a href="#categories">{t.nav[0]}</a>
          <a href="#products">{t.nav[1]}</a>
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
            <button className="ghost" onClick={() => setIsAdminPage(false)}>
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
                  ? 'Kirjaudu admin-tunnuksilla ja hallinnoi koko tuotekatalogia.'
                  : 'Login with admin credentials and manage the full product catalog.'}
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
                  <span className="muted small">{t.adminLogin.hint}</span>
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
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    <div className="admin-category-row">
                      <input
                        placeholder={lang === 'fi' ? 'Uusi kategoria' : 'New category'}
                        value={adminCategoryName}
                        onChange={(event) => setAdminCategoryName(event.target.value)}
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
                  <input
                    placeholder={lang === 'fi' ? 'Kuvan URL (valinnainen)' : 'Image URL (optional)'}
                    value={adminProductForm.image}
                    onChange={(event) => setAdminProductForm((prev) => ({ ...prev, image: event.target.value }))}
                  />
                  <input type="file" accept="image/*" onChange={handleAdminImageUpload} />
                  {adminProductForm.image && <img className="admin-image-preview" src={adminProductForm.image} alt="Product preview" />}
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
                      <div key={category} className="admin-category-chip">
                        <span>{category}</span>
                        <button className="ghost tiny danger" type="button" onClick={() => deleteCategory(category)}>
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
                          <img className="admin-row-image" src={item.image} alt={item.name} />
                          <div>
                            <strong>{item.name}</strong>
                            <p className="muted small">{item.sku} · {item.category}</p>
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
              <img className="detail-image" src={selectedProduct.image} alt={selectedProduct.name} />
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
                    <img className="product-image" src={item.image} alt={item.name} />
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
        <section className="hero" id="home">
          <h1>{t.heroTitle}</h1>
          <p>{t.heroText}</p>
          <div className="cta">
            <button className="primary">{t.ctaShop}</button>
            <button className="ghost">{t.ctaAccount}</button>
          </div>
        </section>

        <section className="section" id="categories">
          <h2>{t.categoriesTitle}</h2>
          <div className="category-grid">
            <button className={`category-card ${activeCategory === 'all' ? 'active' : ''}`} onClick={() => setActiveCategory('all')}>
              <strong>{lang === 'fi' ? 'Kaikki tuotteet' : 'All products'}</strong>
              <span className="muted">{productCatalog.length}</span>
            </button>
            {categoriesForFilters.map((item) => (
              <button key={item} className={`category-card ${activeCategory === item ? 'active' : ''}`} onClick={() => setActiveCategory(item)}>
                <strong>{item}</strong>
                <span className="muted">{productCatalog.filter((product) => product.category === item).length}</span>
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
                        key={item}
                        className={`ghost tiny ${activeCategory === item ? 'active-filter' : ''}`}
                        onClick={() => setActiveCategory(item)}
                      >
                        {item}
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
                    <img className="product-image" src={item.image} alt={item.name} loading="lazy" />
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
                  <a href="mailto:umut.uygur30@gmail.com">umut.uygur30@gmail.com</a>
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
          <p>{t.footer.hours}</p>
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
                <p className="muted">{t.checkoutNote}</p>
              </div>
              <button className="ghost small" onClick={closeCheckout}>
                {t.checkoutClose}
              </button>
            </div>

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

            <div className="checkout">
              <div>
                {orderSent && <div className="success">{t.checkoutSuccess}</div>}
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
                          <button className="primary" type="button" onClick={handleOrder}>
                            {t.form.order}
                          </button>
                        </div>
                      </>
                    )}
                  </form>
                )}
              </div>
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
            </div>
        </section>
        </div>
      )}

    </div>
  )
}

export default App
