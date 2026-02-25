import crypto from 'node:crypto'
import * as QRCode from 'qrcode'
import { uploadImagemPublicaSupabase } from '../integracoes/supabase/cliente.mjs'

function normalizarBase64(b64) {
  const raw = (b64 || '').toString().trim()
  if (!raw) return ''
  if (raw.startsWith('data:')) {
    const idx = raw.indexOf('base64,')
    if (idx >= 0) return raw.slice(idx + 'base64,'.length).trim()
  }
  return raw
}

function normalizarCheckoutId(checkoutId) {
  const raw = (checkoutId || '').toString().trim()
  if (!raw) return 'pix'
  const safe = raw.replace(/[^\w-]/g, '').slice(0, 80)
  return safe || 'pix'
}

export async function gerarUrlPublicaQrCodePix({ checkoutId, qrCodeBase64, env = process.env }) {
  const base64 = normalizarBase64(qrCodeBase64)
  if (!base64) return { ok: false, error: 'QR Code ausente' }

  let bytes = null
  try {
    bytes = Buffer.from(base64, 'base64')
  } catch {
    return { ok: false, error: 'QR Code inválido' }
  }
  if (!bytes || !bytes.length) return { ok: false, error: 'QR Code inválido' }

  const bucketName = (env.SUPABASE_BUCKET_PIX_QR || '').toString().trim() || undefined
  const safeCheckoutId = normalizarCheckoutId(checkoutId)
  const path = `pix-qrcode/${safeCheckoutId}/${crypto.randomUUID()}.png`

  const up = await uploadImagemPublicaSupabase({
    path,
    bytes,
    contentType: 'image/png',
    upsert: false,
    bucketName,
  })
  if (!up.ok) return up

  return { ok: true, bucket: up.bucket, path: up.path, publicUrl: up.publicUrl }
}

export async function gerarBase64QrCodePix({ copiaECola }) {
  const payload = (copiaECola || '').toString().trim()
  if (!payload) return null
  try {
    const dataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 1, width: 512 })
    const idx = dataUrl.indexOf('base64,')
    if (idx >= 0) return dataUrl.slice(idx + 'base64,'.length).trim()
    return dataUrl
  } catch {
    return null
  }
}
