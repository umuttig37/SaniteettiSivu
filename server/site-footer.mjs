export const renderSiteFooter = ({ className = 'footer', id = '' } = {}) => `
      <footer class="${className}"${id ? ` id="${id}"` : ''}>
        <div class="site-footer-contact">
          <strong>Suomen Paperitukku</strong>
          <p>Asiakaspalvelu</p>
          <p>+358 44 978 2446</p>
          <p>info@suomenpaperitukku.fi</p>
          <a class="footer-admin-link" href="/tili">Kirjaudu</a>
        </div>
        <div class="footer-center">
          <p>&copy; 2026 Suomen Paperitukku - Kastamonu Tmi</p>
        </div>
        <div class="footer-meta">
          <p>3590057-8</p>
          <p><a class="footer-text-link" href="/ehdot">Tilaus- ja toimitusehdot</a></p>
        </div>
      </footer>`
