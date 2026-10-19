import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import rawConfig from '../config/mat-service.json'
import './MatServicePage.css'

type IntervalId = 'weekly' | 'twiceMonthly' | 'monthly'
type MatServiceType = 'mat' | 'design' | 'industrial'
type BillingMethod = 'invoice' | 'einvoice'
type MatSelectionDraft = {
  serviceType: MatServiceType
  size: string
  color: string
  interval: IntervalId | ''
  quantity: number
  notes: string
}
type SavedMatSelection = MatSelectionDraft & { id: string }
type ContactDetails = {
  firstName: string
  lastName: string
  locationName: string
  company: string
  businessId: string
  email: string
  phone: string
  address: string
  postalCode: string
  city: string
}

type MatServiceState = MatSelectionDraft & {
  startMode: 'asap' | 'selectedWeek'
  startWeek: string
  deliveryDetails: ContactDetails
  deliveryNotes: string
  billingSameAsDelivery: boolean
  billingDetails: ContactDetails
  billingMethod: BillingMethod
  eInvoiceAddress: string
  eInvoiceOperator: string
}

type QuoteState = {
  company: string
  businessId: string
  contactName: string
  email: string
  phone: string
  location: string
  matCount: string
  interval: string
  notes: string
  website: string
}

type MatColor = { id?: string; label: string; hex?: string; image?: string }
type MatPrices = Record<string, Record<IntervalId, number>>
type MatSize = { id: string; label: string; prices: MatPrices }
type MatOptionSize = {
  id: string
  label: string
  prices?: MatPrices
  intervalPrices?: Record<IntervalId, number>
}
type MatServiceDefinition = {
  enabled?: boolean
  quoteOnly?: boolean
  label: string
  description: string
  images: string[]
  sizeIds?: string[]
  sizes?: MatOptionSize[]
  colors?: Array<MatColor & { id: string }>
  intervalIds?: IntervalId[]
  unitWeeklyPrice?: number
}
type MatConfig = {
  path: string
  imageNote: string
  images: { hero: string; service: string }
  services: Record<MatServiceType, MatServiceDefinition>
  marketingMessage: string
  serviceAreaText: string
  faq: Array<{ question: string; answer: string }>
  intervals: Record<IntervalId, string>
  colors: Record<string, MatColor>
  sizes: MatSize[]
}

const config = rawConfig as MatConfig
const isServiceEnabled = (serviceType: MatServiceType) => config.services[serviceType].enabled !== false
const normalizeServiceType = (value: unknown): MatServiceType => {
  const serviceType = value === 'design' || value === 'industrial' ? value : 'mat'
  return isServiceEnabled(serviceType) ? serviceType : 'mat'
}
const initialHelpPromptDelayMs = 60 * 1000
const repeatHelpPromptDelayMs = 13 * 60 * 1000
const emptyContact = (): ContactDetails => ({
  firstName: '',
  lastName: '',
  locationName: '',
  company: '',
  businessId: '',
  email: '',
  phone: '',
  address: '',
  postalCode: '',
  city: '',
})

const emptyQuote = (): QuoteState => ({
  company: '',
  businessId: '',
  contactName: '',
  email: '',
  phone: '',
  location: '',
  matCount: '',
  interval: '',
  notes: '',
  website: '',
})

const emptyMatSelection = (): MatSelectionDraft => ({
  serviceType: 'mat',
  size: '',
  color: '',
  interval: '',
  quantity: 1,
  notes: '',
})

const initialState = (): MatServiceState => ({
  ...emptyMatSelection(),
  startMode: 'asap',
  startWeek: '',
  deliveryDetails: emptyContact(),
  deliveryNotes: '',
  billingSameAsDelivery: false,
  billingDetails: emptyContact(),
  billingMethod: 'invoice',
  eInvoiceAddress: '',
  eInvoiceOperator: '',
})

const formatPrice = (value: number) => value.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const getLowestPrice = () => Math.min(
  ...config.sizes.flatMap((size) => Object.values(size.prices).flatMap((prices) => Object.values(prices).map(Number))),
)

const getMinimumPrice = (size: MatSize, interval: IntervalId) => Math.min(
  ...Object.values(size.prices).map((prices) => prices[interval]),
)

const getStartingPrice = (interval: IntervalId) => Math.min(
  ...config.sizes.map((size) => getMinimumPrice(size, interval)),
)

const priceIntervals: Array<{ id: IntervalId; label: string; description: string }> = [
  { id: 'monthly', label: 'Kerran kuukaudessa', description: 'Kevyeen käyttöön' },
  { id: 'twiceMonthly', label: '2 kertaa kuukaudessa', description: 'Arjen varma valinta' },
  { id: 'weekly', label: 'Joka viikko', description: 'Vilkkaisiin tiloihin' },
]

const getSizesForService = (serviceType: MatServiceType): MatOptionSize[] => {
  const service = config.services[serviceType]
  if (!isServiceEnabled(serviceType)) return []
  if (service.sizes) return service.sizes
  return config.sizes.filter((size) => service.sizeIds?.includes(size.id))
}

const getColorsForService = (serviceType: MatServiceType, size?: MatOptionSize): Array<MatColor & { id: string }> => {
  const service = config.services[serviceType]
  if (!isServiceEnabled(serviceType)) return []
  if (service.colors) return service.colors
  const colorIds = size?.prices
    ? Object.keys(size.prices)
    : [...new Set(getSizesForService(serviceType).flatMap((item) => Object.keys(item.prices ?? {})))]
  return colorIds.map((id) => ({ id, ...config.colors[id] }))
}

const getSelectionUnitPrice = (selection: MatSelectionDraft) => {
  if (!selection.interval) return undefined
  const service = config.services[selection.serviceType]
  if (service.quoteOnly) return undefined
  const size = getSizesForService(selection.serviceType).find((item) => item.id === selection.size)
  if (!size) return undefined
  return selection.serviceType === 'mat'
    ? size.prices?.[selection.color]?.[selection.interval]
    : size.intervalPrices?.[selection.interval] ?? service.unitWeeklyPrice
}

const isSelectionStarted = (selection: MatSelectionDraft) => Boolean(
  selection.size || selection.color || selection.interval || selection.notes.trim() || selection.quantity !== 1,
)

const isSelectionComplete = (selection: MatSelectionDraft) => {
  const service = config.services[selection.serviceType]
  const size = getSizesForService(selection.serviceType).find((item) => item.id === selection.size)
  const hasColor = getColorsForService(selection.serviceType, size).some((color) => color.id === selection.color)
  const hasInterval = Boolean(selection.interval && (!service.intervalIds || service.intervalIds.includes(selection.interval)))
  return Boolean(
    size
    && hasColor
    && hasInterval
    && (service.quoteOnly || Number.isFinite(getSelectionUnitPrice(selection)))
    && Number.isInteger(selection.quantity)
    && selection.quantity > 0,
  )
}

const getSelectionDetails = (
  selection: MatSelectionDraft,
  galleryIndexes: Record<MatServiceType, number>,
) => {
  const service = config.services[selection.serviceType]
  const sizes = getSizesForService(selection.serviceType)
  const size = sizes.find((item) => item.id === selection.size)
  const colors = getColorsForService(selection.serviceType, size)
  const color = colors.find((item) => item.id === selection.color)
  const unitPrice = size && color ? getSelectionUnitPrice(selection) : undefined
  const weeklyTotal = unitPrice === undefined
    ? null
    : Math.round(unitPrice * selection.quantity * 100) / 100
  const imageIndex = galleryIndexes[selection.serviceType] % service.images.length

  return {
    service,
    sizes,
    size,
    colors,
    color,
    unitPrice,
    weeklyTotal,
    image: service.images[imageIndex],
  }
}

const getNextWeek = () => {
  const date = new Date()
  date.setDate(date.getDate() + 7)
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const weekday = utcDate.getUTCDay() || 7
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - weekday)
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
const trackEvent = (eventName: string) => {
  const trackedWindow = window as Window & {
    gtag?: (...args: unknown[]) => void
    dataLayer?: Array<Record<string, unknown>>
  }
  if (typeof trackedWindow.gtag === 'function') {
    trackedWindow.gtag('event', eventName)
  } else if (Array.isArray(trackedWindow.dataLayer)) {
    trackedWindow.dataLayer.push({ event: eventName })
  }
}

const scrollToSection = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const ContactFields = ({
  value,
  onChange,
  includeLocationName = false,
  required = true,
}: {
  value: ContactDetails
  onChange: (next: ContactDetails) => void
  includeLocationName?: boolean
  required?: boolean
}) => {
  const update = (field: keyof ContactDetails, nextValue: string) => onChange({ ...value, [field]: nextValue })
  return (
    <div className="mat-form-grid">
      <label className="mat-field">
        <span>Etunimi{required ? ' *' : ''}</span>
        <input required={required} value={value.firstName} onChange={(event) => update('firstName', event.target.value)} autoComplete="given-name" />
      </label>
      <label className="mat-field">
        <span>Sukunimi{required ? ' *' : ''}</span>
        <input required={required} value={value.lastName} onChange={(event) => update('lastName', event.target.value)} autoComplete="family-name" />
      </label>
      {includeLocationName && (
        <label className="mat-field mat-field-wide">
          <span>Toimituskohteen nimi</span>
          <input value={value.locationName} onChange={(event) => update('locationName', event.target.value)} />
        </label>
      )}
      <label className="mat-field">
        <span>Yritys{required ? ' *' : ''}</span>
        <input required={required} value={value.company} onChange={(event) => update('company', event.target.value)} autoComplete="organization" />
      </label>
      <label className="mat-field">
        <span>Y-tunnus{required ? ' *' : ''}</span>
        <input required={required} value={value.businessId} onChange={(event) => update('businessId', event.target.value)} inputMode="text" />
      </label>
      <label className="mat-field">
        <span>Sähköposti{required ? ' *' : ''}</span>
        <input required={required} type="email" value={value.email} onChange={(event) => update('email', event.target.value)} autoComplete="email" />
      </label>
      <label className="mat-field">
        <span>Puhelinnumero{required ? ' *' : ''}</span>
        <input required={required} type="tel" value={value.phone} onChange={(event) => update('phone', event.target.value)} autoComplete="tel" />
      </label>
      <label className="mat-field mat-field-wide">
        <span>Osoite{required ? ' *' : ''}</span>
        <input required={required} value={value.address} onChange={(event) => update('address', event.target.value)} autoComplete="street-address" />
      </label>
      <label className="mat-field">
        <span>Postinumero{required ? ' *' : ''}</span>
        <input required={required} value={value.postalCode} onChange={(event) => update('postalCode', event.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" autoComplete="postal-code" />
      </label>
      <label className="mat-field">
        <span>Kaupunki{required ? ' *' : ''}</span>
        <input required={required} value={value.city} onChange={(event) => update('city', event.target.value)} autoComplete="address-level2" />
      </label>
    </div>
  )
}

const serviceTypes = (['mat', 'design', 'industrial'] as const)
  .filter(isServiceEnabled)
  .map((id) => ({ id, ...config.services[id] }))

const benefits = [
  ['Puhtaat Lindström-vaihtomatot', 'Matot vaihdetaan puhtaisiin sovitun vaihtovälin mukaisesti.'],
  ['Ei omaa mattopesua', 'Mattopalvelu vähentää tarvetta huolehtia yrityksen mattojen pesusta itse.'],
  ['Valitse sopiva vaihtoväli', 'Valitse vaihto kerran kuukaudessa, kahdesti kuukaudessa tai viikoittain.'],
  ['Kilpailukykyinen yrityshinta', 'Lindström-vaihtomattopalvelu alkaen 1,99 € / matto / viikko + alv.'],
]

const postJson = async (url: string, payload: unknown) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = await response.json() as { ok?: boolean; message?: string }
  if (!response.ok) {
    throw new Error(result.message || 'Lähetys epäonnistui. Yritä hetken kuluttua uudelleen.')
  }
  return result
}

const ConfirmationIcon = ({ name }: { name: 'mail' | 'support' | 'truck' | 'document' | 'phone' | 'chat' }) => {
  const paths = {
    mail: <><rect x="3" y="5" width="18" height="14" rx="1" /><path d="m4 7 8 6 8-6" /></>,
    support: <><path d="M4 13v-1a8 8 0 0 1 16 0v1" /><path d="M4 13h3v6H5a1 1 0 0 1-1-1v-5Zm16 0h-3v6h2a1 1 0 0 0 1-1v-5Z" /><path d="M17 19c0 1.1-.9 2-2 2h-3" /></>,
    truck: <><path d="M3 6h11v11H3z" /><path d="M14 10h4l3 3v4h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
    document: <><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v4h4M9 11h6M9 15h6" /></>,
    phone: <path d="M7 3 4 5c0 7.2 5.8 13 13 13l2-3-4-2-2 2a12 12 0 0 1-4-4l2-2-2-4-2 1Z" />,
    chat: <><path d="M4 5h16v11H9l-5 4v-4H4z" /><path d="M8 9h8M8 12h5" /></>,
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

export default function MatServicePage() {
  const [state, setState] = useState<MatServiceState>(() => ({ ...initialState(), startWeek: getNextWeek() }))
  const [savedSelections, setSavedSelections] = useState<SavedMatSelection[]>([])
  const [editingSelectionId, setEditingSelectionId] = useState<string | null>(null)
  const [step, setStep] = useState(1)
  const [wizardError, setWizardError] = useState('')
  const [orderComplete, setOrderComplete] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [quote, setQuote] = useState<QuoteState>(emptyQuote)
  const [quoteStatus, setQuoteStatus] = useState({ loading: false, error: '', notice: '' })
  const [galleryIndexes, setGalleryIndexes] = useState<Record<MatServiceType, number>>({ mat: 0, design: 0, industrial: 0 })
  const [helpPromptOpen, setHelpPromptOpen] = useState(false)
  const calculatorTracked = useRef(false)
  const quoteTracked = useRef(false)
  const selectionId = useRef(0)
  const helpPromptTimer = useRef<number | null>(null)
  const lowestPrice = getLowestPrice()
  const selectedService = serviceTypes.find((service) => service.id === state.serviceType) ?? serviceTypes[0]
  const currentSelection = getSelectionDetails(state, galleryIndexes)
  const serviceSizes = currentSelection.sizes
  const selectedSize = currentSelection.size
  const availableColors = currentSelection.colors
  const selectedColor = currentSelection.color ?? null
  const selectedUnitPrice = currentSelection.unitPrice
  const weeklyTotal = currentSelection.weeklyTotal
  const selectedServiceImage = currentSelection.image
  const selectedQuoteOnly = Boolean(selectedService.quoteOnly)
  const minWeek = getNextWeek()
  const orderSelections = useMemo(() => {
    const completed = savedSelections.filter((selection) => selection.id !== editingSelectionId)
    if (isSelectionComplete(state)) {
      completed.push({ ...state, id: editingSelectionId ?? 'current' })
    }
    return completed
  }, [editingSelectionId, savedSelections, state])
  const orderSelectionDetails = orderSelections.map((selection) => ({
    selection,
    details: getSelectionDetails(selection, galleryIndexes),
  }))
  const orderWeeklyTotal = Math.round(orderSelectionDetails.reduce(
    (total, item) => total + (item.details.weeklyTotal ?? 0),
    0,
  ) * 100) / 100
  const pricedSelectionCount = orderSelectionDetails.filter((item) => item.details.weeklyTotal !== null).length
  const hasQuoteOnlySelections = orderSelectionDetails.some((item) => item.details.service.quoteOnly)
  const pricePrompt = !state.size && !state.color
    ? `Valitse koko ja ${state.serviceType === 'design' ? 'kuosi' : 'väri'} ensin`
    : !state.size
      ? 'Valitse koko ensin'
      : !state.color
        ? `Valitse ${state.serviceType === 'design' ? 'kuosi' : 'väri'} ensin`
        : !state.interval
          ? 'Valitse vaihtoväli ensin'
          : ''

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem('spt_mat_service_selection')
      if (!stored) return
      const parsed = JSON.parse(stored) as Partial<MatServiceState> & { selections?: SavedMatSelection[] }
      const nextWeek = getNextWeek()
      const restoredStartWeek = String(parsed.startWeek ?? '')
      setState((current) => ({
        ...current,
        serviceType: normalizeServiceType(parsed.serviceType),
        size: String(parsed.size ?? ''),
        color: String(parsed.color ?? ''),
        interval: parsed.interval === 'weekly' || parsed.interval === 'twiceMonthly' || parsed.interval === 'monthly' ? parsed.interval : '',
        quantity: Number.isInteger(parsed.quantity) && Number(parsed.quantity) > 0 ? Number(parsed.quantity) : 1,
        notes: String(parsed.notes ?? ''),
        startMode: parsed.startMode === 'selectedWeek' ? 'selectedWeek' : 'asap',
        startWeek: restoredStartWeek >= nextWeek ? restoredStartWeek : nextWeek,
      }))
      if (Array.isArray(parsed.selections)) {
        setSavedSelections(parsed.selections.slice(0, 20).map<SavedMatSelection>((selection, index) => {
          const serviceType = normalizeServiceType(selection.serviceType)
          const interval: IntervalId | '' = selection.interval === 'weekly' || selection.interval === 'twiceMonthly' || selection.interval === 'monthly' ? selection.interval : ''
          return {
            id: String(selection.id || `stored-${index + 1}`),
            serviceType,
            size: String(selection.size ?? ''),
            color: String(selection.color ?? ''),
            interval,
            quantity: Number.isInteger(selection.quantity) && Number(selection.quantity) > 0 ? Number(selection.quantity) : 1,
            notes: String(selection.notes ?? ''),
          }
        }).filter(isSelectionComplete))
      }
    } catch {
      // Invalid optional session data is ignored.
    }
  }, [])

  useEffect(() => {
    try {
      window.sessionStorage.setItem('spt_mat_service_selection', JSON.stringify({
        serviceType: state.serviceType,
        size: state.size,
        color: state.color,
        interval: state.interval,
        quantity: state.quantity,
        notes: state.notes,
        startMode: state.startMode,
        startWeek: state.startWeek,
        selections: savedSelections,
      }))
    } catch {
      // The calculator works without session storage.
    }
  }, [savedSelections, state.color, state.interval, state.notes, state.quantity, state.serviceType, state.size, state.startMode, state.startWeek])

  useEffect(() => {
    if (orderComplete) return
    helpPromptTimer.current = window.setTimeout(() => setHelpPromptOpen(true), initialHelpPromptDelayMs)
    return () => {
      if (helpPromptTimer.current !== null) window.clearTimeout(helpPromptTimer.current)
      helpPromptTimer.current = null
    }
  }, [orderComplete])

  const closeHelpPrompt = () => {
    setHelpPromptOpen(false)
    if (helpPromptTimer.current !== null) window.clearTimeout(helpPromptTimer.current)
    helpPromptTimer.current = window.setTimeout(() => setHelpPromptOpen(true), repeatHelpPromptDelayMs)
  }

  const openQuoteFromHelpPrompt = () => {
    closeHelpPrompt()
    window.requestAnimationFrame(() => scrollToSection('mat-quote'))
  }

  const updateState = <K extends keyof MatServiceState>(field: K, value: MatServiceState[K]) => {
    if (!calculatorTracked.current) {
      calculatorTracked.current = true
      trackEvent('mat_price_calculator_start')
    }
    setState((current) => ({ ...current, [field]: value }))
    setWizardError('')
  }

  const selectSize = (sizeId: string) => {
    const nextSize = serviceSizes.find((size) => size.id === sizeId)
    const nextColors = getColorsForService(state.serviceType, nextSize)
    setState((current) => {
      const colorRemainsAvailable = nextColors.some((color) => color.id === current.color)
      return {
        ...current,
        size: sizeId,
        color: colorRemainsAvailable ? current.color : '',
        interval: colorRemainsAvailable ? current.interval : '',
      }
    })
    if (!calculatorTracked.current) {
      calculatorTracked.current = true
      trackEvent('mat_price_calculator_start')
    }
    setWizardError('')
  }

  const selectService = (serviceType: MatServiceType) => {
    if (!calculatorTracked.current) {
      calculatorTracked.current = true
      trackEvent('mat_price_calculator_start')
    }
    setState((current) => current.serviceType === serviceType ? current : ({
      ...current,
      serviceType,
      size: '',
      color: '',
      interval: '',
    }))
    setWizardError('')
  }

  const changeGalleryImage = (serviceType: MatServiceType, direction: number) => {
    const imageCount = config.services[serviceType].images.length
    setGalleryIndexes((current) => ({
      ...current,
      [serviceType]: (current[serviceType] + direction + imageCount) % imageCount,
    }))
  }

  const selectionError = (selection: MatSelectionDraft) => {
    if (!selection.size && !selection.color) return `Valitse maton koko ja ${selection.serviceType === 'design' ? 'kuosi' : 'väri'}.`
    if (!selection.size) return 'Valitse maton koko.'
    if (!selection.color) return `Valitse maton ${selection.serviceType === 'design' ? 'kuosi' : 'väri'}.`
    if (!selection.interval) return 'Valitse vaihtoväli.'
    if (!Number.isInteger(selection.quantity) || selection.quantity < 1) return 'Määrän pitää olla vähintään 1.'
    return ''
  }

  const resetCurrentSelection = () => {
    setState((current) => ({ ...current, ...emptyMatSelection() }))
    setEditingSelectionId(null)
  }

  const saveAndAddSelection = () => {
    const error = selectionError(state)
    if (error) {
      setWizardError(error)
      return
    }
    const nextSelection: SavedMatSelection = {
      id: editingSelectionId ?? `mat-${Date.now()}-${++selectionId.current}`,
      serviceType: state.serviceType,
      size: state.size,
      color: state.color,
      interval: state.interval,
      quantity: state.quantity,
      notes: state.notes,
    }
    setSavedSelections((current) => editingSelectionId
      ? current.map((selection) => selection.id === editingSelectionId ? nextSelection : selection)
      : [...current, nextSelection])
    resetCurrentSelection()
    setWizardError('')
    requestAnimationFrame(() => document.getElementById('mat-selection-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const editSelection = (selection: SavedMatSelection) => {
    setState((current) => ({
      ...current,
      serviceType: selection.serviceType,
      size: selection.size,
      color: selection.color,
      interval: selection.interval,
      quantity: selection.quantity,
      notes: selection.notes,
    }))
    setEditingSelectionId(selection.id)
    setWizardError('')
    requestAnimationFrame(() => document.getElementById('mat-selection-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const removeSelection = (selectionIdToRemove: string) => {
    setSavedSelections((current) => current.filter((selection) => selection.id !== selectionIdToRemove))
    if (editingSelectionId === selectionIdToRemove) resetCurrentSelection()
  }

  const validateStep = (targetStep: number) => {
    if (targetStep === 1) {
      if (savedSelections.length === 0 || isSelectionStarted(state)) {
        const error = selectionError(state)
        if (error) return error
      }
      if (orderSelections.length === 0) return 'Lisää vähintään yksi matto.'
    }
    if (targetStep === 2 && state.startMode === 'selectedWeek' && (!state.startWeek || state.startWeek < minWeek)) {
      return 'Valitse aikaisintaan seuraava aloitusviikko.'
    }
    if (targetStep === 3) {
      const delivery = state.deliveryDetails
      if (!delivery.firstName || !delivery.lastName || !delivery.company || !delivery.businessId || !delivery.email || !delivery.phone || !delivery.address || !delivery.postalCode || !delivery.city) {
        return 'Täytä kaikki pakolliset toimitustiedot.'
      }
      if (!isValidEmail(delivery.email)) return 'Tarkista toimitustietojen sähköpostiosoite.'
      if (!/^\d{5}$/.test(delivery.postalCode)) return 'Postinumeron pitää sisältää 5 numeroa.'
      if (!state.billingSameAsDelivery) {
        const billing = state.billingDetails
        if (!billing.firstName || !billing.lastName || !billing.company || !billing.businessId || !billing.email || !billing.phone || !billing.address || !billing.postalCode || !billing.city) {
          return 'Täytä kaikki laskutustiedot tai valitse sama kuin toimitustiedot.'
        }
        if (!isValidEmail(billing.email)) return 'Tarkista laskutustietojen sähköpostiosoite.'
      }
      if (state.billingMethod === 'einvoice' && (!state.eInvoiceAddress.trim() || !state.eInvoiceOperator.trim())) {
        return 'Täytä E-laskuosoite ja verkkolaskuoperaattori.'
      }
    }
    return ''
  }

  const goNext = () => {
    const error = validateStep(step)
    if (error) {
      setWizardError(error)
      return
    }
    if (step === 3) trackEvent('mat_order_request_start')
    setStep((current) => Math.min(4, current + 1))
    setWizardError('')
    document.getElementById('mat-wizard')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const submitOrder = async () => {
    const error = validateStep(1) || validateStep(2) || validateStep(3)
    if (error) {
      setWizardError(error)
      return
    }
    setSubmitting(true)
    setWizardError('')
    try {
      await postJson('/api/mat-service/order-request', {
        ...state,
        selections: orderSelections.map(({ serviceType, size, color, interval, quantity, notes }) => ({ serviceType, size, color, interval, quantity, notes })),
        website: '',
      })
      try {
        window.sessionStorage.removeItem('spt_mat_service_selection')
      } catch {
        // Tilaus onnistuu myös ilman selaintallennusta.
      }
      setOrderComplete(true)
      window.scrollTo({ top: 0, behavior: 'auto' })
      trackEvent('mat_order_request_submit')
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
    } catch (submitError) {
      setWizardError(submitError instanceof Error ? submitError.message : 'Lähetys epäonnistui.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleQuoteSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setQuoteStatus({ loading: true, error: '', notice: '' })
    try {
      await postJson('/api/mat-service/quote-request', { kind: 'general', ...quote })
      setQuoteStatus({ loading: false, error: '', notice: 'Kiitos! Tarjouspyyntösi on vastaanotettu. Palaamme asiaan mahdollisimman pian.' })
      trackEvent('mat_quote_submit')
    } catch (submitError) {
      setQuoteStatus({ loading: false, error: submitError instanceof Error ? submitError.message : 'Lähetys epäonnistui.', notice: '' })
    }
  }

  const trackQuoteStart = () => {
    if (!quoteTracked.current) {
      quoteTracked.current = true
      trackEvent('mat_quote_start')
    }
  }

  const summary = useMemo(() => ({
    size: selectedSize?.label ?? '--',
    color: selectedColor?.label ?? '--',
    interval: state.interval ? config.intervals[state.interval] : '--',
  }), [selectedColor?.label, selectedSize?.label, state.interval])

  if (orderComplete) {
    return (
      <div className="mat-service-page mat-order-complete-page">
        <section className="mat-order-confirmation" aria-labelledby="mat-order-confirmation-title">
          <div className="mat-confirmation-hero">
            <div className="mat-confirmation-copy">
              <span className="mat-confirmation-kicker">Tilauspyyntö lähetetty</span>
              <h1 id="mat-order-confirmation-title">Kiitos tilauspyynnöstäsi!</h1>
              <p className="mat-confirmation-lead">Tilauspyyntösi Lindström-vaihtomatoista on lähetetty asiakaspalvelullemme. Saat vahvistuksen myös antamaasi sähköpostiosoitteeseen.</p>
            </div>
            <img src={config.images.hero} alt="Lindström-vaihtomatto yrityksen sisäänkäynnissä" />
          </div>
          <div className="mat-confirmation-highlights">
            <article><span className="mat-confirmation-icon"><ConfirmationIcon name="mail" /></span><div><h3>Vahvistus sähköpostiin</h3><p>Saat vahvistuksen tilauspyynnöstäsi sähköpostiisi.</p></div></article>
            <article><span className="mat-confirmation-icon"><ConfirmationIcon name="support" /></span><div><h3>Asiakaspalvelu käsittelee</h3><p>Tarkistamme tietosi ja palvelun saatavuuden.</p></div></article>
            <article><span className="mat-confirmation-icon"><ConfirmationIcon name="truck" /></span><div><h3>Toimitus sovitaan erikseen</h3><p>Sovimme ensimmäisestä toimituksesta kanssasi.</p></div></article>
          </div>
          <div className="mat-confirmation-heading">
            <h2>Mitä tapahtuu seuraavaksi?</h2>
            <p>Prosessi etenee seuraavasti ja pidämme sinut ajan tasalla.</p>
          </div>
          <div className="mat-confirmation-steps">
            <article><span className="mat-confirmation-number" aria-hidden="true">1</span><span className="mat-confirmation-step-icon"><ConfirmationIcon name="document" /></span><div><h3>Käymme pyyntösi läpi</h3><p>Tarkistamme antamasi tiedot ja palvelun saatavuuden. Tarvittaessa pyydämme lisätietoja.</p></div></article>
            <article><span className="mat-confirmation-number" aria-hidden="true">2</span><span className="mat-confirmation-step-icon"><ConfirmationIcon name="phone" /></span><div><h3>Vahvistamme aloituksen</h3><p>Asiakaspalvelumme ottaa sinuun yhteyttä ja sopii ensimmäisen toimituksen ajankohdan.</p></div></article>
            <article><span className="mat-confirmation-number" aria-hidden="true">3</span><span className="mat-confirmation-step-icon"><ConfirmationIcon name="truck" /></span><div><h3>Palvelu käynnistyy</h3><p>Puhtaat Lindström-vaihtomatot toimitetaan sovitusti ja palvelu käynnistyy.</p></div></article>
          </div>
          <div className="mat-confirmation-contact">
            <span className="mat-confirmation-icon"><ConfirmationIcon name="chat" /></span>
            <div><strong>Tarvitsetko apua?</strong><span>Autamme mielellämme kaikissa Lindström-vaihtomattoihin liittyvissä kysymyksissä.</span></div>
            <a href="tel:+358449782446"><ConfirmationIcon name="phone" />+358 44 978 2446</a>
            <a href="mailto:info@suomenpaperitukku.fi"><ConfirmationIcon name="mail" />info@suomenpaperitukku.fi</a>
          </div>
          <div className="mat-confirmation-actions">
            <a className="primary" href="/">Palaa etusivulle <span aria-hidden="true">→</span></a>
            <a className="ghost" href="/vaihtomatot-yrityksille">Tutustu Lindström-vaihtomattoihin</a>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="mat-service-page">
      <section className="mat-section mat-breadcrumbs" aria-label="Murupolku">
        <a href="/">Etusivu</a><span aria-hidden="true">/</span><span>Palvelut</span><span aria-hidden="true">/</span><span>Lindström-vaihtomatot yrityksille</span>
      </section>

      <section className="mat-hero">
        <img className="mat-hero-media" src={config.images.hero} alt="" fetchPriority="high" />
        <div className="mat-hero-copy">
          <span className="mat-eyebrow">Lindström-mattovuokraus yrityksille</span>
          <h1>Lindström-vaihtomatot yrityksille</h1>
          <div className="mat-mobile-price"><span>Alkaen</span><strong>{formatPrice(lowestPrice)} €</strong><small>/ matto / viikko + alv</small></div>
          <p>Tilaa Lindström-vaihtomatot yrityksellesi Suomen Paperitukun kautta. Valitse sopiva koko, väri ja vaihtoväli tai pyydä tarjous.</p>
          <div className="mat-hero-actions">
            <button className="primary" type="button" onClick={() => scrollToSection('mat-wizard')}>Laske hinta</button>
            <button className="ghost" type="button" onClick={() => { trackQuoteStart(); scrollToSection('mat-quote') }}>Pyydä tarjous</button>
          </div>
        </div>
        <div className="mat-hero-price" aria-label={`Alkaen ${formatPrice(lowestPrice)} euroa viikossa per matto plus arvonlisävero`}>
          <span>Alkaen</span><strong>{formatPrice(lowestPrice)} €</strong><small>/ matto / viikko + alv</small>
        </div>
      </section>

      <section className="mat-section mat-intro">
        <span className="mat-eyebrow">{config.marketingMessage}</span>
        <h2>Mattovuokraus helposti Suomen Paperitukulta</h2>
        <p>Suomen Paperitukun Lindström-vaihtomattopalvelu on helppo ratkaisu yrityksen sisäänkäyntien ja kulkuväylien siisteyteen. Mattovuokrauksessa valitset yrityksellesi sopivan maton koon, värin ja vaihtovälin. Palvelu sopii esimerkiksi toimistoihin, myymälöihin, ravintoloihin, halleihin ja muihin toimitiloihin.</p>
        <p>Vuokramatto vähentää sisätiloihin kulkeutuvaa likaa ja helpottaa toimitilojen puhtaanapitoa. Lindström-vaihtomatto vaihdetaan puhtaaseen sovitun vaihtovälin mukaisesti.</p>
      </section>

      <section className="mat-section mat-benefits" aria-label="Lindström-vaihtomattopalvelun hyödyt">
        {benefits.map(([title, text]) => <article key={title}><span aria-hidden="true">✓</span><div><h3>{title}</h3><p>{text}</p></div></article>)}
      </section>

      <section className="mat-section mat-price-section" id="mat-prices">
        <div className="mat-section-heading">
          <span className="mat-eyebrow">Selkeä yrityshinnasto</span>
          <h2>Lindström-vaihtomattojen hinnat yrityksille</h2>
          <p>Mattovuokrauksen hinta määräytyy maton koon, värin, vaihtovälin ja määrän perusteella. Valitse sopiva vaihtoväli, niin me hoidamme mattojen pesun ja vaihdon puolestasi.</p>
        </div>
        <div className="mat-price-showcase">
          <h3>Matot yrityksellesi alkaen {formatPrice(lowestPrice)} €/viikko</h3>
          <p>Selkeät aloitushinnat eri vaihtoväleille.</p>
          <div className="mat-price-cards">
            {priceIntervals.map((interval) => <article key={interval.id}>
              <h4>{interval.label}</h4>
              <span>Alkaen</span>
              <strong>{formatPrice(getStartingPrice(interval.id))} €</strong>
              <small>/ viikko</small>
              <p>{interval.description}</p>
            </article>)}
          </div>
          <p className="mat-price-note">Hinnat alv 0 %.</p>
          <button className="mat-price-cta" type="button" onClick={() => scrollToSection('mat-wizard')}>
            <span><strong>Laske yrityksellesi sopiva hinta</strong><small>Valitse koko, väri ja vaihtoväli alla olevasta laskurista.</small></span>
            <span aria-hidden="true">↓</span>
          </button>
        </div>
      </section>

      <section className="mat-section mat-calculator" id="mat-wizard">
        <div className="mat-section-heading">
          <span className="mat-eyebrow">Hintalaskuri ja tilauspyyntö</span>
          <h2>Laske hinta helposti ja tilaa</h2>
          <p>Valitse maton koko, väri, vaihtoväli ja määrä. Näet hinnan heti.</p>
        </div>
        <ol className="mat-stepper" aria-label="Tilauspyynnön vaiheet">
          {['Palvelun valinta', 'Palvelun aloitus', 'Yhteystiedot', 'Yhteenveto & lähetys'].map((label, index) => (
            <li key={label} className={step === index + 1 ? 'active' : step > index + 1 ? 'complete' : ''}>
              <span>{index + 1}</span><strong>{label}</strong>
            </li>
          ))}
        </ol>
        <div className="mat-wizard-layout">
          <div className="mat-wizard-main">
            {step === 1 && <div className="mat-wizard-panel">
              {savedSelections.length > 0 && <div className="mat-saved-selections">
                <h3>Valitut Lindström-matot</h3>
                {savedSelections.map((selection, index) => {
                  const details = getSelectionDetails(selection, galleryIndexes)
                  return <article className={`mat-saved-selection${editingSelectionId === selection.id ? ' editing' : ''}`} key={selection.id}>
                    <img src={details.image} alt="" loading="lazy" />
                    <div className="mat-saved-selection-copy">
                      <span className="mat-eyebrow">Matto {index + 1}</span>
                      <h4>{details.service.label}</h4>
                      <p>{details.size?.label} · {details.color?.label} · {selection.interval ? config.intervals[selection.interval] : ''} · {selection.quantity} kpl</p>
                      <strong>{details.service.quoteOnly ? 'Pyydä tarjous' : `${formatPrice(details.weeklyTotal ?? 0)} € / vko + alv`}</strong>
                    </div>
                    <div className="mat-saved-selection-actions">
                      <button type="button" onClick={() => editSelection(selection)}>Muokkaa</button>
                      <button type="button" className="remove" onClick={() => removeSelection(selection.id)}>Poista</button>
                    </div>
                  </article>
                })}
              </div>}
              <div className="mat-selection-editor" id="mat-selection-editor">
                <div className="mat-selection-editor-heading">
                  <h3>{editingSelectionId ? 'Muokkaa mattoa' : savedSelections.length > 0 ? 'Lisää toinen matto' : 'Valitse mattosi'}</h3>
                  {editingSelectionId && <button type="button" onClick={resetCurrentSelection}>Sulje muokkaus</button>}
                </div>
                <div className="mat-service-types">
                {serviceTypes.map((service) => {
                  const isSelected = state.serviceType === service.id
                  const imageIndex = galleryIndexes[service.id] % service.images.length
                  return (
                    <div className="mat-choice-card-shell" key={service.id}>
                      <button type="button" className={`mat-choice-card${isSelected ? ' selected' : ''}`} aria-pressed={isSelected} onClick={() => selectService(service.id)}>
                        <span className="mat-preview-image mat-choice-image">
                          <img src={service.images[imageIndex]} alt={`${service.label}, kuva ${imageIndex + 1}/${service.images.length}`} loading="lazy" />
                          {service.images.length > 1 && <span className="mat-gallery-dots" aria-hidden="true">
                            {service.images.map((image, index) => <i className={index === imageIndex ? 'active' : ''} key={image} />)}
                          </span>}
                        </span>
                        <span className="mat-choice-card-copy"><strong>{service.label}</strong><span>{service.description}</span><small>{isSelected ? 'Valittu' : service.quoteOnly ? 'Pyydä tarjous' : 'Valitse'}</small></span>
                      </button>
                      {service.images.length > 1 && <div className="mat-gallery-controls" aria-label={`${service.label} kuvat`}>
                        <button type="button" aria-label="Edellinen kuva" onClick={() => changeGalleryImage(service.id, -1)}>‹</button>
                        <button type="button" aria-label="Seuraava kuva" onClick={() => changeGalleryImage(service.id, 1)}>›</button>
                      </div>}
                    </div>
                  )
                })}
                </div>
                <div className="mat-size-color-layout">
                  <fieldset className="mat-option-group"><legend>Koko *</legend><div className="mat-option-grid">
                    {serviceSizes.map((size) => <button key={size.id} type="button" className={state.size === size.id ? 'selected' : ''} aria-pressed={state.size === size.id} onClick={() => selectSize(size.id)}>{size.label}</button>)}
                  </div></fieldset>
                  <fieldset className="mat-option-group"><legend>{state.serviceType === 'design' ? 'Kuosi' : 'Väri'} *</legend><div className={`mat-color-grid${state.serviceType === 'design' ? ' mat-design-color-grid' : ''}`}>
                    {availableColors.map((color) => {
                      return <button key={color.id} type="button" className={state.color === color.id ? 'selected' : ''} aria-pressed={state.color === color.id} onClick={() => updateState('color', color.id)}>
                        <span className="mat-color-dot" style={color.hex ? { backgroundColor: color.hex } : undefined} aria-hidden="true">{color.image && <img src={color.image} alt="" loading="lazy" />}</span><span>{color.label}</span>
                      </button>
                    })}
                  </div></fieldset>
                </div>
                {selectedSize && state.color && <fieldset className="mat-option-group"><legend>Vaihtoväli *</legend><div className="mat-interval-grid">
                  {(selectedService.intervalIds ?? (Object.keys(config.intervals) as IntervalId[])).map((interval) => {
                    const price = state.serviceType === 'mat'
                      ? selectedSize.prices?.[state.color]?.[interval]
                      : selectedSize.intervalPrices?.[interval] ?? selectedService.unitWeeklyPrice
                    return <button key={interval} type="button" className={state.interval === interval ? 'selected' : ''} aria-pressed={state.interval === interval} onClick={() => updateState('interval', interval)}>
                      {interval === 'twiceMonthly' && <small className="mat-popular">Suosituin</small>}<strong>{config.intervals[interval]}</strong><span>{selectedQuoteOnly ? 'Pyydä tarjous' : `${price === undefined ? '--' : formatPrice(price)} € / kpl / vko + alv`}</span>
                    </button>
                  })}
                </div></fieldset>}
                <div className="mat-option-group"><strong>Määrä *</strong><div className="mat-quantity">
                  <button type="button" aria-label="Vähennä määrää" onClick={() => updateState('quantity', Math.max(1, state.quantity - 1))}>−</button>
                  <input aria-label="Mattojen määrä" type="number" min="1" max="1000" value={state.quantity} onChange={(event) => updateState('quantity', Math.max(1, Math.min(1000, Number(event.target.value) || 1)))} />
                  <button type="button" aria-label="Lisää määrää" onClick={() => updateState('quantity', Math.min(1000, state.quantity + 1))}>+</button>
                </div></div>
                <label className="mat-field"><span>Lisätiedot</span><textarea value={state.notes} onChange={(event) => updateState('notes', event.target.value)} placeholder="Lisätiedot toimituksesta, mattojen sijoittelusta tai muista toiveista" maxLength={2000} /></label>
                {isSelectionComplete(state) && <button className="mat-add-another" type="button" onClick={saveAndAddSelection}>
                  <span>{editingSelectionId ? 'Tallenna muutokset ja lisää toinen matto' : 'Haluatko lisätä toisen maton?'}</span><strong aria-hidden="true">+</strong>
                </button>}
              </div>
            </div>}

            {step === 2 && <div className="mat-wizard-panel">
              <h3>Milloin haluat aloittaa mattopalvelun?</h3>
              <div className="mat-start-options">
                <label className={state.startMode === 'asap' ? 'selected' : ''}><input type="radio" name="startMode" checked={state.startMode === 'asap'} onChange={() => updateState('startMode', 'asap')} /><span><strong>Niin pian kuin mahdollista</strong><small>Aikaisintaan 5–6 arkipäivän kuluttua.</small></span></label>
                <label className={state.startMode === 'selectedWeek' ? 'selected' : ''}><input type="radio" name="startMode" checked={state.startMode === 'selectedWeek'} onChange={() => updateState('startMode', 'selectedWeek')} /><span><strong>Valitse aloitusviikko</strong><small>Aikaisin valittava aloitus on ensi viikolla. Vahvistamme tarkan aloituksen erikseen.</small></span></label>
              </div>
              {state.startMode === 'selectedWeek' && <label className="mat-field mat-week-field"><span>Aloitusviikko *</span><input type="week" min={minWeek} value={state.startWeek} onChange={(event) => updateState('startWeek', event.target.value)} /></label>}
            </div>}

            {step === 3 && <div className="mat-wizard-panel">
              <h3>Minne toimitamme palvelun?</h3>
              <ContactFields value={state.deliveryDetails} includeLocationName onChange={(deliveryDetails) => updateState('deliveryDetails', deliveryDetails)} />
              <label className="mat-field"><span>Toimituksen lisätiedot</span><textarea value={state.deliveryNotes} onChange={(event) => updateState('deliveryNotes', event.target.value)} placeholder="Yrityksen aukioloajat, ovikoodi, avainten nouto tai muut toimitukseen liittyvät tiedot." maxLength={2000} /></label>
              <div className="mat-billing-head"><h3>Laskutustiedot</h3><label className="mat-check"><input type="checkbox" checked={state.billingSameAsDelivery} onChange={(event) => updateState('billingSameAsDelivery', event.target.checked)} /><span>Sama kuin toimitustiedot</span></label></div>
              {!state.billingSameAsDelivery && <ContactFields value={state.billingDetails} onChange={(billingDetails) => updateState('billingDetails', billingDetails)} />}
              <fieldset className="mat-billing-method">
                <legend>Laskutustapa *</legend>
                <div className="mat-billing-method-options">
                  <label className={state.billingMethod === 'invoice' ? 'selected' : ''}><input type="radio" name="billingMethod" checked={state.billingMethod === 'invoice'} onChange={() => updateState('billingMethod', 'invoice')} /><span><strong>Lasku</strong><small>Lasku toimitetaan antamiisi laskutustietoihin.</small></span></label>
                  <label className={state.billingMethod === 'einvoice' ? 'selected' : ''}><input type="radio" name="billingMethod" checked={state.billingMethod === 'einvoice'} onChange={() => updateState('billingMethod', 'einvoice')} /><span><strong>E-lasku</strong><small>Lasku toimitetaan sähköisesti verkkolaskuosoitteeseen.</small></span></label>
                </div>
              </fieldset>
              {state.billingMethod === 'einvoice' && <div className="mat-form-grid mat-einvoice-fields">
                <label className="mat-field"><span>E-laskuosoite *</span><input required value={state.eInvoiceAddress} onChange={(event) => updateState('eInvoiceAddress', event.target.value)} autoComplete="off" /></label>
                <label className="mat-field"><span>Verkkolaskuoperaattori *</span><input required value={state.eInvoiceOperator} onChange={(event) => updateState('eInvoiceOperator', event.target.value)} autoComplete="off" /></label>
              </div>}
            </div>}

            {step === 4 && <div className="mat-wizard-panel">
              <h3>Tarkista tilauspyyntö</h3>
              <div className="mat-review-mats">
                {orderSelectionDetails.map(({ selection, details }, index) => <article key={selection.id}>
                  <h4>Matto {index + 1}: {details.service.label}</h4>
                  <dl className="mat-review-list">
                    <div><dt>Maton koko</dt><dd>{details.size?.label}</dd></div>
                    <div><dt>{selection.serviceType === 'design' ? 'Kuosi' : 'Väri'}</dt><dd>{details.color?.label}</dd></div>
                    <div><dt>Vaihtoväli</dt><dd>{selection.interval ? config.intervals[selection.interval] : '--'}</dd></div>
                    <div><dt>Määrä</dt><dd>{selection.quantity} kpl</dd></div>
                    {details.service.quoteOnly
                      ? <div><dt>Hinta</dt><dd>Vahvistetaan tarjouksessa</dd></div>
                      : <><div><dt>Hinta / kpl / vko</dt><dd>{details.unitPrice === undefined ? '--' : `${formatPrice(details.unitPrice)} € + alv`}</dd></div><div><dt>Viikkohinta yhteensä</dt><dd>{details.weeklyTotal === null ? '--' : `${formatPrice(details.weeklyTotal)} € + alv`}</dd></div></>}
                    {selection.notes && <div><dt>Lisätiedot</dt><dd>{selection.notes}</dd></div>}
                  </dl>
                </article>)}
                <div className="mat-review-grand-total"><span>{pricedSelectionCount > 0 ? hasQuoteOnlySelections ? 'Hinnoitellut matot yhteensä' : 'Matot yhteensä' : 'Hinta'}</span><strong>{pricedSelectionCount > 0 ? `${formatPrice(orderWeeklyTotal)} € / vko + alv` : 'Vahvistetaan tarjouksessa'}</strong></div>
              </div>
              <dl className="mat-review-list">
                <div><dt>Aloitus</dt><dd>{state.startMode === 'asap' ? 'Niin pian kuin mahdollista' : state.startWeek}</dd></div>
                <div><dt>Toimitus</dt><dd>{state.deliveryDetails.company}, {state.deliveryDetails.address}, {state.deliveryDetails.postalCode} {state.deliveryDetails.city}</dd></div>
                <div><dt>Laskutustiedot</dt><dd>{state.billingSameAsDelivery ? 'Sama kuin toimitustiedot' : `${state.billingDetails.company}, ${state.billingDetails.address}, ${state.billingDetails.postalCode} ${state.billingDetails.city}`}</dd></div>
                <div><dt>Laskutustapa</dt><dd>{state.billingMethod === 'einvoice' ? `E-lasku · ${state.eInvoiceAddress} · ${state.eInvoiceOperator}` : 'Lasku'}</dd></div>
                {state.deliveryNotes && <div><dt>Toimituksen lisätiedot</dt><dd>{state.deliveryNotes}</dd></div>}
              </dl>
              <p className="mat-submit-note">Tilauksen lähettäminen ei veloita mitään. Vahvistamme palvelun saatavuuden ja aloituksen erikseen.</p>
              <button className="primary full" type="button" disabled={submitting} onClick={submitOrder}>{submitting ? 'Lähetetään…' : 'Lähetä tilauspyyntö'}</button>
            </div>}
            {wizardError && <div className="error" role="alert">{wizardError}</div>}
            <div className="mat-wizard-actions">
              {step > 1 && <button className="ghost" type="button" onClick={() => setStep((current) => Math.max(1, current - 1))}>Takaisin</button>}
              {step < 4 && <button className="primary" type="button" onClick={goNext}>Jatka</button>}
            </div>
          </div>
          <aside className="mat-summary" aria-live="polite">
            <span className="mat-eyebrow">Yhteenveto</span>
            {savedSelections.filter((selection) => selection.id !== editingSelectionId).map((selection, index) => {
              const details = getSelectionDetails(selection, galleryIndexes)
              return <div className="mat-summary-item" key={selection.id}>
                <h3>Matto {index + 1}: {details.service.label}</h3>
                <p>{details.size?.label} · {details.color?.label}<br />{selection.interval ? config.intervals[selection.interval] : ''} · {selection.quantity} kpl</p>
                <strong>{details.service.quoteOnly ? 'Pyydä tarjous' : `${formatPrice(details.weeklyTotal ?? 0)} € / vko + alv`}</strong>
              </div>
            })}
            {(step === 1 || savedSelections.length === 0 || isSelectionStarted(state) || editingSelectionId) && <div className="mat-summary-current">
              <div className="mat-summary-current-head">
                <span className="mat-preview-image mat-summary-image">
                  <img src={selectedServiceImage} alt={selectedService.label} loading="lazy" />
                </span>
                <div>
                  <h3>{editingSelectionId ? 'Muokattava matto' : savedSelections.length > 0 ? `Matto ${savedSelections.length + 1}` : selectedService.label}</h3>
                  {savedSelections.length > 0 && <strong className="mat-summary-service-name">{selectedService.label}</strong>}
                </div>
              </div>
              <dl><div><dt>Koko</dt><dd>{summary.size}</dd></div><div><dt>{state.serviceType === 'design' ? 'Kuosi' : 'Väri'}</dt><dd>{summary.color}</dd></div><div><dt>Vaihtoväli</dt><dd>{summary.interval}</dd></div><div><dt>Määrä</dt><dd>{state.quantity} kpl</dd></div></dl>
              <div className={`mat-summary-price${selectedQuoteOnly || pricePrompt ? ' waiting' : ''}`}><span>Hinta / matto</span>{selectedQuoteOnly ? <strong>Pyydä tarjous</strong> : pricePrompt ? <strong>{pricePrompt}</strong> : <><strong>{formatPrice(selectedUnitPrice ?? 0)} €</strong><small>/ kpl / vko + alv</small></>}</div>
              {!selectedQuoteOnly && !pricePrompt && <div className="mat-summary-total"><span>Yhteensä</span><strong>{formatPrice(weeklyTotal ?? 0)} €</strong><small>/ vko + alv</small></div>}
            </div>}
            {orderSelections.length > 1 && <div className="mat-summary-grand-total"><span>{pricedSelectionCount > 0 ? hasQuoteOnlySelections ? 'Hinnoitellut matot yhteensä' : 'Kaikki matot yhteensä' : 'Hinta'}</span><strong>{pricedSelectionCount > 0 ? `${formatPrice(orderWeeklyTotal)} €` : 'Vahvistetaan tarjouksessa'}</strong>{pricedSelectionCount > 0 && <small>/ vko + alv</small>}</div>}
          </aside>
        </div>
      </section>

      <section className="mat-section mat-how"><div className="mat-how-content"><h2>Miten mattovuokraus toimii?</h2><div className="mat-how-steps">
        <article><span>1</span><h3>Valitse vaihtomatto</h3><p>Valitse yrityksellesi sopiva koko ja väri.</p></article>
        <article><span>2</span><h3>Valitse vaihtoväli</h3><p>Valitse mattojen vaihto kerran kuukaudessa, kahdesti kuukaudessa tai joka viikko.</p></article>
        <article><span>3</span><h3>Lähetä pyyntö</h3><p>Vahvistamme palvelun saatavuuden ja aloituksen erikseen.</p></article>
      </div></div><img src={config.images.hero} alt="Lindström-designmatot yrityksen sisäänkäynnissä" loading="lazy" /></section>

      <section className="mat-section mat-copy-section"><h2>Kuramatot yrityksille vuokrapalveluna</h2><p>Kuramatto auttaa pysäyttämään kosteutta ja likaa jo sisäänkäynnissä. Vuokrattava Lindström-vaihtomatto sopii erityisesti yrityksen sisäänkäyntiin ja muihin vilkkaasti liikennöityihin tiloihin. Maton vaihtoväli voidaan valita käyttökohteen ja likaantumisen mukaan.</p><button className="ghost" type="button" onClick={() => scrollToSection('mat-prices')}>Katso mattojen hinnat</button></section>

      <section className="mat-section" id="mat-quote">
        <div className="mat-section-heading"><span className="mat-eyebrow">Räätälöity kokonaisuus</span><h2>Pyydä tarjous vaihtomatoista</h2><p>{`Tarvitsetko useita mattoja, designmaton${isServiceEnabled('industrial') ? ', teollisuusmaton' : ''} tai yrityksellesi räätälöidyn mattopalvelun? Lähetä tarjouspyyntö.`}</p></div>
        <form className="mat-form-card mat-quote-form" onSubmit={handleQuoteSubmit} onFocus={trackQuoteStart}>
          <div className="mat-form-grid"><label className="mat-field"><span>Yritys *</span><input required value={quote.company} onChange={(event) => setQuote({ ...quote, company: event.target.value })} /></label><label className="mat-field"><span>Y-tunnus</span><input value={quote.businessId} onChange={(event) => setQuote({ ...quote, businessId: event.target.value })} /></label>
          <label className="mat-field"><span>Yhteyshenkilö *</span><input required value={quote.contactName} onChange={(event) => setQuote({ ...quote, contactName: event.target.value })} /></label><label className="mat-field"><span>Puhelinnumero *</span><input required type="tel" value={quote.phone} onChange={(event) => setQuote({ ...quote, phone: event.target.value })} /></label>
          <label className="mat-field"><span>Sähköposti *</span><input required type="email" value={quote.email} onChange={(event) => setQuote({ ...quote, email: event.target.value })} /></label><label className="mat-field"><span>Toimitusosoite / paikkakunta *</span><input required value={quote.location} onChange={(event) => setQuote({ ...quote, location: event.target.value })} /></label>
          <label className="mat-field"><span>Arvioitu mattojen määrä</span><input type="number" min="1" value={quote.matCount} onChange={(event) => setQuote({ ...quote, matCount: event.target.value })} /></label><label className="mat-field"><span>Toivottu vaihtoväli</span><select value={quote.interval} onChange={(event) => setQuote({ ...quote, interval: event.target.value })}><option value="">Valitse</option>{Object.entries(config.intervals).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div>
          <label className="mat-field"><span>Lisätiedot</span><textarea value={quote.notes} onChange={(event) => setQuote({ ...quote, notes: event.target.value })} maxLength={2000} /></label>
          <label className="mat-honeypot" aria-hidden="true">Jätä tyhjäksi<input tabIndex={-1} autoComplete="off" value={quote.website} onChange={(event) => setQuote({ ...quote, website: event.target.value })} /></label>
          {quoteStatus.error && <div className="error" role="alert">{quoteStatus.error}</div>}{quoteStatus.notice && <div className="success" role="status">{quoteStatus.notice}</div>}
          <button className="primary" disabled={quoteStatus.loading} type="submit">{quoteStatus.loading ? 'Lähetetään…' : 'Pyydä tarjous'}</button>
        </form>
      </section>

      <section className="mat-section mat-faq"><div className="mat-section-heading"><span className="mat-eyebrow">Kysymyksiä ja vastauksia</span><h2>Usein kysyttyä vaihtomatoista</h2></div><div className="mat-faq-list">
        {config.faq.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}
      </div></section>

      {helpPromptOpen && <div className="mat-help-prompt-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeHelpPrompt()
      }}>
        <section className="mat-help-prompt" role="dialog" aria-modal="true" aria-labelledby="mat-help-prompt-title" onKeyDown={(event) => {
          if (event.key === 'Escape') closeHelpPrompt()
        }}>
          <img src={config.services.design.images[1] ?? config.images.service} alt="Lindström-designmatto yrityksen tiloissa" />
          <div className="mat-help-prompt-copy">
            <button className="mat-help-prompt-close" type="button" aria-label="Sulje" onClick={closeHelpPrompt} autoFocus>×</button>
            <span className="mat-eyebrow">Autamme maton valinnassa</span>
            <h2 id="mat-help-prompt-title">Etkö löytänyt sopivaa mattoa?</h2>
            <p>Autamme valitsemaan yrityksellesi sopivan koon, mallin ja vaihtovälin.</p>
            <button className="primary" type="button" onClick={openQuoteFromHelpPrompt}>Ota yhteyttä</button>
          </div>
        </section>
      </div>}
    </div>
  )
}
