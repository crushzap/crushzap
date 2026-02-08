function normalizePhoneNumberId(input) {
  const id = (input || '').toString().trim()
  return id || null
}

function parseBoolEnv(input) {
  const v = (input || '').toString().trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'sim' || v === 'yes' || v === 'y'
}

export async function sendWhatsAppText(phoneNumberId, to, text) {
  const id = normalizePhoneNumberId(phoneNumberId)
  const token = (process.env.WHATSAPP_ACCESS_TOKEN || '').toString().trim()
  if (!id) return { ok: false, error: 'phoneNumberId ausente' }
  if (!token) return { ok: false, error: 'Token WhatsApp não configurado' }
  const url = `https://graph.facebook.com/v19.0/${id}/messages`
  const payload = { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })
  const body = await res.text()
  if (!res.ok) {
    try {
      const err = JSON.parse(body)
      console.error('[WhatsApp Send Error]', { status: res.status, err })
      return { ok: false, error: err }
    } catch {
      console.error('[WhatsApp Send Error]', { status: res.status, body })
      return { ok: false, error: body || 'Falha ao enviar' }
    }
  }
  try { return { ok: true, data: JSON.parse(body) } } catch { return { ok: true, data: { raw: body } } }
}

export async function sendWhatsAppButtons(phoneNumberId, to, bodyText, buttons) {
  const id = normalizePhoneNumberId(phoneNumberId)
  const token = (process.env.WHATSAPP_ACCESS_TOKEN || '').toString().trim()
  if (!id) return { ok: false, error: 'phoneNumberId ausente' }
  if (!token) return { ok: false, error: 'Token WhatsApp não configurado' }
  const url = `https://graph.facebook.com/v19.0/${id}/messages`
  const safeBody = (bodyText || '').toString().trim().slice(0, 1024)
  const safeButtons = Array.isArray(buttons) ? buttons.slice(0, 3) : []
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: safeBody },
      action: {
        buttons: safeButtons.map((b) => ({
          type: 'reply',
          reply: {
            id: String(b?.id || '').slice(0, 200),
            title: String(b?.title || '').trim().slice(0, 20),
          }
        }))
      }
    }
  }
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })
  const body = await res.text()
  if (!res.ok) {
    try {
      const err = JSON.parse(body)
      console.error('[WhatsApp Send Error]', { status: res.status, err })
      return { ok: false, error: err }
    } catch {
      console.error('[WhatsApp Send Error]', { status: res.status, body })
      return { ok: false, error: body || 'Falha ao enviar' }
    }
  }
  try { return { ok: true, data: JSON.parse(body) } } catch { return { ok: true, data: { raw: body } } }
}

export async function sendWhatsAppList(phoneNumberId, to, bodyText, rows, sectionTitle = 'Opções', buttonLabel = 'Escolher') {
  const id = normalizePhoneNumberId(phoneNumberId)
  const token = (process.env.WHATSAPP_ACCESS_TOKEN || '').toString().trim()
  if (!id) return { ok: false, error: 'phoneNumberId ausente' }
  if (!token) return { ok: false, error: 'Token WhatsApp não configurado' }
  const url = `https://graph.facebook.com/v19.0/${id}/messages`
  const safeRows = Array.isArray(rows) ? rows.slice(0, 10) : []
  const safeButton = (buttonLabel || 'Escolher').toString().trim().slice(0, 20)
  const safeSectionTitle = (sectionTitle || 'Opções').toString().trim().slice(0, 24)
  const safeBody = (bodyText || '').toString().trim().slice(0, 1024)
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: safeBody },
      action: {
        button: safeButton,
        sections: [
          {
            title: safeSectionTitle,
            rows: safeRows.map((r) => ({ id: String(r.id || '').slice(0, 200), title: String(r.title || '').slice(0, 24), description: String(r.description || '').slice(0, 72) })),
          },
        ],
      },
    },
  }
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })
  const body = await res.text()
  if (!res.ok) {
    try {
      const err = JSON.parse(body)
      console.error('[WhatsApp Send Error]', { status: res.status, err })
      return { ok: false, error: err }
    } catch {
      console.error('[WhatsApp Send Error]', { status: res.status, body })
      return { ok: false, error: body || 'Falha ao enviar' }
    }
  }
  try { return { ok: true, data: JSON.parse(body) } } catch { return { ok: true, data: { raw: body } } }
}

export async function sendWhatsAppImageLink(phoneNumberId, to, imageUrl, caption) {
  const id = normalizePhoneNumberId(phoneNumberId)
  const token = (process.env.WHATSAPP_ACCESS_TOKEN || '').toString().trim()
  if (!id) return { ok: false, error: 'phoneNumberId ausente' }
  if (!token) return { ok: false, error: 'Token WhatsApp não configurado' }
  const url = `https://graph.facebook.com/v19.0/${id}/messages`
  const safeCaption = caption == null ? undefined : String(caption).trim().slice(0, 1024)
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: safeCaption ? { link: imageUrl, caption: safeCaption } : { link: imageUrl },
  }

  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })
  const body = await res.text()
  if (!res.ok) {
    try {
      const err = JSON.parse(body)
      console.error('[WhatsApp Send Error]', { status: res.status, err })
      return { ok: false, error: err }
    } catch {
      console.error('[WhatsApp Send Error]', { status: res.status, body })
      return { ok: false, error: body || 'Falha ao enviar imagem' }
    }
  }
  try { return { ok: true, data: JSON.parse(body) } } catch { return { ok: true, data: { raw: body } } }
}

export async function uploadWhatsAppMediaFromUrl(phoneNumberId, mediaUrl, mimeType = 'image/png') {
  const id = normalizePhoneNumberId(phoneNumberId)
  const token = (process.env.WHATSAPP_ACCESS_TOKEN || '').toString().trim()
  if (!id) return { ok: false, error: 'phoneNumberId ausente' }
  if (!token) return { ok: false, error: 'Token WhatsApp não configurado' }

  const dl = await fetch(String(mediaUrl))
  if (!dl.ok) return { ok: false, error: `Falha ao baixar mídia: ${dl.status}` }
  const contentType = (dl.headers.get('content-type') || '').toLowerCase().split(';')[0].trim()
  const ct = contentType || String(mimeType || 'image/png')
  const buf = Buffer.from(await dl.arrayBuffer())

  const upUrl = `https://graph.facebook.com/v19.0/${id}/media`
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  const ext =
    ct.includes('jpeg') || ct.includes('jpg')
      ? 'jpg'
      : ct.includes('webp')
        ? 'webp'
        : ct.includes('png')
          ? 'png'
          : ct.includes('ogg')
            ? 'ogg'
            : ct.includes('mpeg') || ct.includes('mp3')
              ? 'mp3'
              : ct.includes('wav')
                ? 'wav'
                : 'bin'
  const kind =
    ct.startsWith('image/')
      ? 'image'
      : ct.startsWith('audio/')
        ? 'audio'
        : 'media'
  form.append('file', new Blob([buf], { type: ct }), `${kind}.${ext}`)

  const res = await fetch(upUrl, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
  const body = await res.text()
  if (!res.ok) {
    try {
      const err = JSON.parse(body)
      console.error('[WhatsApp Media Upload Error]', { status: res.status, err })
      return { ok: false, error: err }
    } catch {
      console.error('[WhatsApp Media Upload Error]', { status: res.status, body })
      return { ok: false, error: body || 'Falha ao subir mídia' }
    }
  }
  try { return { ok: true, data: JSON.parse(body) } } catch { return { ok: true, data: { raw: body } } }
}

export async function sendWhatsAppImageMediaId(phoneNumberId, to, mediaId, caption) {
  const id = normalizePhoneNumberId(phoneNumberId)
  const token = (process.env.WHATSAPP_ACCESS_TOKEN || '').toString().trim()
  if (!id) return { ok: false, error: 'phoneNumberId ausente' }
  if (!token) return { ok: false, error: 'Token WhatsApp não configurado' }

  const url = `https://graph.facebook.com/v19.0/${id}/messages`
  const safeCaption = caption == null ? undefined : String(caption).trim().slice(0, 1024)
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: safeCaption ? { id: String(mediaId), caption: safeCaption } : { id: String(mediaId) },
  }

  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })
  const body = await res.text()
  if (!res.ok) {
    try {
      const err = JSON.parse(body)
      console.error('[WhatsApp Send Error]', { status: res.status, err })
      return { ok: false, error: err }
    } catch {
      console.error('[WhatsApp Send Error]', { status: res.status, body })
      return { ok: false, error: body || 'Falha ao enviar imagem' }
    }
  }
  try { return { ok: true, data: JSON.parse(body) } } catch { return { ok: true, data: { raw: body } } }
}

export async function sendWhatsAppImageSmart(phoneNumberId, to, imageUrl, caption) {
  const uploadFirst = parseBoolEnv(process.env.WHATSAPP_IMAGE_UPLOAD_FIRST)
  const uploadFallback = parseBoolEnv(process.env.WHATSAPP_IMAGE_UPLOAD_FALLBACK)
  const enableUpload = parseBoolEnv(process.env.WHATSAPP_ENABLE_MEDIA_UPLOAD) || uploadFirst || uploadFallback
  if (uploadFirst && enableUpload) {
    const up = await uploadWhatsAppMediaFromUrl(phoneNumberId, imageUrl)
    const mediaId = up?.data?.id
    if (up.ok && mediaId) return sendWhatsAppImageMediaId(phoneNumberId, to, mediaId, caption)
  }
  const linkRes = await sendWhatsAppImageLink(phoneNumberId, to, imageUrl, caption)
  if (linkRes?.ok) return linkRes

  if (!enableUpload || !uploadFallback) return linkRes

  const up = await uploadWhatsAppMediaFromUrl(phoneNumberId, imageUrl)
  const mediaId = up?.data?.id
  if (!up.ok || !mediaId) return { ok: false, error: { step: 'upload', detail: up?.error || up?.data } }
  return sendWhatsAppImageMediaId(phoneNumberId, to, mediaId, caption)
}

export async function sendWhatsAppAudioLink(phoneNumberId, to, audioUrl) {
  const id = normalizePhoneNumberId(phoneNumberId)
  const token = (process.env.WHATSAPP_ACCESS_TOKEN || '').toString().trim()
  if (!id) return { ok: false, error: 'phoneNumberId ausente' }
  if (!token) return { ok: false, error: 'Token WhatsApp não configurado' }
  const url = `https://graph.facebook.com/v19.0/${id}/messages`
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'audio',
    audio: { link: String(audioUrl) },
  }
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })
  const body = await res.text()
  if (!res.ok) {
    try {
      const err = JSON.parse(body)
      console.error('[WhatsApp Send Error]', { status: res.status, err })
      return { ok: false, error: err }
    } catch {
      console.error('[WhatsApp Send Error]', { status: res.status, body })
      return { ok: false, error: body || 'Falha ao enviar áudio' }
    }
  }
  try { return { ok: true, data: JSON.parse(body) } } catch { return { ok: true, data: { raw: body } } }
}

export async function sendWhatsAppAudioMediaId(phoneNumberId, to, mediaId) {
  const id = normalizePhoneNumberId(phoneNumberId)
  const token = (process.env.WHATSAPP_ACCESS_TOKEN || '').toString().trim()
  if (!id) return { ok: false, error: 'phoneNumberId ausente' }
  if (!token) return { ok: false, error: 'Token WhatsApp não configurado' }

  const url = `https://graph.facebook.com/v19.0/${id}/messages`
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'audio',
    audio: { id: String(mediaId) },
  }

  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })
  const body = await res.text()
  if (!res.ok) {
    try {
      const err = JSON.parse(body)
      console.error('[WhatsApp Send Error]', { status: res.status, err })
      return { ok: false, error: err }
    } catch {
      console.error('[WhatsApp Send Error]', { status: res.status, body })
      return { ok: false, error: body || 'Falha ao enviar áudio' }
    }
  }
  try { return { ok: true, data: JSON.parse(body) } } catch { return { ok: true, data: { raw: body } } }
}

export async function sendWhatsAppAudioSmart(phoneNumberId, to, audioUrl) {
  const t0 = Date.now()
  const uploadFirst = parseBoolEnv(process.env.WHATSAPP_AUDIO_UPLOAD_FIRST)
  const uploadFallback = parseBoolEnv(process.env.WHATSAPP_AUDIO_UPLOAD_FALLBACK)
  const enableUpload = parseBoolEnv(process.env.WHATSAPP_ENABLE_MEDIA_UPLOAD) || uploadFirst || uploadFallback
  console.log('[WhatsApp][Audio] send start', { to, uploadFirst, uploadFallback, enableUpload })
  if (uploadFirst && enableUpload) {
    const up = await uploadWhatsAppMediaFromUrl(phoneNumberId, audioUrl, 'audio/ogg')
    const mediaId = up?.data?.id
    if (up.ok && mediaId) {
      const out = await sendWhatsAppAudioMediaId(phoneNumberId, to, mediaId)
      console.log('[WhatsApp][Audio] sent', { to, ok: !!out?.ok, via: 'media_id', ms: Date.now() - t0 })
      return out
    }
  }

  const linkRes = await sendWhatsAppAudioLink(phoneNumberId, to, audioUrl)
  if (linkRes?.ok) {
    console.log('[WhatsApp][Audio] sent', { to, ok: true, via: 'link', ms: Date.now() - t0 })
    return linkRes
  }

  if (!enableUpload || !uploadFallback) {
    console.log('[WhatsApp][Audio] skipped_upload_fallback', { to, ms: Date.now() - t0 })
    return linkRes
  }

  const up = await uploadWhatsAppMediaFromUrl(phoneNumberId, audioUrl, 'audio/ogg')
  const mediaId = up?.data?.id
  if (!up.ok || !mediaId) {
    console.log('[WhatsApp][Audio] failed', { to, step: 'upload', ms: Date.now() - t0 })
    return { ok: false, error: { step: 'upload', detail: up?.error || up?.data } }
  }
  const out = await sendWhatsAppAudioMediaId(phoneNumberId, to, mediaId)
  console.log('[WhatsApp][Audio] sent', { to, ok: !!out?.ok, via: 'media_id_fallback', ms: Date.now() - t0 })
  return out
}

export async function sendWhatsAppReadTyping(phoneNumberId, to, messageId, type = 'text') {
  const id = normalizePhoneNumberId(phoneNumberId)
  const token = (process.env.WHATSAPP_ACCESS_TOKEN || '').toString().trim()
  if (!id) return { ok: false, error: 'phoneNumberId ausente' }
  if (!token) return { ok: false, error: 'Token WhatsApp não configurado' }
  const mid = (messageId || '').toString().trim()
  if (!mid) return { ok: false, error: 'messageId ausente' }

  const url = `https://graph.facebook.com/v19.0/${id}/messages`
  const payload = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: mid,
    typing_indicator: { type: String(type || 'text') },
  }
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })
  const body = await res.text()
  if (!res.ok) {
    try {
      const err = JSON.parse(body)
      console.error('[WhatsApp ChatState Error]', { status: res.status, err })
      return { ok: false, error: err }
    } catch {
      console.error('[WhatsApp ChatState Error]', { status: res.status, body })
      return { ok: false, error: body || 'Falha ao enviar chat state' }
    }
  }
  try { return { ok: true, data: JSON.parse(body) } } catch { return { ok: true, data: { raw: body } } }
}

export async function getWhatsAppMediaUrl(mediaId) {
  const token = (process.env.WHATSAPP_ACCESS_TOKEN || '').toString().trim()
  if (!token) return { ok: false, error: 'Token WhatsApp não configurado' }
  
  const url = `https://graph.facebook.com/v19.0/${mediaId}`
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const body = await res.json()
    if (!res.ok) return { ok: false, error: body }
    return { ok: true, url: body.url }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export async function downloadWhatsAppMedia(url) {
  const token = (process.env.WHATSAPP_ACCESS_TOKEN || '').toString().trim()
  if (!token) return { ok: false, error: 'Token WhatsApp não configurado' }
  
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return { ok: false, error: 'Falha ao baixar media' }
    const buffer = Buffer.from(await res.arrayBuffer())
    return { ok: true, buffer, contentType: res.headers.get('content-type') }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
