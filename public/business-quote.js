(() => {
  const form = document.querySelector('#business-quote-form')
  const status = document.querySelector('#quote-status')
  const button = form?.querySelector('button[type="submit"]')
  if (!form || !status || !button) return
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    status.className = ''
    status.textContent = ''
    if (!form.reportValidity()) return
    if (form.querySelectorAll('input[name="products"]:checked').length === 0) {
      status.className = 'error'; status.textContent = 'Valitse vähintään yksi tuoteryhmä.'; return
    }
    const file = new FormData(form).get('productList')
    if (file instanceof File && file.size > 10 * 1024 * 1024) {
      status.className = 'error'; status.textContent = 'Liite saa olla enintään 10 Mt.'; return
    }
    button.disabled = true; button.textContent = 'Lähetetään...'
    try {
      const response = await fetch('/api/business-quotes', { method: 'POST', body: new FormData(form) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || 'Tarjouspyynnön lähettäminen epäonnistui.')
      form.reset(); status.className = 'success'; status.textContent = 'Tarjouspyyntösi on vastaanotettu! Lähetimme vahvistuksen sähköpostiisi.'
    } catch (error) {
      status.className = 'error'; status.textContent = error instanceof Error ? error.message : 'Lähetys epäonnistui.'
    } finally { button.disabled = false; button.textContent = 'Lähetä tarjouspyyntö' }
  })
})()
