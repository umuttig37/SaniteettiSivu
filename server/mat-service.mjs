import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const configFile = path.resolve(__dirname, '..', 'config', 'mat-service.json')

export const matServiceConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'))

export const matServiceFaq = matServiceConfig.faq

export const formatMatPrice = (value) => Number(value).toFixed(2).replace('.', ',')

export const getLowestMatPrice = () =>
  Math.min(
    ...matServiceConfig.sizes.flatMap((size) =>
      Object.values(size.prices).flatMap((prices) => Object.values(prices)),
    ),
  )

export const getMinimumPricesBySize = (size) => ({
  weekly: Math.min(...Object.values(size.prices).map((prices) => prices.weekly)),
  twiceMonthly: Math.min(...Object.values(size.prices).map((prices) => prices.twiceMonthly)),
  monthly: Math.min(...Object.values(size.prices).map((prices) => prices.monthly)),
})

export const getMatServiceDefinition = (serviceType = 'mat') =>
  matServiceConfig.services[String(serviceType ?? '')] ?? null

export const getMatServiceSizes = (serviceType = 'mat') => {
  const service = getMatServiceDefinition(serviceType)
  if (!service) return []
  if (Array.isArray(service.sizes)) return service.sizes
  return matServiceConfig.sizes.filter((size) => service.sizeIds.includes(size.id))
}

export const getMatServiceColors = (serviceType = 'mat') => {
  const service = getMatServiceDefinition(serviceType)
  if (!service) return {}
  if (Array.isArray(service.colors)) {
    return Object.fromEntries(service.colors.map((color) => [color.id, color]))
  }
  return matServiceConfig.colors
}

export const resolveMatSelection = ({ serviceType = 'mat', size: sizeId, color, interval, quantity }) => {
  const normalizedServiceType = String(serviceType ?? 'mat')
  const service = getMatServiceDefinition(normalizedServiceType)
  if (!service || service.enabled === false) return null
  const size = getMatServiceSizes(normalizedServiceType).find((item) => item.id === String(sizeId ?? ''))
  const colorDefinition = getMatServiceColors(normalizedServiceType)[String(color ?? '')]
  const intervalLabel = matServiceConfig.intervals[String(interval ?? '')]
  const intervalIsAvailable = !Array.isArray(service.intervalIds) || service.intervalIds.includes(String(interval ?? ''))
  const quoteOnly = Boolean(service.quoteOnly)
  const unitPrice = normalizedServiceType === 'mat'
    ? size?.prices?.[String(color ?? '')]?.[String(interval ?? '')]
    : size?.intervalPrices?.[String(interval ?? '')] ?? service?.unitWeeklyPrice
  const normalizedQuantity = Number(quantity)

  if (!size || !colorDefinition || !intervalLabel || !intervalIsAvailable || (!quoteOnly && !Number.isFinite(unitPrice))) {
    return null
  }
  if (!Number.isInteger(normalizedQuantity) || normalizedQuantity < 1 || normalizedQuantity > 1_000) {
    return null
  }

  return {
    serviceType: normalizedServiceType,
    serviceLabel: service.label,
    sizeId: size.id,
    sizeLabel: size.label,
    color: String(color),
    colorLabel: colorDefinition.label,
    interval: String(interval),
    intervalLabel,
    quantity: normalizedQuantity,
    quoteOnly,
    unitPrice: quoteOnly ? null : Number(unitPrice),
    weeklyTotal: quoteOnly ? null : Math.round(Number(unitPrice) * normalizedQuantity * 100) / 100,
  }
}

export const resolveMatSelections = (input = {}) => {
  const requestedSelections = Array.isArray(input.selections) ? input.selections : [input]
  if (requestedSelections.length < 1 || requestedSelections.length > 20) return null

  const selections = requestedSelections.map((selection) => resolveMatSelection(selection ?? {}))
  if (selections.some((selection) => !selection)) return null
  return selections
}

export const createMatOrderMailMessages = ({ from, ownerRecipients, customerEmail, ownerHtml, customerHtml }) => {
  const recipients = Array.isArray(ownerRecipients)
    ? ownerRecipients.map((recipient) => String(recipient ?? '').trim()).filter(Boolean)
    : [String(ownerRecipients ?? '').trim()].filter(Boolean)
  const normalizedCustomerEmail = String(customerEmail ?? '').trim()

  return [
    {
      from,
      to: recipients.join(','),
      replyTo: normalizedCustomerEmail,
      subject: 'Lindström mattopalvelun uusi tilauspyyntö',
      html: ownerHtml,
    },
    {
      from,
      to: normalizedCustomerEmail,
      subject: 'Mattopalvelun tilauspyyntö vastaanotettu',
      html: customerHtml,
    },
  ]
}

export const allowedAttachmentTypes = new Map([
  ['application/pdf', ['pdf']],
  ['image/jpeg', ['jpg', 'jpeg']],
  ['image/png', ['png']],
])

export const maxMatAttachmentBytes = 10 * 1024 * 1024

export const decodePrivateAttachment = (input) => {
  if (!input) {
    return null
  }

  const filename = String(input.name ?? '').trim()
  const mimeType = String(input.type ?? '').trim().toLowerCase()
  const extension = filename.split('.').pop()?.toLowerCase() ?? ''
  const allowedExtensions = allowedAttachmentTypes.get(mimeType)
  if (!filename || !allowedExtensions?.includes(extension)) {
    throw new Error('Liitteen tiedostomuodon pitää olla PDF, JPG, JPEG tai PNG.')
  }

  const base64 = String(input.base64 ?? '').trim()
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new Error('Liitetiedosto on virheellinen.')
  }
  const content = Buffer.from(base64, 'base64')
  if (content.length === 0 || content.length > maxMatAttachmentBytes) {
    throw new Error('Liitetiedoston enimmäiskoko on 10 Mt.')
  }

  const validMagic =
    (mimeType === 'application/pdf' && content.subarray(0, 5).toString('ascii') === '%PDF-') ||
    (mimeType === 'image/jpeg' && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) ||
    (mimeType === 'image/png' && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))

  if (!validMagic) {
    throw new Error('Liitetiedoston sisältö ei vastaa sallittua tiedostomuotoa.')
  }

  const safeBase = path.basename(filename).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120)
  return {
    filename: safeBase || `liite.${extension}`,
    content,
    contentType: mimeType,
  }
}
