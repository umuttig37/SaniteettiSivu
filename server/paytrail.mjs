import crypto from 'node:crypto'

const paytrailApiOrigin = 'https://services.paytrail.com'
const supportedAlgorithms = new Set(['sha256', 'sha512'])

const normalizeStringValue = (value) => {
  if (Array.isArray(value)) {
    return normalizeStringValue(value[0] ?? '')
  }
  return String(value ?? '')
}

export const getPaytrailConfig = (env = process.env) => {
  const explicitAccount = normalizeStringValue(env.PAYTRAIL_ACCOUNT_ID).trim()
  const explicitSecret = normalizeStringValue(env.PAYTRAIL_SECRET).trim()
  const fallbackToTest = !explicitAccount && !explicitSecret && normalizeStringValue(env.NODE_ENV).trim() !== 'production'
  const algorithm = normalizeStringValue(env.PAYTRAIL_ALGORITHM || 'sha256').trim().toLowerCase()
  const account = explicitAccount || (fallbackToTest ? '375917' : '')
  const secret = explicitSecret || (fallbackToTest ? 'SAIPPUAKAUPPIAS' : '')

  return {
    account,
    secret,
    algorithm: supportedAlgorithms.has(algorithm) ? algorithm : 'sha256',
    platformName: normalizeStringValue(env.PAYTRAIL_PLATFORM_NAME || 'suomenpaperitukku-custom').trim(),
    enabled: Boolean(account && secret),
    testMode: fallbackToTest,
  }
}

export const collectCheckoutParams = (source) =>
  Object.entries(source ?? {}).reduce((acc, [key, value]) => {
    const normalizedKey = String(key).trim().toLowerCase()
    if (!normalizedKey.startsWith('checkout-')) {
      return acc
    }

    acc[normalizedKey] = normalizeStringValue(value).trim()
    return acc
  }, {})

export const calculatePaytrailHmac = (secret, params, body = '', algorithm = 'sha256') => {
  const normalizedAlgorithm = supportedAlgorithms.has(String(algorithm).toLowerCase()) ? String(algorithm).toLowerCase() : 'sha256'
  const payload = Object.keys(params ?? {})
    .sort()
    .map((key) => `${key}:${params[key]}`)
    .concat(body ? String(body) : '')
    .join('\n')

  return crypto.createHmac(normalizedAlgorithm, String(secret ?? '')).update(payload).digest('hex')
}

export const validatePaytrailHmac = (secret, params, signature, body = '', algorithm = 'sha256') => {
  const provided = normalizeStringValue(signature).trim().toLowerCase()
  if (!provided) {
    return false
  }

  const calculated = calculatePaytrailHmac(secret, params, body, algorithm)
  try {
    const calculatedBuffer = Buffer.from(calculated, 'hex')
    const providedBuffer = Buffer.from(provided, 'hex')
    return calculatedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(calculatedBuffer, providedBuffer)
  } catch {
    return false
  }
}

const buildPaytrailHeaders = ({ config, method, transactionId = '' }, bodyString = '') => {
  const timestamp = new Date().toISOString()
  const headers = {
    'checkout-account': config.account,
    'checkout-algorithm': config.algorithm,
    'checkout-method': String(method).toUpperCase(),
    'checkout-nonce': crypto.randomUUID(),
    'checkout-timestamp': timestamp,
  }

  if (transactionId) {
    headers['checkout-transaction-id'] = transactionId
  }

  const signature = calculatePaytrailHmac(config.secret, headers, bodyString, config.algorithm)

  return {
    checkoutHeaders: headers,
    requestHeaders: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
      signature,
      ...(config.platformName ? { 'platform-name': config.platformName } : {}),
    },
  }
}

const parseResponsePayload = (bodyText) => {
  if (!bodyText) {
    return null
  }

  try {
    return JSON.parse(bodyText)
  } catch {
    return null
  }
}

export const requestPaytrail = async ({ config, method, pathname, body = '', transactionId = '' }) => {
  if (!config?.account || !config?.secret) {
    throw new Error('Paytrail is not configured.')
  }

  const bodyString = typeof body === 'string' ? body : body ? JSON.stringify(body) : ''
  const { requestHeaders } = buildPaytrailHeaders({ config, method, transactionId }, bodyString)

  const response = await fetch(`${paytrailApiOrigin}${pathname}`, {
    method,
    headers: requestHeaders,
    body: bodyString || undefined,
  })

  const bodyText = await response.text()
  const responseHeaders = Object.fromEntries(response.headers.entries())
  const responseCheckoutHeaders = collectCheckoutParams(responseHeaders)
  const responseAlgorithm = responseHeaders['checkout-algorithm'] || config.algorithm
  const responseSignature = responseHeaders.signature || ''
  const responseSignatureValid = validatePaytrailHmac(
    config.secret,
    responseCheckoutHeaders,
    responseSignature,
    bodyText,
    responseAlgorithm,
  )

  return {
    ok: response.ok,
    status: response.status,
    requestId: response.headers.get('request-id') ?? '',
    headers: responseHeaders,
    data: parseResponsePayload(bodyText),
    bodyText,
    signatureValid: responseSignatureValid,
  }
}
