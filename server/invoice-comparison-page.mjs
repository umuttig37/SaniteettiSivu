const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export const renderInvoiceComparisonPage = ({ siteUrl }) => {
  const canonical = `${String(siteUrl).replace(/\/$/, '')}/laheta-laskusi`

  return `<!doctype html>
<html lang="fi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>Lähetä laskusi ja pyydä parempi tarjous | Suomen Paperitukku</title>
    <meta name="description" content="Lähetä nykyinen paperi-, hygienia- tai siivoustarvikelaskusi. Suomen Paperitukku etsii yrityksellesi merkittävän säästön samoista tai vastaavista tuotteista." />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <link rel="icon" href="/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/invoice-comparison.css" />
    <script src="/invoice-comparison.js" defer></script>
  </head>
  <body>
    <div class="invoice-page">
      <header class="invoice-header">
        <a class="invoice-brand" href="/" aria-label="Suomen Paperitukku etusivu">
          <img src="/brand-logo.png" alt="Suomen Paperitukku" />
        </a>
        <nav aria-label="Päänavigaatio">
          <a href="/#categories">Kategoriat</a>
          <a href="/#products">Tuotteet</a>
          <a href="/#contact">Yhteystiedot</a>
        </nav>
      </header>

      <main>
        <section class="invoice-hero">
          <div class="invoice-hero-copy">
            <span class="invoice-kicker">Maksuton laskuvertailu yrityksille</span>
            <h1>Yrityksesi maksaa turhaan liikaa</h1>
            <p class="invoice-lead">Lähetä nykyinen laskusi. Etsimme sinulle merkittävän säästön samoista tai vastaavista paperi-, hygienia- ja siivoustarvikkeista.</p>
            <a class="invoice-primary-link" href="#laheta-lasku">Lähetä lasku</a>
            <p class="invoice-reassurance">Vertailu on ilmainen eikä sido mihinkään.</p>
          </div>

          <div class="invoice-benefits" aria-label="Laskuvertailun hyödyt">
            <div><strong>Ilmainen vertailu</strong><span>Näet, missä yrityksesi voi säästää.</span></div>
            <div><strong>Ei sitoumuksia</strong><span>Päätät itse, haluatko tarjouksen jälkeen tilata.</span></div>
            <div><strong>Tutut tuotteet</strong><span>Tork, Katrin ja muut tunnetut vaihtoehdot.</span></div>
            <div><strong>Suoraan käyttöpaikkaan</strong><span>Veloitukseton toimitus ja yrityslaskutus.</span></div>
          </div>
        </section>

        <section class="invoice-form-section" id="laheta-lasku">
          <div class="invoice-form-intro">
            <span class="invoice-kicker">Näin se toimii</span>
            <h2>Lähetä laskusi turvallisesti</h2>
            <p>Lisää lasku PDF-tiedostona tai kuvana. Käymme tuotteet ja hinnat läpi ja palaamme sinulle mahdollisimman pian paremman tarjouksen kanssa.</p>
            <ol>
              <li><span>1</span> Lisää yhteystietosi ja lasku.</li>
              <li><span>2</span> Vertailemme samat tai vastaavat tuotteet.</li>
              <li><span>3</span> Saat yrityksellesi selkeän tarjouksen.</li>
            </ol>
            <p class="invoice-privacy-note">Lasku tallennetaan yksityisesti ja sitä käytetään vain tarjousvertailuun, jonka jälkeen se poistetaan.</p>
          </div>

          <form class="invoice-form" id="invoice-comparison-form" enctype="multipart/form-data" novalidate>
            <h2>Lähetä lasku</h2>
            <p class="invoice-form-help">Pakolliset kentät on merkitty tähdellä.</p>

            <label>
              <span>Yrityksen nimi *</span>
              <input name="company" autocomplete="organization" maxlength="160" required />
            </label>
            <label>
              <span>Yhteyshenkilö *</span>
              <input name="contactName" autocomplete="name" maxlength="160" required />
            </label>
            <label>
              <span>Sähköposti *</span>
              <input name="email" type="email" autocomplete="email" maxlength="254" required />
            </label>
            <label>
              <span>Puhelin *</span>
              <input name="phone" type="tel" autocomplete="tel" maxlength="80" required />
            </label>
            <label class="invoice-form-wide">
              <span>Viesti <small>(valinnainen)</small></span>
              <textarea name="message" rows="4" maxlength="3000" placeholder="Voit kertoa esimerkiksi tuotteista, toimituspaikasta tai muista toiveista."></textarea>
            </label>
            <label class="invoice-upload invoice-form-wide">
              <span>Laskun kuva tai PDF *</span>
              <input name="invoice" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.avif,.gif,.bmp,.tif,.tiff,application/pdf,image/*" required />
              <small>PDF tai yleinen kuvatiedosto, myös puhelimella otettu kuva. Enintään 10 Mt.</small>
            </label>
            <label class="invoice-honeypot" aria-hidden="true">
              <span>Verkkosivu</span>
              <input name="website" tabindex="-1" autocomplete="off" />
            </label>

            <div class="invoice-form-wide invoice-submit-row">
              <button type="submit">Lähetä lasku</button>
              <span>Ilmainen vertailu. Ei sido mihinkään.</span>
            </div>
            <div class="invoice-form-status invoice-form-wide" id="invoice-form-status" role="status" aria-live="polite"></div>
          </form>
        </section>
      </main>

      <footer class="invoice-footer" id="contact">
        <div><strong>Suomen Paperitukku</strong><span>Asiakaspalvelu</span><a href="tel:+358449782446">+358 44 978 2446</a><a href="mailto:info@suomenpaperitukku.fi">info@suomenpaperitukku.fi</a></div>
        <div><span>3590057-8</span><a href="/ehdot">Tilaus- ja toimitusehdot</a></div>
      </footer>
    </div>
  </body>
</html>`
}
