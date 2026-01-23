import { useMemo, useState } from 'react'
import './App.css'

type Lang = 'fi' | 'en'

type Product = {
  id: string
  name: string
  tag: string
  price: number
}

const text = {
  fi: {
    nav: ['Kategoriat', 'Tuotteet', 'Maksupaikka', 'Admin'],
    heroTitle: 'Saniteetti',
    heroText:
      'Tilaa saniteettitarvikkeet yritykselle. Lisää koriin, täytä toimitus ja tilaa laskulla.',
    ctaShop: 'Selaa tuotteita',
    ctaAccount: 'Pyydä yritystili',
    categoriesTitle: 'Kategoriat',
    productsTitle: 'Tuotteet',
    productsNote: 'Toimitus 1–3 arkipäivässä. Lasku 14 pv.',
    add: 'Lisää koriin',
    cartTitle: 'Ostoskori',
    cartEmpty: 'Ostoskori on tyhjä',
    subtotal: 'Välisummaa',
    checkoutTitle: 'Maksupaikka (laskulla)',
    checkoutNote: 'Ei korttimaksuja. Lasku lähetetään yrityksellesi.',
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
    adminTitle: 'Admin',
    adminNote: 'Tuotteiden lisäys (demo)',
    adminForm: {
      name: 'Tuotteen nimi',
      price: 'Hinta',
      category: 'Kategoria',
      stock: 'Varasto',
      save: 'Tallenna',
    },
    footer: 'Asiakaspalvelu: myynti@saniteetti.fi',
  },
  en: {
    nav: ['Categories', 'Products', 'Invoice', 'Admin'],
    heroTitle: 'Sanitary',
    heroText:
      'Order sanitary supplies for your business. Add to cart, fill delivery details, and order by invoice.',
    ctaShop: 'Browse products',
    ctaAccount: 'Request company account',
    categoriesTitle: 'Categories',
    productsTitle: 'Products',
    productsNote: 'Delivery in 1–3 business days. Net 14 days.',
    add: 'Add to cart',
    cartTitle: 'Cart',
    cartEmpty: 'Your cart is empty',
    subtotal: 'Subtotal',
    checkoutTitle: 'Invoice checkout',
    checkoutNote: 'No card payments. Invoice is sent to your company.',
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
    adminTitle: 'Admin',
    adminNote: 'Add products (demo)',
    adminForm: {
      name: 'Product name',
      price: 'Price',
      category: 'Category',
      stock: 'Stock',
      save: 'Save',
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
    { id: 'wc', name: 'Premium WC-paperi 12 rl', tag: 'Kulutusluokka A', price: 12.9 },
    { id: 'towel', name: 'Käsipyyherulla 6 kpl', tag: 'Extra imukyky', price: 18.5 },
    { id: 'soap', name: 'Nestesaippua 5 L', tag: 'Hellävarainen', price: 14.9 },
  ],
  en: [
    { id: 'wc', name: 'Premium toilet paper 12 rolls', tag: 'High usage', price: 12.9 },
    { id: 'towel', name: 'Hand towel roll 6 pcs', tag: 'Extra absorbent', price: 18.5 },
    { id: 'soap', name: 'Liquid soap 5 L', tag: 'Skin-friendly', price: 14.9 },
  ],
}

function App() {
  const [lang, setLang] = useState<Lang>('fi')
  const [cart, setCart] = useState<Record<string, number>>({})
  const t = useMemo(() => text[lang], [lang])
  const items = products[lang]

  const addToCart = (product: Product) => {
    setCart((prev) => ({ ...prev, [product.id]: (prev[product.id] ?? 0) + 1 }))
  }

  const removeFromCart = (product: Product) => {
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

  const cartItems = items.filter((item) => cart[item.id])
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * (cart[item.id] ?? 0), 0)

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
          <button className="ghost">{t.cartTitle} ({cartItems.length})</button>
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

        <section className="section" id="categories">
          <h2>{t.categoriesTitle}</h2>
          <div className="chips">
            {categories[lang].map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>

        <section className="section" id="products">
          <h2>{t.productsTitle}</h2>
          <p className="muted">{t.productsNote}</p>
          <div className="grid">
            {items.map((item) => (
              <div key={item.name} className="card">
                <strong>{item.name}</strong>
                <span className="tag">{item.tag}</span>
                <div className="price-row">
                  <span>{item.price.toFixed(2)} €</span>
                  <button className="ghost" onClick={() => addToCart(item)}>
                    {t.add}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="section" id="checkout">
          <div className="checkout">
            <div>
              <h2>{t.checkoutTitle}</h2>
              <p className="muted">{t.checkoutNote}</p>
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
                <button className="primary" type="button">
                  {t.form.order}
                </button>
              </form>
            </div>
            <aside className="cart">
              <h3>{t.cartTitle}</h3>
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
          <h2>{t.adminTitle}</h2>
          <p className="muted">{t.adminNote}</p>
          <form className="admin-form">
            <input placeholder={t.adminForm.name} />
            <input placeholder={t.adminForm.price} />
            <input placeholder={t.adminForm.category} />
            <input placeholder={t.adminForm.stock} />
            <button className="primary" type="button">
              {t.adminForm.save}
            </button>
          </form>
        </section>
      </main>

      <footer className="footer">{t.footer}</footer>
    </div>
  )
}

export default App