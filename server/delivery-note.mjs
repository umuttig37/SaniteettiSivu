import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultLogoPath = path.resolve(__dirname, '..', 'public', 'brand-logo.png')

const page = {
  width: 595.28,
  height: 841.89,
  left: 42,
  right: 553,
  contentBottom: 764,
}

const colors = {
  ink: '#18243a',
  muted: '#58677f',
  border: '#d6deeb',
  panel: '#f5f8fc',
  header: '#13233f',
  accent: '#bd8429',
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

const getItemUnit = (item) => {
  const optionLabel = (Array.isArray(item?.selectedOptions) ? item.selectedOptions : [])
    .find((option) => /yksikk|unit/i.test(cleanText(option?.groupName)))
    ?.valueLabel
  const priceUnit = cleanText(item?.priceUnit)
  const rawUnit = cleanText(optionLabel) || priceUnit.split('/').at(-1)?.trim() || 'kpl'
  const normalized = rawUnit.toLocaleLowerCase('fi-FI')
  const abbreviations = new Map([
    ['kappale', 'KPL'],
    ['kpl', 'KPL'],
    ['laatikko', 'LTK'],
    ['lava', 'LAVA'],
    ['paketti', 'PKT'],
    ['pussi', 'PSS'],
    ['pullo', 'PLL'],
    ['rasia', 'RAS'],
    ['rulla', 'RLL'],
    ['säkki', 'SK'],
  ])

  return abbreviations.get(normalized) || rawUnit.toLocaleUpperCase('fi-FI').slice(0, 8)
}

const drawHeader = (doc) => {
  if (fs.existsSync(doc.deliveryNoteLogoPath)) {
    doc.image(doc.deliveryNoteLogoPath, page.left, 38, { fit: [185, 58], align: 'left', valign: 'center' })
  } else {
    doc.font('Helvetica-Bold').fontSize(16).fillColor(colors.ink).text('Suomen Paperitukku', page.left, 58)
  }

  doc.font('Helvetica-Bold').fontSize(22).fillColor(colors.ink).text('LÄHETE', 395, 45, {
    width: page.right - 395,
    align: 'right',
  })
  doc.moveTo(page.left, 108).lineTo(page.right, 108).lineWidth(2).strokeColor(colors.accent).stroke()
}

const drawFooter = (doc, currentPage, pageCount) => {
  doc.moveTo(page.left, 786).lineTo(page.right, 786).lineWidth(0.7).strokeColor(colors.border).stroke()
  doc.font('Helvetica').fontSize(8.5).fillColor(colors.muted)
  doc.text('Suomen Paperitukku  |  suomenpaperitukku.fi', page.left, 797, { lineBreak: false })
  doc.text('info@suomenpaperitukku.fi  |  +358 44 978 2446', page.left, 811, { lineBreak: false })
  doc.text(`Sivu ${currentPage} / ${pageCount}`, 455, 797, {
    width: page.right - 455,
    align: 'right',
    lineBreak: false,
  })
  doc.text('Y-tunnus 3590057-8', 430, 811, {
    width: page.right - 430,
    align: 'right',
    lineBreak: false,
  })
}

const drawLabelValue = (doc, label, value, x, y, width) => {
  doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.ink).text(label, x, y, { width })
  doc.font('Helvetica').fontSize(9).fillColor(colors.muted).text(cleanText(value, '-'), x, y + 13, { width })
}

const drawOrderDetails = (doc, order, generatedAt) => {
  const customer = order.customer ?? {}
  const recipientLines = [
    cleanText(customer.company),
    cleanText(customer.contact),
    cleanText(customer.address),
    [cleanText(customer.zip), cleanText(customer.city)].filter(Boolean).join(' '),
  ].filter(Boolean)
  const contactLines = [cleanText(customer.phone), cleanText(customer.email)].filter(Boolean)

  doc.font('Helvetica-Bold').fontSize(11).fillColor(colors.ink).text('Vastaanottaja', page.left, 133)
  doc.font('Helvetica').fontSize(9.5).fillColor(colors.ink).text(recipientLines.join('\n') || '-', page.left, 151, {
    width: 225,
    lineGap: 2,
  })
  if (contactLines.length > 0) {
    doc.font('Helvetica').fontSize(8.5).fillColor(colors.muted).text(contactLines.join('  |  '), page.left, 211, {
      width: 255,
    })
  }

  drawLabelValue(doc, 'Lähetyspäivä', formatDate(order.shippedAt || generatedAt), 310, 133, 105)
  drawLabelValue(doc, 'Tilausnumero', cleanText(order.id, '-'), 434, 133, 119)
  drawLabelValue(doc, 'Pyydetty toimituspäivä', formatDate(customer.deliveryDate), 310, 174, 170)

  return 230
}

const drawNotes = (doc, notes, startY) => {
  const text = cleanText(notes)
  if (!text) {
    return startY
  }

  doc.font('Helvetica-Bold').fontSize(10).fillColor(colors.ink).text('Toimitusohje', page.left, startY)
  const textHeight = Math.max(34, doc.font('Helvetica').fontSize(9).heightOfString(text, {
    width: page.right - page.left - 18,
    lineGap: 2,
  }) + 16)
  doc.roundedRect(page.left, startY + 17, page.right - page.left, textHeight, 4)
    .fillAndStroke(colors.panel, colors.border)
  doc.font('Helvetica').fontSize(9).fillColor(colors.ink).text(text, page.left + 9, startY + 25, {
    width: page.right - page.left - 18,
    lineGap: 2,
  })
  return startY + textHeight + 35
}

const columns = [
  { key: 'sku', label: 'Tuotenro', x: page.left, width: 68, align: 'left' },
  { key: 'description', label: 'Erittely', x: page.left + 68, width: 285, align: 'left' },
  { key: 'ordered', label: 'Tilattu', x: page.left + 353, width: 48, align: 'center' },
  { key: 'delivered', label: 'Toimitettu', x: page.left + 401, width: 60, align: 'center' },
  { key: 'unit', label: 'Yks.', x: page.left + 461, width: 50, align: 'center' },
]

const drawProductsHeading = (doc, y, continued = false) => {
  doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.ink).text(
    continued ? 'Tuotteet (jatkuu)' : 'Tuotteet',
    page.left,
    y,
  )
  return y + 23
}

const drawTableHeader = (doc, y) => {
  const height = 24
  doc.rect(page.left, y, page.right - page.left, height).fill(colors.header)
  for (const column of columns) {
    doc.font('Helvetica-Bold').fontSize(7.8).fillColor(colors.white).text(column.label, column.x + 5, y + 8, {
      width: column.width - 10,
      align: column.align,
      lineBreak: false,
    })
  }
  return y + height
}

const getRow = (item) => {
  const options = getOptionDetails(item?.selectedOptions)
  return {
    sku: cleanText(item?.sku || item?.productId, '-'),
    description: `${cleanText(item?.name, 'Tuote')}${options ? `\n${options}` : ''}`,
    ordered: String(Math.max(0, Number(item?.quantity) || 0)),
    delivered: String(Math.max(0, Number(item?.quantity) || 0)),
    unit: getItemUnit(item),
  }
}

const getRowHeight = (doc, row) => {
  doc.font('Helvetica').fontSize(8.3)
  return Math.max(
    27,
    doc.heightOfString(row.description, { width: columns[1].width - 10, lineGap: 1 }) + 11,
    doc.heightOfString(row.sku, { width: columns[0].width - 10 }) + 11,
  )
}

const drawRow = (doc, row, y, height, index) => {
  doc.rect(page.left, y, page.right - page.left, height).fill(index % 2 === 0 ? colors.white : colors.panel)
  doc.rect(page.left, y, page.right - page.left, height).lineWidth(0.5).strokeColor(colors.border).stroke()

  for (let index = 1; index < columns.length; index += 1) {
    doc.moveTo(columns[index].x, y).lineTo(columns[index].x, y + height).lineWidth(0.5).strokeColor(colors.border).stroke()
  }

  for (const column of columns) {
    doc.font('Helvetica').fontSize(8.3).fillColor(colors.ink).text(row[column.key], column.x + 5, y + 7, {
      width: column.width - 10,
      align: column.align,
      lineGap: 1,
    })
  }
}

const drawSignature = (doc, startY) => {
  doc.font('Helvetica').fontSize(8.2).fillColor(colors.muted).text(
    'Vastaanottaja vahvistaa allekirjoituksellaan tuotteiden vastaanoton.',
    page.left,
    startY,
  )

  const y = startY + 19
  const height = 54
  const widths = [220, 100, 191]
  const labels = ['Vastaanottajan kuittaus', 'Päivämäärä', 'Nimenselvennys']
  let x = page.left

  for (let index = 0; index < widths.length; index += 1) {
    doc.rect(x, y, widths[index], height).lineWidth(0.6).strokeColor(colors.border).stroke()
    doc.font('Helvetica').fontSize(8.5).fillColor(colors.ink).text(labels[index], x + 7, y + 7, {
      width: widths[index] - 14,
    })
    x += widths[index]
  }
}

export const getDeliveryNoteFilename = (orderId) => {
  const safeId = cleanText(orderId, 'tilaus').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return `lahete-${safeId || 'tilaus'}.pdf`
}

export const createDeliveryNotePdf = (order, options = {}) => {
  if (!order || typeof order !== 'object') {
    return Promise.reject(new TypeError('Order is required for delivery note generation'))
  }

  const generatedAt = options.generatedAt instanceof Date ? options.generatedAt : new Date()
  const logoPath = options.logoPath || defaultLogoPath
  const items = Array.isArray(order.items) ? order.items : []

  return new Promise((resolve, reject) => {
    const chunks = []
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      bufferPages: true,
      info: {
        Title: `Lähete ${cleanText(order.id, '')}`.trim(),
        Author: 'Suomen Paperitukku',
        Subject: 'Toimituslähete',
        Creator: 'Suomen Paperitukku',
      },
    })

    doc.deliveryNoteLogoPath = logoPath
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    drawHeader(doc)
    let y = drawOrderDetails(doc, order, generatedAt)
    y = drawNotes(doc, order.customer?.notes, y)
    y = drawProductsHeading(doc, y)
    y = drawTableHeader(doc, y)

    items.forEach((item, index) => {
      const row = getRow(item)
      const rowHeight = getRowHeight(doc, row)
      if (y + rowHeight > page.contentBottom) {
        doc.addPage()
        drawHeader(doc)
        y = drawProductsHeading(doc, 132, true)
        y = drawTableHeader(doc, y)
      }
      drawRow(doc, row, y, rowHeight, index)
      y += rowHeight
    })

    if (items.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor(colors.muted).text('Tilauksella ei ole tuoterivejä.', page.left + 8, y + 10)
      y += 40
    }

    if (y + 96 > page.contentBottom) {
      doc.addPage()
      drawHeader(doc)
      y = 140
    } else {
      y += 20
    }
    drawSignature(doc, y)

    const range = doc.bufferedPageRange()
    for (let index = 0; index < range.count; index += 1) {
      doc.switchToPage(range.start + index)
      drawFooter(doc, index + 1, range.count)
    }

    doc.end()
  })
}
