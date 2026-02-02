export async function criarContextoWhatsapp({ prisma, req, waMessage, ensureUserByPhone, ensureDefaultPersona, ensureConversation, maps }) {
  const phone = waMessage?.from?.toString()
  if (!phone) return null
  const user = await ensureUserByPhone(phone)
  const persona = await ensureDefaultPersona(user.id)
  const conv = await ensureConversation(user.id, persona.id)
  const msgType = waMessage.type === 'audio' ? 'audio' : 'text'
  const text = (waMessage.text || '').toString()
  const reply = (waMessage.replyId || '').toString()
  const typed = text.replace(/[!?.]/g, '').trim().toLowerCase()
  const sendId = waMessage.phoneNumberId || req.params.phoneNumberId
  const state = maps?.onboarding?.get(user.id)
  const flow = maps?.upgradeFlow?.get(user.id)
  const billing = maps?.billingFlow?.get(user.id)
  return { prisma, req, waMessage, phone, user, persona, conv, msgType, text, reply, typed, sendId, state, flow, billing, maps }
}

