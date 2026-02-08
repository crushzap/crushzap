import dotenv from 'dotenv'
import crypto from 'node:crypto'
import { sendMetaCapiEvent } from '../server/integracoes/meta/meta-capi.mjs'

dotenv.config({ override: process.env.NODE_ENV !== 'production' })

function randId(prefix) {
  return `${prefix}:${crypto.randomUUID()}`
}

async function main() {
  const pixelId = (process.env.PIXEL_ID || '').toString().trim()
  const hasToken = Boolean((process.env.API_CONVERSION || '').toString().trim())
  const testEventCode = (process.env.META_TEST_EVENT_CODE || '').toString().trim()
  const ctwaClid = (process.env.META_CTWA_CLID || '').toString().trim()

  if (!pixelId || !hasToken) {
    console.log('[Meta Test] PIXEL_ID/API_CONVERSION não configurados no .env')
    process.exit(1)
  }

  if (!testEventCode) {
    console.log('[Meta Test] META_TEST_EVENT_CODE não definido. Os eventos podem demorar a aparecer no painel.')
  }

  const phone = '5511999999999'
  const email = 'teste@crushzap.com.br'
  const value = 9.9

  const websiteEvents = [
    { name: 'AddToCart', id: randId('site_cart'), actionSource: 'website' },
    { name: 'InitiateCheckout', id: randId('site_checkout'), actionSource: 'website' },
    { name: 'Purchase', id: randId('site_purchase'), actionSource: 'website' },
  ]

  for (const ev of websiteEvents) {
    const r = await sendMetaCapiEvent({
      eventName: ev.name,
      eventId: ev.id,
      actionSource: ev.actionSource,
      currency: 'BRL',
      value,
      email,
      phone,
      testEventCode,
      customData: {
        content_category: 'website',
        content_name: 'teste_pix',
        order_id: ev.id,
        source: 'website',
      },
    })
    console.log(`[Meta Test] ${ev.name}`, r.ok ? 'OK' : 'FAIL', r.ok ? (r.body?.events_received ?? '') : (r.status ?? r.error ?? ''))
  }

  if (!ctwaClid) {
    console.log('[Meta Test] META_CTWA_CLID não definido. Pulando testes com action_source=business_messaging (WhatsApp).')
    return
  }

  const whatsappEvents = [
    { name: 'AddToCart', id: randId('wa_cart'), actionSource: 'business_messaging' },
    { name: 'InitiateCheckout', id: randId('wa_checkout'), actionSource: 'business_messaging' },
    { name: 'Purchase', id: randId('wa_purchase'), actionSource: 'business_messaging' },
  ]

  for (const ev of whatsappEvents) {
    const r = await sendMetaCapiEvent({
      eventName: ev.name,
      eventId: ev.id,
      actionSource: ev.actionSource,
      messagingChannel: 'whatsapp',
      ctwaClid,
      currency: 'BRL',
      value,
      email,
      phone,
      testEventCode,
      customData: {
        content_category: 'whatsapp',
        content_name: 'teste_pix',
        order_id: ev.id,
        source: 'whatsapp',
      },
    })
    console.log(`[Meta Test] (WhatsApp) ${ev.name}`, r.ok ? 'OK' : 'FAIL', r.ok ? (r.body?.events_received ?? '') : (r.status ?? r.error ?? ''))
  }
}

main().catch((e) => {
  console.error('[Meta Test] erro', (e && e.message) || e)
  process.exit(1)
})
