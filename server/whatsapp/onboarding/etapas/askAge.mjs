import { CABELOS_LISTA } from '../opcoes.mjs'

export async function handle(ctx) {
  const { prisma, typed, text, sendId, phone, user, persona, conv, sendWhatsAppText, sendWhatsAppButtons, sendWhatsAppList, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askAge' || !typed) return false

  const d = onboarding.get(user.id)?.data || {}
  const n = parseInt(text.replace(/\D+/g, ''), 10)
  if (!Number.isFinite(n) || n < 18) {
    const body = 'Digite uma idade válida maior ou igual a 18.'
    const outMsg = await prisma.message.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await sendWhatsAppText(sendId, phone, body)
    await prisma.message.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    return true
  }

  onboarding.set(user.id, { step: 'askHairStyle', data: { ...d, age: n } })
  const body = 'Agora, qual estilo de cabelo você prefere?'
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askHairStyle', direction: 'out', type: 'text', content: body, status: 'queued' } })
  const result = await sendWhatsAppList(sendId, phone, body, CABELOS_LISTA, 'Estilo de cabelo', 'Ver opções')
  if (!result.ok) {
    const fallback = [
      { id: 'cabelo_liso', title: 'LISO' },
      { id: 'cabelo_cacheado_longo', title: 'CACHEADO LONGO' },
      { id: 'cabelo_coque', title: 'COQUE' },
    ]
    await sendWhatsAppButtons(sendId, phone, 'Selecione o estilo de cabelo:', fallback)
  }
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
  return true
}

