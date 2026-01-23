import { useMemo, useState } from 'react'
import './App.css'

type Lang = 'fi' | 'en'

type Product = {
  id: string
  name: string
  tag: string
  price: number
  priceUnit: string
  sku: string
  availability: string
  image: string
}

const svgData = (label: string, color: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="300" viewBox="0 0 420 300">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${color}" />
      <stop offset="100%" stop-color="#ffffff" />
    </linearGradient>
  </defs>
  <rect width="420" height="300" rx="24" fill="url(#g)" />
  <rect x="28" y="28" width="120" height="120" rx="18" fill="#ffffff" opacity="0.85" />
  <rect x="168" y="60" width="200" height="36" rx="10" fill="#ffffff" opacity="0.9" />
  <rect x="168" y="110" width="160" height="22" rx="8" fill="#ffffff" opacity="0.75" />
  <text x="32" y="220" font-family="Manrope, Arial" font-size="26" fill="#1d2a44">${label}</text>
</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const productImages = {
  wc: svgData('WC-paperi', '#dbe8ff'),
  towel: svgData('Käsipyyhe', '#e7f7f0'),
  soap: svgData('Saippua', '#fff0d9'),
  roll: svgData('Rulla', '#f1e9ff'),
} as const

const text = {
  fi: {
    nav: ['Kategoriat', 'Tuotteet', 'Maksupaikka', 'Kirjaudu'],
    heroTitle: 'Saniteetti',
    heroText:
      'Tilaa saniteettitarvikkeet yritykselle. Lisää koriin, täytä toimitus ja tilaa laskulla.',
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
    add: 'Lisää koriin',
    cartTitle: 'Ostoskori',
    cartEmpty: 'Ostoskori on tyhjä',
    subtotal: 'Välisummaa',
    clearCart: 'Tyhjennä kori',
    checkoutTitle: 'Maksupaikka (laskulla)',
    checkoutNote: 'Ei korttimaksuja. Lasku lähetetään yrityksellesi.',
    checkoutSuccess: 'Kiitos! Tilauksen tiedot on vastaanotettu.',
    form: {
      company: 'Yrityksen nimi',
      contact: 'Yhteyshenkilö',
      email: 'Sähköposti',
      phone: 'Puhelin',
      address: 'Toimitusosoite',
      zip: 'Postinumero',
      city: 'Kaupunki',
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
    footer: 'Asiakaspalvelu: myynti@saniteetti.fi',
  },
  en: {
    nav: ['Categories', 'Products', 'Invoice', 'Login'],
    heroTitle: 'Sanitary',
    heroText:
      'Order sanitary supplies for your business. Add to cart, fill delivery details, and order by invoice.',
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
    add: 'Add to cart',
    cartTitle: 'Cart',
    cartEmpty: 'Your cart is empty',
    subtotal: 'Subtotal',
    clearCart: 'Clear cart',
    checkoutTitle: 'Invoice checkout',
    checkoutNote: 'No card payments. Invoice is sent to your company.',
    checkoutSuccess: 'Thanks! Your order details were received.',
    form: {
      company: 'Company name',
      contact: 'Contact person',
      email: 'Email',
      phone: 'Phone',
      address: 'Delivery address',
      zip: 'Postal code',
      city: 'City',
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
    footer: 'Customer service: sales@saniteetti.fi',
  },
} as const

const categories = {
  fi: ['WC-paperit', 'Käsipyyhkeet', 'Saippuat', 'Puhdistus'],
  en: ['Toilet paper', 'Hand towels', 'Soaps', 'Cleaning'],
}

const products = {
  fi: [
    {
      id: 'wc',
      name: 'Tork H2 Xpress® Multifold Soft käsipyyhe 2-ker. luonnonvalkoinen 3800 ark',
      tag: '471103',
      price: 21.55,
      priceUnit: '€ / säkki',
      sku: '471103',
      availability: 'Varastossa',
      image: productImages.towel,
    },
    {
      id: 'towel',
      name: 'Tork T4 Universal wc-paperi 2-krs 38,30m/42rll',
      tag: '472246',
      price: 15.86,
      priceUnit: '€ / säkki',
      sku: '472246',
      availability: 'Varastossa',
      image: productImages.wc,
    },
    {
      id: 'soap',
      name: 'Tork H3 Universal käsipyyhe C-taitto 2-krs luonnonvalkoinen 2400 ark',
      tag: 'N953102',
      price: 18.68,
      priceUnit: '€ / säkki',
      sku: 'N953102',
      availability: 'Varastossa',
      image: productImages.roll,
    },
  ],
  en: [
    {
      id: 'wc',
      name: 'Tork H2 Xpress® Multifold Soft hand towel 2-ply 3800 sheets',
      tag: '471103',
      price: 21.55,
      priceUnit: '€ / pack',
      sku: '471103',
      availability: 'In stock',
      image: productImages.towel,
    },
    {
      id: 'towel',
      name: 'Tork T4 Universal toilet paper 2-ply 38.3m/42 rolls',
      tag: '472246',
      price: 15.86,
      priceUnit: '€ / pack',
      sku: '472246',
      availability: 'In stock',
      image: productImages.wc,
    },
    {
      id: 'soap',
      name: 'Tork H3 Universal C-fold hand towel 2-ply 2400 sheets',
      tag: 'N953102',
      price: 18.68,
      priceUnit: '€ / pack',
      sku: 'N953102',
      availability: 'In stock',
      image: productImages.roll,
    },
  ],
}

const adminCreds = {
  user: 'admin',
  pass: 'saniteetti123',
}

function App() {
  const [lang, setLang] = useState<Lang>('fi')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [orderSent, setOrderSent] = useState(false)
  const [adminUser, setAdminUser] = useState('')
  const [adminPass, setAdminPass] = useState('')
  const [adminError, setAdminError] = useState('')
  const [adminAuthed, setAdminAuthed] = useState(false)
  const t = useMemo(() => text[lang], [lang])
  const items = products[lang]

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

  const cartItems = items.filter((item) => cart[item.id])
  const totalItems = Object.values(cart).reduce((sum, qty) => sum + qty, 0)
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * (cart[item.id] ?? 0), 0)

  const handleOrder = () => {
    if (totalItems === 0) {
      return
    }
    setOrderSent(true)
    setCart({})
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
          <a href="#checkout">{t.nav[2]}</a>
          <a href="#admin">{t.nav[3]}</a>
        </nav>
        <div className="actions">
          <button className="ghost">
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

        <section className="section" id="products">
          <div className="products-header">
            <div>
              <h2>{t.productsTitle}</h2>
              <p className="muted">{t.productsNote}</p>
            </div>
            <div className="sort">
              <span className="muted">{lang === 'fi' ? 'Lajittelu' : 'Sort'}</span>
              <select defaultValue="relevance">
                <option value="relevance">{lang === 'fi' ? 'Relevanssi' : 'Relevance'}</option>
                <option value="price">{lang === 'fi' ? 'Hinta' : 'Price'}</option>
                <option value="name">{lang === 'fi' ? 'Nimi' : 'Name'}</option>
              </select>
            </div>
          </div>
          <div className="grid products-grid">
            {items.map((item) => (
              <div key={item.name} className="card product-card">
                <img className="product-image" src={item.image} alt={item.name} loading="lazy" />
                <div className="product-body">
                  <strong className="product-name">{item.name}</strong>
                  <span className="product-sku">{item.sku}</span>
                  <div className="availability">
                    <span>{t.product.online}:</span>
                    <span className="status">{item.availability}</span>
                  </div>
                  <div className="price-block">
                    <span className="price-top">{item.price.toFixed(2)} {item.priceUnit}</span>
                    <span className="muted">{t.product.vatNote}</span>
                  </div>
                </div>
                <button className="ghost full" onClick={() => addToCart(item)}>
                  {t.add}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="section" id="checkout">
          <div className="checkout">
            <div>
              <h2>{t.checkoutTitle}</h2>
              <p className="muted">{t.checkoutNote}</p>
              {orderSent && <div className="success">{t.checkoutSuccess}</div>}
              <form className="checkout-form">
                <input placeholder={t.form.company} />
                <input placeholder={t.form.contact} />
                <input placeholder={t.form.email} />
                <input placeholder={t.form.phone} />
                <input placeholder={t.form.address} />
                <div className="form-row">
                  <input placeholder={t.form.zip} />
                  <input placeholder={t.form.city} />
                </div>
                <textarea placeholder={t.form.notes} rows={3} />
                <button className="primary" type="button" onClick={handleOrder}>
                  {t.form.order}
                </button>
              </form>
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
              <div className="cart-total">
                <span>{t.subtotal}</span>
                <strong>{subtotal.toFixed(2)} €</strong>
              </div>
            </aside>
          </div>
        </section>

        <section className="section" id="admin">
          <h2>{adminAuthed ? t.adminTitle : t.adminLogin.title}</h2>
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
        </section>

        <section className="section contact">
          <div>
            <h2>{t.contactTitle}</h2>
            <p className="muted">{t.contactText}</p>
          </div>
          <button className="primary">{t.contactCta}</button>
        </section>
      </main>

      <footer className="footer">{t.footer}</footer>
    </div>
  )
}

export default App