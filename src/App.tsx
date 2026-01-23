import { useMemo, useState } from 'react'
import './App.css'

type Lang = 'fi' | 'en'

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
    invoiceTitle: 'Maksupaikka',
    invoiceSteps: [
      'Lisää tuotteet ostoskoriin',
      'Syötä toimitusosoite ja yhteyshenkilö',
      'Vahvista tilaus – saat laskun',
    ],
    adminTitle: 'Admin',
    adminNote: 'Tuotteiden lisäys (demo)',
    adminSave: 'Tallenna',
    cart: 'Ostoskori (0)',
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
    invoiceTitle: 'Invoice',
    invoiceSteps: [
      'Add products to cart',
      'Enter delivery address and contact person',
      'Confirm order — invoice afterwards',
    ],
    adminTitle: 'Admin',
    adminNote: 'Add products (demo)',
    adminSave: 'Save',
    cart: 'Cart (0)',
    footer: 'Customer service: sales@saniteetti.fi',
  },
} as const

const categories = {
  fi: ['WC-paperit', 'Käsipyyhkeet', 'Saippuat', 'Puhdistus'],
  en: ['Toilet paper', 'Hand towels', 'Soaps', 'Cleaning'],
}

const products = {
  fi: [
    { name: 'Premium WC-paperi 12 rl', tag: 'Kulutusluokka A' },
    { name: 'Käsipyyherulla 6 kpl', tag: 'Extra imukyky' },
    { name: 'Nestesaippua 5 L', tag: 'Hellävarainen' },
  ],
  en: [
    { name: 'Premium toilet paper 12 rolls', tag: 'High usage' },
    { name: 'Hand towel roll 6 pcs', tag: 'Extra absorbent' },
    { name: 'Liquid soap 5 L', tag: 'Skin-friendly' },
  ],
}

function App() {
  const [lang, setLang] = useState<Lang>('fi')
  const t = useMemo(() => text[lang], [lang])

  return (
    <div className="page">
      <header className="top">
        <div className="brand">Saniteetti</div>
        <nav className="nav">
          <a href="#categories">{t.nav[0]}</a>
          <a href="#products">{t.nav[1]}</a>
          <a href="#invoice">{t.nav[2]}</a>
          <a href="#admin">{t.nav[3]}</a>
        </nav>
        <div className="actions">
          <button className="ghost">{t.cart}</button>
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
            {products[lang].map((item) => (
              <div key={item.name} className="card">
                <strong>{item.name}</strong>
                <span className="tag">{item.tag}</span>
                <button className="ghost">+</button>
              </div>
            ))}
          </div>
        </section>

        <section className="section" id="invoice">
          <h2>{t.invoiceTitle}</h2>
          <ol className="steps">
            {t.invoiceSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section className="section" id="admin">
          <h2>{t.adminTitle}</h2>
          <p className="muted">{t.adminNote}</p>
          <form className="admin-form">
            <input placeholder={lang === 'fi' ? 'Tuotteen nimi' : 'Product name'} />
            <input placeholder={lang === 'fi' ? 'Hinta' : 'Price'} />
            <button className="primary" type="button">
              {t.adminSave}
            </button>
          </form>
        </section>
      </main>

      <footer className="footer">{t.footer}</footer>
    </div>
  )
}

export default App