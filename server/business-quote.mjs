import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import Busboy from 'busboy'

const maxFileBytes = 10 * 1024 * 1024
const allowedExtensions = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp'])

export class BusinessQuoteError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'BusinessQuoteError'
    this.status = status
  }
}

const clean = (value, max = 5000) => String(value ?? '').trim().slice(0, max)
const escapeHtml = (value) => clean(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const safeFilename = (value) => path.basename(clean(value, 180)).replace(/[^\p{L}\p{N}._ -]/gu, '_') || 'tuotelista'

export const validateBusinessQuoteFields = (fields) => {
  const quote = {
    orderType: clean(fields.orderType, 80),
    products: Array.isArray(fields.products) ? fields.products.map((item) => clean(item, 80)).filter(Boolean) : [],
    needs: clean(fields.needs, 5000),
    company: clean(fields.company, 200),
    businessId: clean(fields.businessId, 40),
    contactName: clean(fields.contactName, 200),
    email: clean(fields.email, 254).toLowerCase(),
    phone: clean(fields.phone, 80),
    location: clean(fields.location, 200),
  }
  if (!quote.orderType || quote.products.length === 0 || !quote.needs || !quote.company || !quote.businessId || !quote.contactName || !quote.email || !quote.phone || !quote.location) {
    throw new BusinessQuoteError('Täytä kaikki pakolliset kentät.')
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(quote.email)) {
    throw new BusinessQuoteError('Tarkista sähköpostiosoite.')
  }
  return quote
}

export const receiveBusinessQuote = async (req) => {
  const tempDir = path.join(os.tmpdir(), 'spt-business-quotes')
  await fs.promises.mkdir(tempDir, { recursive: true, mode: 0o700 })
  let parser
  try {
    parser = Busboy({ headers: req.headers, limits: { fileSize: maxFileBytes + 1, files: 1, fields: 20, parts: 21, fieldSize: 6000 } })
  } catch {
    throw new BusinessQuoteError('Lomakkeen lähetys on virheellinen.')
  }

  const fields = { products: [] }
  let tempPath = null
  let filePromise = Promise.resolve()
  let attachment = null
  let fileLimited = false
  let fileError = null

  const cleanup = async () => {
    if (tempPath) await fs.promises.unlink(tempPath).catch(() => {})
  }

  try {
    await new Promise((resolve, reject) => {
      parser.on('field', (name, value) => {
        if (name === 'products') fields.products.push(value)
        else if (['orderType', 'needs', 'company', 'businessId', 'contactName', 'email', 'phone', 'location', 'website'].includes(name)) fields[name] = value
      })
      parser.on('file', (name, file, info) => {
        if (name !== 'productList' || !info.filename) {
          file.resume()
          return
        }
        const extension = path.extname(info.filename).slice(1).toLowerCase()
        if (!allowedExtensions.has(extension)) {
          fileError = new BusinessQuoteError('Liitteen pitää olla PDF-, JPG-, PNG- tai WebP-tiedosto.')
          file.resume()
          return
        }
        tempPath = path.join(tempDir, `${crypto.randomUUID()}.${extension}`)
        const output = fs.createWriteStream(tempPath, { flags: 'wx', mode: 0o600 })
        file.on('limit', () => { fileLimited = true })
        filePromise = pipeline(file, output).then(() => {
          attachment = { filename: safeFilename(info.filename), path: tempPath, contentType: info.mimeType }
        })
      })
      parser.once('error', reject)
      parser.once('close', resolve)
      req.once('aborted', () => reject(new BusinessQuoteError('Lähetys keskeytyi.')))
      req.pipe(parser)
    })
    await filePromise
    if (fileError) throw fileError
    if (fileLimited) throw new BusinessQuoteError('Liite saa olla enintään 10 Mt.', 413)
    if (clean(fields.website, 200)) throw new BusinessQuoteError('Lomakkeen lähetys estettiin.')
    return { quote: validateBusinessQuoteFields(fields), attachment, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}

export const createBusinessQuoteMailMessages = ({ quote, attachment, from, ownerRecipients }) => {
  const details = `<p><strong>Tilauksen tyyppi:</strong> ${escapeHtml(quote.orderType)}<br><strong>Tuoteryhmät:</strong> ${escapeHtml(quote.products.join(', '))}<br><strong>Tarve ja määrät:</strong><br>${escapeHtml(quote.needs).replace(/\n/g, '<br>')}</p><p><strong>Yritys:</strong> ${escapeHtml(quote.company)}<br><strong>Y-tunnus:</strong> ${escapeHtml(quote.businessId)}<br><strong>Yhteyshenkilö:</strong> ${escapeHtml(quote.contactName)}<br><strong>Sähköposti:</strong> ${escapeHtml(quote.email)}<br><strong>Puhelin:</strong> ${escapeHtml(quote.phone)}<br><strong>Toimituspaikkakunta:</strong> ${escapeHtml(quote.location)}</p>`
  const attachments = attachment ? [attachment] : []
  return [
    { from, to: ownerRecipients, replyTo: quote.email, subject: `Uusi yrityshintapyyntö: ${quote.company}`, html: `<div style="font-family:Arial,sans-serif;color:#13233f"><h2>Uusi yrityshintapyyntö</h2>${details}</div>`, attachments },
    { from, to: quote.email, subject: 'Tarjouspyyntösi on vastaanotettu!', html: `<div style="font-family:Arial,sans-serif;color:#13233f"><h2>Tarjouspyyntösi on vastaanotettu!</h2><p>Kiitos yhteydenotostasi. Käymme yrityksesi tarpeet läpi ja palaamme sinulle mahdollisimman pian.</p><p>Ystävällisin terveisin<br><strong>Suomen Paperitukku</strong></p></div>` },
  ]
}
