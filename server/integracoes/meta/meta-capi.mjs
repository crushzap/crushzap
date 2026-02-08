import crypto from 'node:crypto'

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function normalizeEmail(value) {
  return (value || '').toString().trim().toLowerCase()
}

function normalizePhone(value) {
  return (value || '').toString().replace(/[^\d]/g, '')
}

function parseCookies(cookieHeader) {
  const raw = (cookieHeader || '').toString()
  if (!raw) return {}
  const out = {}
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=')
    if (idx <= 0) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (!k) continue
    out[k] = decodeURIComponent(v)
  }
  return out
}

function buildFbcFromFbclid(fbclid) {
  const v = (fbclid || '').toString().trim()
  if (!v) return null
  const ts = Math.floor(Date.now() / 1000)
  return `fb.1.${ts}.${v}`
}

function getClientIp(req) {
  const forwardedFor = (req?.headers?.['x-forwarded-for'] || '').toString()
  const ip = forwardedFor.split(',')[0]?.trim() || req?.socket?.remoteAddress || ''
  return ip || ''
}

function getUserAgent(req) {
  return (req?.headers?.['user-agent'] || '').toString()
}

export async function sendMetaCapiEvent({
  eventName,
  eventId,
  eventTime,
  actionSource = 'website',
  eventSourceUrl,
  testEventCode,
  messagingChannel,
  pageId,
  ctwaClid,
  currency = 'BRL',
  value,
  email,
  phone,
  fbp,
  fbc,
  clientIpAddress,
  clientUserAgent,
  customData = {},
  env = process.env,
  fetchImpl = fetch,
}) {
  const pixelId = (env.PIXEL_ID || '').toString().trim()
  const accessToken = (env.API_CONVERSION || '').toString().trim()
  if (!pixelId || !accessToken) return { ok: false, skipped: true }

  const now = Math.floor(Date.now() / 1000)
  const userData = {
    client_ip_address: (clientIpAddress || '').toString().trim() || undefined,
    client_user_agent: (clientUserAgent || '').toString().trim() || undefined,
    fbp: (fbp || '').toString().trim() || undefined,
    fbc: (fbc || '').toString().trim() || undefined,
    em: undefined,
    ph: undefined,
    page_id: (pageId || env.META_PAGE_ID || '').toString().trim() || undefined,
    ctwa_clid: (ctwaClid || env.META_CTWA_CLID || '').toString().trim() || undefined,
  }

  const emNorm = normalizeEmail(email)
  if (emNorm) userData.em = [sha256Hex(emNorm)]

  const phNorm = normalizePhone(phone)
  if (phNorm) userData.ph = [sha256Hex(phNorm)]

  const cd = { ...(customData || {}) }
  if (typeof value === 'number' && Number.isFinite(value)) cd.value = value
  if (currency) cd.currency = currency

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: eventTime || now,
        event_id: (eventId || '').toString().trim() || undefined,
        action_source: actionSource,
        messaging_channel:
          (actionSource || '').toString().trim() === 'business_messaging'
            ? ((messagingChannel || env.META_MESSAGING_CHANNEL || 'whatsapp').toString().trim() || 'whatsapp')
            : undefined,
        event_source_url: (eventSourceUrl || '').toString().trim() || undefined,
        user_data: userData,
        custom_data: cd,
      },
    ],
    test_event_code: (testEventCode || env.META_TEST_EVENT_CODE || '').toString().trim() || undefined,
    access_token: accessToken,
  }

  const version = (env.META_GRAPH_VERSION || 'v19.0').toString().trim() || 'v19.0'
  const url = `https://graph.facebook.com/${version}/${pixelId}/events`

  try {
    const resp = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      console.error('[Meta CAPI] erro', { status: resp.status, body_head: (text || '').slice(0, 400) })
      return { ok: false, status: resp.status }
    }

    const body = await resp.json().catch(() => ({}))
    return { ok: true, body }
  } catch (e) {
    console.error('[Meta CAPI] falha', { error: (e && e.message) || 'unknown' })
    return { ok: false, error: (e && e.message) || 'unknown' }
  }
}

export function extractMetaClientDataFromRequest(req) {
  const cookies = parseCookies(req?.headers?.cookie)
  const fbp = cookies._fbp || cookies.fbp || null
  const fbc = cookies._fbc || cookies.fbc || buildFbcFromFbclid(req?.query?.fbclid) || null
  const clientIpAddress = getClientIp(req)
  const clientUserAgent = getUserAgent(req)
  const eventSourceUrl =
    (req?.headers?.referer || req?.headers?.referrer || '').toString()
    || (req?.headers?.origin || '').toString()
    || ''

  return { fbp, fbc, clientIpAddress, clientUserAgent, eventSourceUrl }
}
