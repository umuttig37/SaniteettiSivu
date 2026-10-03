(() => {
  const form = document.querySelector('#invoice-comparison-form')
  const status = document.querySelector('#invoice-form-status')
  const submitButton = form?.querySelector('button[type="submit"]')
  const maxBytes = 10 * 1024 * 1024
  const allowedTypes = new Set([
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/heic-sequence',
    'image/heif-sequence',
    'image/avif',
    'image/gif',
    'image/bmp',
    'image/x-ms-bmp',
    'image/tiff',
  ])
  const allowedExtensions = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'avif', 'gif', 'bmp', 'tif', 'tiff'])

  if (!form || !status || !submitButton) {
    return
  }

  const showStatus = (message, tone) => {
    status.textContent = message
    status.className = `invoice-form-status invoice-form-wide ${tone ? `is-${tone}` : ''}`
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    showStatus('', '')

    if (!form.reportValidity()) {
      return
    }

    const formData = new FormData(form)
    const file = formData.get('invoice')
    if (!(file instanceof File) || file.size === 0) {
      showStatus('Lisää lasku PDF-tiedostona tai kuvana.', 'error')
      return
    }
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!allowedTypes.has(file.type.toLowerCase()) && !allowedExtensions.has(extension)) {
      showStatus('Laskun pitää olla PDF tai tuettu kuvatiedosto.', 'error')
      return
    }
    if (file.size > maxBytes) {
      showStatus('Laskutiedosto saa olla enintään 10 Mt.', 'error')
      return
    }

    submitButton.disabled = true
    submitButton.textContent = 'Lähetetään...'

    try {
      const response = await fetch('/api/invoice-comparisons', {
        method: 'POST',
        body: formData,
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.message || 'Lähetys epäonnistui. Yritä hetken kuluttua uudelleen.')
      }

      form.reset()
      showStatus('Kiitos! Käymme laskusi läpi ja palaamme sinulle mahdollisimman pian paremman tarjouksen kanssa.', 'success')
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Lähetys epäonnistui. Yritä hetken kuluttua uudelleen.', 'error')
    } finally {
      submitButton.disabled = false
      submitButton.textContent = 'Lähetä lasku'
    }
  })
})()
