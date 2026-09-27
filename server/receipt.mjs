import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultLogoPath = path.resolve(__dirname, '..', 'public', 'brand-logo.png')

const page = {
  left: 42,
  right: 553,
  contentBottom: 755,
}

const colors = {
  ink: '#303946',
  muted: '#687386',
  border: '#d9e2ec',
  panel: '#f1f5f9',
  accent: '#5daed8',
  white: '#ffffff',
}

const cleanText = (value, fallback = '') => {
  const text = String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
  return text || fallback
}

const formatDate = (value) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat('fi-FI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Helsinki',
  }).format(date)
}

const money = (value) =>
  `${new Intl.NumberFormat('fi-FI', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)} \u20ac`

const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100
const grossFromNet = (value) => roundCurrency(Number(value) * 1.255)
const vatFromNet = (value) => roundCurrency(grossFromNet(value) - Number(value))

const getOptionDetails = (selectedOptions) =>
  (Array.isArray(selectedOptions) ? selectedOptions : [])
    .map((option) => {
      const group = cleanText(option?.groupName)
      const value = cleanText(option?.valueLabel)
      const detail = cleanText(option?.valueDetail)
      if (!group || !value) {
        return ''
      }
      return `${group}: ${value}${detail ? ` (${detail})` : ''}`
    })
    .filter(Boolean)
    .join(', ')

const drawHeader = (doc, order, paymentDate) => {
  if (fs.existsSync(doc.receiptLogoPath)) {
    doc.image(doc.receiptLogoPath, page.left, 34, { fit: [180, 60], align: 'left', valign: 'center' })
  } else {
    doc.font('Helvetica-Bold').fontSize(16).fillColor(colors.ink).text('Suomen Paperitukku', page.left, 54)
  }

  doc.font('Helvetica-Bold').fontSize(23).fillColor(colors.ink).text('KUITTI', 380, 40, {
    width: page.right - 380,
    align: 'right',
  })
  doc.font('Helvetica').fontSize(9.5).fillColor(colors.muted)
  doc.text(`Tilaus ${cleanText(order.id, '-')}`, 365, 72, { width: page.right - 365, align: 'right' })
  doc.text(`Maksup\u00e4iv\u00e4 ${formatDate(paymentDate)}`, 365, 87, { width: page.right - 365, align: 'right' })
}

const drawPartyDetails = (doc, order) => {
  const customer = order.customer ?? {}
  const customerAddress = [
    cleanText(customer.address),
    [cleanText(customer.zip), cleanText(customer.city)].filter(Boolean).join(' '),
  ].filter(Boolean)

  doc.font('Helvetica-Bold').fontSize(10).fillColor(colors.ink).text('MYYJ\u00c4', page.left + 7, 125)
  doc.font('Helvetica-Bold').fontSize(11).text('Suomen Paperitukku', page.left + 7, 149)
  doc.font('Helvetica').fontSize(9.5).fillColor(colors.ink)
  doc.text('Kastamonu Tmi', page.left + 7, 168)
  doc.text('Y-tunnus 3590057-8', page.left + 7, 184)
  doc.text('info@suomenpaperitukku.fi', page.left + 7, 200)
  doc.text('+358 44 978 2446', page.left + 7, 216)

  const customerX = 310
  doc.font('Helvetica-Bold').fontSize(10).text('ASIAKAS', customerX, 125)
  doc.font('Helvetica-Bold').fontSize(11).text(cleanText(customer.company, '-'), customerX, 149, { width: 243 })
  doc.font('Helvetica').fontSize(9.5)
  doc.text(`Yhteyshenkil\u00f6: ${cleanText(customer.contact, '-')}`, customerX, 168, { width: 243 })
  if (cleanText(customer.businessId)) {
    doc.text(`Y-tunnus: ${cleanText(customer.businessId)}`, customerX, 184, { width: 243 })
  }
  doc.text(cleanText(customer.email, '-'), customerX, 200, { width: 243 })
  doc.text(cleanText(customer.phone, '-'), customerX, 216, { width: 243 })
  doc.font('Helvetica-Bold').text('Laskutus- ja toimitusosoite:', customerX, 236, { width: 243 })
  doc.font('Helvetica').text(customerAddress.join(', ') || '-', customerX, 252, { width: 243 })
}

const drawPaymentPanel = (doc, order) => {
  const y = 286
  doc.roundedRect(page.left, y, page.right - page.left, 52, 7).fill(colors.panel)
  doc.font('Helvetica').fontSize(9.5).fillColor(colors.muted).text('Maksutapa:', page.left + 16, y + 12)
  doc.font('Helvetica-Bold').fillColor(colors.ink).text('Korttimaksu (Paytrail)', page.left + 80, y + 12)
  doc.font('Helvetica').fillColor(colors.muted).text('Maksutila:', page.left + 16, y + 30)
  doc.font('Helvetica-Bold').fillColor(colors.ink).text('MAKSETTU', page.left + 80, y + 30)
  doc.font('Helvetica').fillColor(colors.muted).text('Toimitusp\u00e4iv\u00e4:', 330, y + 12)
  doc.font('Helvetica-Bold').fillColor(colors.ink).text(formatDate(order.customer?.deliveryDate), 415, y + 12)
  return y + 78
}

const columns = [
  { key: 'description', label: 'Tuote', x: page.left, width: 300, align: 'left' },
  { key: 'quantity', label: 'M\u00e4\u00e4r\u00e4', x: page.left + 300, width: 60, align: 'center' },
  { key: 'unitPrice', label: 'ALV 0 %', x: page.left + 360, width: 72, align: 'right' },
  { key: 'total', label: 'Yhteens\u00e4', x: page.left + 432, width: 79, align: 'right' },
]

const drawTableHeader = (doc, y) => {
  doc.rect(page.left, y, page.right - page.left, 26).fill(colors.accent)
  for (const column of columns) {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(colors.white).text(column.label, column.x + 7, y + 9, {
      width: column.width - 14,
      align: column.align,
      lineBreak: false,
    })
  }
  return y + 26
}

const getItemRow = (item) => {
  const options = getOptionDetails(item?.selectedOptions)
  const unitPrice = Number(item?.unitPrice) || 0
  const quantity = Math.max(0, Number(item?.quantity) || 0)
  return {
    description: `${cleanText(item?.name, 'Tuote')}${options ? `\n${options}` : ''}`,
    quantity: String(quantity),
    unitPrice: money(unitPrice),
    total: money(unitPrice * quantity),
  }
}

const getRowHeight = (doc, row) => {
  doc.font('Helvetica').fontSize(8.5)
  return Math.max(31, doc.heightOfString(row.description, { width: columns[0].width - 14, lineGap: 1 }) + 12)
}

const drawTableRow = (doc, row, y, height, shaded = false) => {
  doc.rect(page.left, y, page.right - page.left, height).fill(shaded ? colors.panel : colors.white)
  doc.moveTo(page.left, y + height).lineTo(page.right, y + height).lineWidth(0.5).strokeColor(colors.border).stroke()
  for (const column of columns) {
    doc.font('Helvetica').fontSize(8.5).fillColor(colors.ink).text(row[column.key], column.x + 7, y + 9, {
      width: column.width - 14,
      align: column.align,
      lineGap: 1,
    })
  }
}

const drawTotals = (doc, order, y) => {
  const netTotal = Number(order.total ?? (Number(order.subtotal) + Number(order.shipping))) || 0
  const vatAmount = Number(order.vatAmount ?? vatFromNet(netTotal)) || 0
  const grossTotal = Number(order.grossTotal ?? grossFromNet(netTotal)) || 0
  const x = 365
  const valueX = 470

  doc.font('Helvetica').fontSize(9.5).fillColor(colors.ink)
  doc.text('Veroton yhteens\u00e4', x, y, { width: 100, align: 'right' })
  doc.text(money(netTotal), valueX, y, { width: page.right - valueX, align: 'right' })
  doc.text('ALV 25,5 %', x, y + 21, { width: 100, align: 'right' })
  doc.text(money(vatAmount), valueX, y + 21, { width: page.right - valueX, align: 'right' })
  doc.moveTo(x, y + 40).lineTo(page.right, y + 40).lineWidth(1).strokeColor(colors.accent).stroke()
  doc.font('Helvetica-Bold').fontSize(10.5)
  doc.text('Yhteens\u00e4', x, y + 48, { width: 100, align: 'right' })
  doc.text(money(grossTotal), valueX, y + 48, { width: page.right - valueX, align: 'right' })
  return y + 82
}

const drawThanks = (doc, order, y) => {
  doc.roundedRect(page.left, y, page.right - page.left, 62, 7).fill(colors.panel)
  doc.font('Helvetica-Bold').fontSize(10).fillColor(colors.ink).text('Kiitos tilauksesta!', page.left + 15, y + 13)
  doc.font('Helvetica').fontSize(8.8).text(
    `T\u00e4m\u00e4 kuitti koskee maksettua tilausta ${cleanText(order.id, '-')}.`,
    page.left + 15,
    y + 31,
  )
}

const drawFooter = (doc, currentPage, pageCount) => {
  doc.moveTo(page.left, 785).lineTo(page.right, 785).lineWidth(0.7).strokeColor(colors.border).stroke()
  doc.font('Helvetica').fontSize(7.8).fillColor(colors.muted)
  doc.text('Suomen Paperitukku - Kastamonu Tmi - Y-tunnus 3590057-8', page.left, 798, { lineBreak: false })
  doc.text('info@suomenpaperitukku.fi  |  +358 44 978 2446', 320, 798, {
    width: page.right - 320,
    align: 'right',
    lineBreak: false,
  })
  if (pageCount > 1) {
    doc.text(`Sivu ${currentPage} / ${pageCount}`, 450, 814, {
      width: page.right - 450,
      align: 'right',
      lineBreak: false,
    })
  }
}

export const getReceiptFilename = (orderId) => {
  const safeId = cleanText(orderId, 'tilaus').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return `kuitti-${safeId || 'tilaus'}.pdf`
}

export const isPaidPaytrailOrder = (order) =>
  order?.paymentMethod === 'paytrail' && order?.paymentStatus === 'paid'

export const createReceiptPdf = (order, options = {}) => {
  if (!order || typeof order !== 'object') {
    return Promise.reject(new TypeError('Order is required for receipt generation'))
  }
  if (!isPaidPaytrailOrder(order)) {
    return Promise.reject(new TypeError('Receipt can only be generated for a paid Paytrail order'))
  }

  const generatedAt = options.generatedAt instanceof Date ? options.generatedAt : new Date()
  const paymentDate = order.paytrail?.lastUpdatedAt || generatedAt
  const logoPath = options.logoPath || defaultLogoPath
  const items = Array.isArray(order.items) ? order.items : []

  return new Promise((resolve, reject) => {
    const chunks = []
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      bufferPages: true,
      info: {
        Title: `Kuitti ${cleanText(order.id, '')}`.trim(),
        Author: 'Suomen Paperitukku',
        Subject: 'Maksukuitti',
        Creator: 'Suomen Paperitukku',
      },
    })

    doc.receiptLogoPath = logoPath
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    drawHeader(doc, order, paymentDate)
    drawPartyDetails(doc, order)
    let y = drawPaymentPanel(doc, order)
    y = drawTableHeader(doc, y)

    items.forEach((item, index) => {
      const row = getItemRow(item)
      const rowHeight = getRowHeight(doc, row)
      if (y + rowHeight > page.contentBottom - 135) {
        doc.addPage()
        drawHeader(doc, order, paymentDate)
        y = drawTableHeader(doc, 125)
      }
      drawTableRow(doc, row, y, rowHeight, index % 2 === 1)
      y += rowHeight
    })

    const shipping = Number(order.shipping) || 0
    const shippingRow = {
      description: 'Toimitus',
      quantity: '1',
      unitPrice: money(shipping),
      total: money(shipping),
    }
    if (y + 31 > page.contentBottom - 135) {
      doc.addPage()
      drawHeader(doc, order, paymentDate)
      y = drawTableHeader(doc, 125)
    }
    drawTableRow(doc, shippingRow, y, 31, true)
    y += 48

    if (y + 160 > page.contentBottom) {
      doc.addPage()
      drawHeader(doc, order, paymentDate)
      y = 135
    }
    y = drawTotals(doc, order, y)
    drawThanks(doc, order, Math.min(y + 20, 690))

    const range = doc.bufferedPageRange()
    for (let index = 0; index < range.count; index += 1) {
      doc.switchToPage(range.start + index)
      drawFooter(doc, index + 1, range.count)
    }

    doc.end()
  })
}

export const createReceiptAttachment = async (order, options = {}) => {
  if (!isPaidPaytrailOrder(order)) {
    return null
  }

  return {
    filename: getReceiptFilename(order.id),
    content: await createReceiptPdf(order, options),
    contentType: 'application/pdf',
  }
}
