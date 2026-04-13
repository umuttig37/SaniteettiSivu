export const normalizeStringValue = (value) => {
  if (Array.isArray(value)) {
    return normalizeStringValue(value[0] ?? '')
  }

  return String(value ?? '').trim()
}

export const readFirstEnvValue = (env = process.env, names = []) => {
  for (const name of names) {
    const value = normalizeStringValue(env?.[name])
    if (value) {
      return value
    }
  }

  return ''
}

const prependHttpsProtocol = (value) => {
  const normalizedValue = normalizeStringValue(value)
  if (!normalizedValue) {
    return ''
  }

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(normalizedValue)) {
    return normalizedValue
  }

  if (normalizedValue.startsWith('//')) {
    return `https:${normalizedValue}`
  }

  return `https://${normalizedValue}`
}

const firstHeaderValue = (value) =>
  normalizeStringValue(value)
    .split(',')
    .map((item) => item.trim())
    .find(Boolean) ?? ''

const normalizeOriginUrl = (value) => {
  const candidate = prependHttpsProtocol(value)
  if (!candidate) {
    return ''
  }

  try {
    return new URL(candidate).origin
  } catch {
    return ''
  }
}

export const isPublicHttpsUrl = (value) => {
  try {
    const url = new URL(normalizeStringValue(value))
    const hostname = url.hostname.toLowerCase()
    return (
      url.protocol === 'https:' &&
      hostname !== 'localhost' &&
      hostname !== '127.0.0.1' &&
      hostname !== '0.0.0.0' &&
      hostname !== '::1'
    )
  } catch {
    return false
  }
}

export const getConfiguredSiteUrl = (env = process.env) =>
  normalizeOriginUrl(readFirstEnvValue(env, ['PUBLIC_SITE_URL', 'SITE_URL', 'APP_URL']))

export const getPublicSiteUrlFromEnv = (env = process.env) =>
  getConfiguredSiteUrl(env) ||
  normalizeOriginUrl(
    readFirstEnvValue(env, [
      'RENDER_EXTERNAL_URL',
      'URL',
      'DEPLOY_URL',
      'DEPLOY_PRIME_URL',
      'CF_PAGES_URL',
      'VERCEL_URL',
      'RAILWAY_STATIC_URL',
    ]),
  )

export const getConfiguredPaytrailSiteUrl = (env = process.env) =>
  normalizeOriginUrl(readFirstEnvValue(env, ['PAYTRAIL_SITE_URL', 'PAYTRAIL_PUBLIC_URL']))

export const getRequestSiteUrl = (req) => {
  const forwardedProtocol = firstHeaderValue(req?.headers?.['x-forwarded-proto'])
  const forwardedHost = firstHeaderValue(req?.headers?.['x-forwarded-host'])
  const protocol = forwardedProtocol || normalizeStringValue(req?.protocol) || 'http'
  const host =
    forwardedHost ||
    normalizeStringValue(typeof req?.get === 'function' ? req.get('host') : '') ||
    normalizeStringValue(req?.headers?.host)

  if (!host) {
    return ''
  }

  return normalizeOriginUrl(`${protocol}://${host}`)
}

export const getRequestPublicSiteUrl = (req) => {
  const requestSiteUrl = getRequestSiteUrl(req)
  if (isPublicHttpsUrl(requestSiteUrl)) {
    return requestSiteUrl
  }

  const originHeader = normalizeOriginUrl(firstHeaderValue(req?.headers?.origin))
  if (isPublicHttpsUrl(originHeader)) {
    return originHeader
  }

  const refererHeader = normalizeOriginUrl(firstHeaderValue(req?.headers?.referer))
  if (isPublicHttpsUrl(refererHeader)) {
    return refererHeader
  }

  return ''
}
