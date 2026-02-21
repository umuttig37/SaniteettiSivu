import { useMemo, useState } from 'react'
import './App.css'

type Lang = 'fi' | 'en'

type Product = {
  id: string
  name: string
  tag: string
  price: number
  priceUnit: string
  unitNote?: string
  sku: string
  availability: string
  statusTone: 'ok' | 'warn' | 'low'
  image: string
  description: string
  details: string[]
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
  billingZip: string
  billingCity: string
  billingReference: string
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
    nav: ['Kategoriat', 'Tuotteet', 'Tilaus', 'Kirjaudu'],
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
      billingZip: 'Laskutuksen postinumero',
      billingCity: 'Laskutuskaupunki',
      billingReference: 'Viite / ostotilausnumero',
      notes: 'Lisätiedot',
      order: 'Tee tilaus',
    },
    product: {
      online: 'Verkkokaupan saatavuus',
      inStock: 'Varastossa',
      priceLabel: 'Hinta',
      vatNote: '(alv 0%)',
      details: 'Lisätiedot',
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
    nav: ['Categories', 'Products', 'Checkout', 'Login'],
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
      billingZip: 'Billing postal code',
      billingCity: 'Billing city',
      billingReference: 'Reference / PO number',
      notes: 'Notes',
      order: 'Place order',
    },
    product: {
      online: 'Online availability',
      inStock: 'In stock',
      priceLabel: 'Price',
      vatNote: '(VAT 0%)',
      details: 'Details',
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

const categories = {
  fi: ['WC-paperit', 'Käsipyyhkeet', 'Saippuat', 'Puhdistus', 'Jätesäkit', 'Suojatarvikkeet'],
  en: ['Toilet paper', 'Hand towels', 'Soaps', 'Cleaning', 'Waste bags', 'Protective gear'],
}
const products: Record<Lang, Product[]> = {
  fi: [
    {
      id: 'wc',
      name: 'Tork H2 Xpress® Multifold Soft käsipyyhe 2-ker. luonnonvalkoinen 3800 ark',
      tag: '471103',
      price: 21.55,
      priceUnit: '€ / säkki',
      unitNote: '5,67 € / 1000 ark',
      sku: '471103',
      availability: 'Varastossa',
      statusTone: 'ok',
      image: productImages.towel,
      description: 'Pehmeä ja imukykyinen käsipyyhe suurkulutukseen.',
      details: ['2-kerroksinen', '3800 arkkia', 'Luonnonvalkoinen'],
    },
    {
      id: 'towel',
      name: 'Tork T4 Universal wc-paperi 2-krs 38,30m/42rll',
      tag: '472246',
      price: 15.86,
      priceUnit: '€ / säkki',
      unitNote: '9,94 € / 1000 m',
      sku: '472246',
      availability: 'Varastossa',
      statusTone: 'ok',
      image: productImages.wc,
      description: 'Luotettava peruspaperi yrityskäyttöön.',
      details: ['2-kerroksinen', '42 rullaa', '38,30 m / rulla'],
    },
    {
      id: 'soap',
      name: 'Tork H3 Universal käsipyyhe C-taitto 2-krs luonnonvalkoinen 2400 ark',
      tag: 'N953102',
      price: 18.68,
      priceUnit: '€ / säkki',
      unitNote: '7,78 € / 1000 ark',
      sku: 'N953102',
      availability: 'Varastossa',
      statusTone: 'ok',
      image: productImages.roll,
      description: 'Laadukas taittopaperi annostelijoihin.',
      details: ['C-taitto', '2400 arkkia', '2-kerroksinen'],
    },
    {
      id: 'spray',
      name: 'Yleispuhdistussuihke 750 ml, sitrus',
      tag: 'S71421',
      price: 6.95,
      priceUnit: '€ / kpl',
      sku: 'S71421',
      availability: 'Saatavilla',
      statusTone: 'warn',
      image: productImages.spray,
      description: 'Raikas ja tehokas yleispuhdistaja pinnoille.',
      details: ['750 ml', 'Sitrustuoksu', 'Sopii päivittäiseen käyttöön'],
    },
    {
      id: 'bag',
      name: 'Jätesäkki 240 L, vahva 10 kpl',
      tag: 'B24010',
      price: 8.9,
      priceUnit: '€ / rulla',
      sku: 'B24010',
      availability: 'Varastossa',
      statusTone: 'ok',
      image: productImages.trash,
      description: 'Vahvat jätesäkit isoihin astioihin.',
      details: ['240 L', '10 kpl / rulla', 'Vahva materiaali'],
    },
    {
      id: 'soap5',
      name: 'Nestesaippua 5 L, hellävarainen',
      tag: 'S5001',
      price: 14.9,
      priceUnit: '€ / kanisteri',
      sku: 'S5001',
      availability: 'Vähissä',
      statusTone: 'low',
      image: productImages.soap,
      description: 'Hellävarainen nestesaippua ammattilaiskäyttöön.',
      details: ['5 L kanisteri', 'Hellävarainen', 'Sopii annostelijoihin'],
    },
  ],  en: [
    {
      id: 'wc',
      name: 'Tork H2 Xpress® Multifold Soft hand towel 2-ply 3800 sheets',
      tag: '471103',
      price: 21.55,
      priceUnit: '€ / pack',
      unitNote: '5.67 € / 1000 sheets',
      sku: '471103',
      availability: 'In stock',
      statusTone: 'ok',
      image: productImages.towel,
      description: 'Soft and absorbent towels for heavy use.',
      details: ['2-ply', '3800 sheets', 'Natural white'],
    },
    {
      id: 'towel',
      name: 'Tork T4 Universal toilet paper 2-ply 38.3m/42 rolls',
      tag: '472246',
      price: 15.86,
      priceUnit: '€ / pack',
      unitNote: '9.94 € / 1000 m',
      sku: '472246',
      availability: 'In stock',
      statusTone: 'ok',
      image: productImages.wc,
      description: 'Reliable everyday toilet paper for businesses.',
      details: ['2-ply', '42 rolls', '38.3 m / roll'],
    },
    {
      id: 'soap',
      name: 'Tork H3 Universal C-fold hand towel 2-ply 2400 sheets',
      tag: 'N953102',
      price: 18.68,
      priceUnit: '€ / pack',
      unitNote: '7.78 € / 1000 sheets',
      sku: 'N953102',
      availability: 'In stock',
      statusTone: 'ok',
      image: productImages.roll,
      description: 'Quality folded towels for dispensers.',
      details: ['C-fold', '2400 sheets', '2-ply'],
    },
    {
      id: 'spray',
      name: 'All-purpose spray 750 ml, citrus',
      tag: 'S71421',
      price: 6.95,
      priceUnit: '€ / pc',
      sku: 'S71421',
      availability: 'Available',
      statusTone: 'warn',
      image: productImages.spray,
      description: 'Fresh, effective cleaner for daily surfaces.',
      details: ['750 ml', 'Citrus scent', 'Daily use'],
    },
    {
      id: 'bag',
      name: 'Waste bag 240 L, heavy duty 10 pcs',
      tag: 'B24010',
      price: 8.9,
      priceUnit: '€ / roll',
      sku: 'B24010',
      availability: 'In stock',
      statusTone: 'ok',
      image: productImages.trash,
      description: 'Durable waste bags for large bins.',
      details: ['240 L', '10 pcs / roll', 'Heavy duty'],
    },
    {
      id: 'soap5',
      name: 'Liquid soap 5 L, gentle',
      tag: 'S5001',
      price: 14.9,
      priceUnit: '€ / canister',
      sku: 'S5001',
      availability: 'Low stock',
      statusTone: 'low',
      image: productImages.soap,
      description: 'Gentle liquid soap for professional use.',
      details: ['5 L canister', 'Skin-friendly', 'For dispensers'],
    },
  ],
}

const adminCreds = {
  user: 'admin',
  pass: 'saniteetti123',
}

const formatPrice = (value: number, lang: Lang) => {
  return new Intl.NumberFormat(lang === 'fi' ? 'fi-FI' : 'en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

const deliveryCost = (subtotal: number) => (subtotal >= 150 ? 0 : 9.9)

const formatDelivery = (value: number, lang: Lang) => {
  if (value === 0) {
    return lang === 'fi' ? 'Ilmainen' : 'Free'
  }
  return `${formatPrice(value, lang)} €`
}

const getRelated = (items: Product[], currentId: string) => {
  return items.filter((item) => item.id !== currentId).slice(0, 3)
}

function App() {
  const [lang, setLang] = useState<Lang>('fi')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [orderSent, setOrderSent] = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState<1 | 2>(1)
  const [showLogin, setShowLogin] = useState(false)
  const [adminUser, setAdminUser] = useState('')
  const [adminPass, setAdminPass] = useState('')
  const [adminError, setAdminError] = useState('')
  const [adminAuthed, setAdminAuthed] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
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
    billingZip: '',
    billingCity: '',
    billingReference: '',
    notes: '',
  })
  const [formError, setFormError] = useState('')
  const t = useMemo(() => text[lang], [lang])
  const items = products[lang]
  const totalCount = 98
  const selectedProduct = selectedProductId ? items.find((item) => item.id === selectedProductId) : null
  const relatedProducts = selectedProduct ? getRelated(items, selectedProduct.id) : []

  const addToCart = (product: Product) => {
    setOrderSent(false)
    setCart((prev) => ({ ...prev, [product.id]: (prev[product.id] ?? 0) + 1 }))
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

  const openProduct = (productId: string) => {
    setSelectedProductId(productId)
    setTimeout(() => {
      document.getElementById('product-detail')?.scrollIntoView({ behavior: 'smooth' })
    }, 0)
  }

  const closeProduct = () => {
    setSelectedProductId(null)
    setTimeout(() => {
      document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' })
    }, 0)
  }

  const cartItems = items.filter((item) => cart[item.id])
  const totalItems = Object.values(cart).reduce((sum, qty) => sum + qty, 0)
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * (cart[item.id] ?? 0), 0)
  const shipping = deliveryCost(subtotal)
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
    if (!checkoutForm.billingCompany || !checkoutForm.billingAddress || !checkoutForm.billingZip || !checkoutForm.billingCity) {
      setFormError(
        lang === 'fi'
          ? 'Täytä vähintään laskutusyritys, laskutusosoite, postinumero ja kaupunki.'
          : 'Fill billing company, billing address, postal code, and city.'
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
  }

  return (
    <div className="page">
      <header className="top">
        <div className="brand">Saniteetti</div>
        <nav className="nav">
          <a href="#categories">{t.nav[0]}</a>
          <a href="#products">{t.nav[1]}</a>
          <button className="nav-button" onClick={openCheckout}>
            {t.nav[2]}
          </button>
          <button className="nav-button" onClick={() => setShowLogin(true)}>
            {t.nav[3]}
          </button>
        </nav>
        <div className="actions">
          <div className="top-search">
            <span className="search-icon">Haku</span>
            <input placeholder={t.search} />
          </div>
          <button className="ghost" onClick={openCheckout}>
            {t.cartTitle} ({totalItems})
          </button>
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
        <section className="hero" id="home">
          <h1>{t.heroTitle}</h1>
          <p>{t.heroText}</p>
          <div className="cta">
            <button className="primary">{t.ctaShop}</button>
            <button className="ghost">{t.ctaAccount}</button>
          </div>
        </section>

        <section className="section trust">
          <h2>{t.trustTitle}</h2>
          <div className="trust-grid">
            {t.trustItems.map((item) => (
              <div key={item.title} className="trust-card">
                <strong>{item.title}</strong>
                <span className="muted">{item.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="section" id="categories">
          <h2>{t.categoriesTitle}</h2>
          <div className="chips">
            {categories[lang].map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>

        <section className="section products-section" id="products">
          <div className="products-header">
            <div>
              <h2>{t.productsTitle}</h2>
              <p className="muted">{t.productsNote}</p>
            </div>
          </div>
          <div className="sort sort-floating">
            <span className="muted">{lang === 'fi' ? 'Lajittelu' : 'Sort'}</span>
            <select defaultValue="relevance">
              <option value="relevance">{lang === 'fi' ? 'Relevanssi' : 'Relevance'}</option>
              <option value="price">{lang === 'fi' ? 'Hinta' : 'Price'}</option>
              <option value="name">{lang === 'fi' ? 'Nimi' : 'Name'}</option>
            </select>
          </div>
          <div className="products-meta">
            <span className="muted">
              {t.productsShown} 1–{items.length} / {totalCount}
            </span>
            <div className="meta-right">
              <div className="pagination">
                <button className="ghost tiny">1</button>
                <button className="ghost tiny">2</button>
                <button className="ghost tiny">3</button>
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
                    {categories[lang].map((item) => (
                      <label key={item} className="filter-option">
                        <input type="checkbox" />
                        <span>{item}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="filter-block">
                  <span className="filter-title">{t.product.priceLabel}</span>
                  <div className="price-row">
                    <input className="filter-input" placeholder="0" />
                    <span className="muted">—</span>
                    <input className="filter-input" placeholder="200" />
                  </div>
                </div>
                <button className="ghost tiny">{t.clearFilters}</button>
              </div>
            </details>
          </div>
          <div className="grid products-grid">
            {items.map((item) => (
              <div key={item.name} className="card product-card">
                <button className="product-link" type="button" onClick={() => openProduct(item.id)}>
                  <img className="product-image" src={item.image} alt={item.name} loading="lazy" />
                  <strong className="product-name">{item.name}</strong>
                </button>
                <div className="product-body">
                  <span className="product-sku">{item.sku}</span>
                  <div className="availability">
                    <span className={`status status-${item.statusTone}`}>
                      <span className="dot" /> {item.availability}
                    </span>
                  </div>
                  <div className="price-block">
                    <span className="price-top">
                      {formatPrice(item.price, lang)} {item.priceUnit}
                    </span>
                    {item.unitNote && <span className="muted">{item.unitNote}</span>}
                    <span className="muted">{t.product.vatNote}</span>
                  </div>
                </div>
                <div className="product-actions">
                  <button className="ghost" onClick={() => openProduct(item.id)}>
                    {t.view}
                  </button>
                  <button className="ghost" onClick={() => addToCart(item)}>
                    {t.add}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {selectedProduct && (
          <section className="section product-detail" id="product-detail">
            <button className="ghost back" onClick={closeProduct}>
              ← {t.backToProducts}
            </button>
            <div className="detail-layout">
              <img className="detail-image" src={selectedProduct.image} alt={selectedProduct.name} />
              <div className="detail-info">
                <h2>{selectedProduct.name}</h2>
                <span className="product-sku">{selectedProduct.sku}</span>
                <p className="muted">{selectedProduct.description}</p>
                <div className="availability">
                  <span className={`status status-${selectedProduct.statusTone}`}>
                    <span className="dot" /> {selectedProduct.availability}
                  </span>
                </div>
                <div className="price-block">
                  <span className="price-top">
                    {formatPrice(selectedProduct.price, lang)} {selectedProduct.priceUnit}
                  </span>
                  {selectedProduct.unitNote && <span className="muted">{selectedProduct.unitNote}</span>}
                  <span className="muted">{t.product.vatNote}</span>
                </div>
                <div className="detail-actions">
                  <button className="primary" onClick={() => addToCart(selectedProduct)}>
                    {t.add}
                  </button>
                  <button className="ghost" onClick={openCheckout}>
                    {t.checkoutTitle}
                  </button>
                </div>
                <div>
                  <h4>{t.product.details}</h4>
                  <ul className="detail-list">
                    {selectedProduct.details.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
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
        )}

        <section className="section contact">
          <div>
            <h2>{t.contactTitle}</h2>
            <p className="muted">{t.contactText}</p>
          </div>
          <button className="primary">{t.contactCta}</button>
        </section>
      </main>

      <footer className="footer">
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
      </footer>

      {showCheckout && (
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
                        <div className="form-row">
                          <div className="field">
                            <label>{t.form.billingZip}</label>
                            <input value={checkoutForm.billingZip} onChange={(e) => updateForm('billingZip', e.target.value)} />
                          </div>
                          <div className="field">
                            <label>{t.form.billingCity}</label>
                            <input
                              value={checkoutForm.billingCity}
                              onChange={(e) => updateForm('billingCity', e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="field">
                          <label>{t.form.billingReference}</label>
                          <input
                            value={checkoutForm.billingReference}
                            onChange={(e) => updateForm('billingReference', e.target.value)}
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
                        <div>
                          <strong>{item.name}</strong>
                          <span className="tag">{item.tag}</span>
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
                    <strong>{formatDelivery(shipping, lang)}</strong>
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

      {showLogin && (
        <div className="modal">
          <div className="modal-backdrop" onClick={() => setShowLogin(false)} />
          <div className="modal-card">
            <button className="ghost close" onClick={() => setShowLogin(false)}>
              ✕
            </button>
            <h3>{adminAuthed ? t.adminTitle : t.adminLogin.title}</h3>
            {adminAuthed && <p className="muted">{t.adminNote}</p>}
            {!adminAuthed ? (
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
            ) : (
              <form className="admin-form">
                <input placeholder={t.adminForm.name} />
                <input placeholder={t.adminForm.price} />
                <input placeholder={t.adminForm.category} />
                <input placeholder={t.adminForm.stock} />
                <div className="admin-actions">
                  <button className="primary" type="button">
                    {t.adminForm.save}
                  </button>
                  <button className="ghost" type="button" onClick={handleAdminLogout}>
                    {t.adminForm.logout}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
