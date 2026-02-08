export async function criarContextoWhatsapp({ prisma, req, waMessage, ensureUserByPhone, ensureDefaultPersona, ensureConversation, maps }) {
  const phone = waMessage?.from?.toString()
  if (!phone) return null
  const user = await ensureUserByPhone(phone)
  const persona = await ensureDefaultPersona(user.id)
  const conv = await ensureConversation(user.id, persona.id)
  const msgType = (waMessage?.type || 'text').toString()
  const text = (waMessage.text || '').toString()
  const reply = (waMessage.replyId || '').toString()
  const typed = text.replace(/[!?.]/g, '').trim().toLowerCase()
  const metaId = (waMessage?.phoneNumberId || '').toString().trim()
  const routeId = (req?.params?.phoneNumberId || '').toString().trim()
  const envId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').toString().trim()
  if (metaId && routeId && metaId !== routeId) {
    console.warn('[WhatsApp] phoneNumberId divergente', { metaId, routeId })
  }
  const sendId = metaId || envId || routeId
  if (!sendId) {
    console.warn('[WhatsApp] phoneNumberId ausente no contexto', {
      meta: !!metaId,
      env: !!envId,
      route: !!routeId,
    })
  }
  const state = maps?.onboarding?.get(user.id)
  const flow = maps?.upgradeFlow?.get(user.id)
  const billing = maps?.billingFlow?.get(user.id)
  return { prisma, req, waMessage, phone, user, persona, conv, msgType, text, reply, typed, sendId, state, flow, billing, maps }
}
