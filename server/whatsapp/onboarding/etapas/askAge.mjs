import { CABELOS_LISTA } from '../opcoes.mjs'
import { comentarioIdade } from '../aura-comentarios.mjs'

export async function handle(ctx) {
  const { prisma, typed, text, sendId, phone, user, persona, conv, sendWhatsAppText, sendWhatsAppButtons, sendWhatsAppList, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askAge' || !typed) return false

  const d = onboarding.get(user.id)?.data || {}
  const n = parseInt(text.replace(/\D+/g, ''), 10)
  if (!Number.isFinite(n) || n < 18 || n > 99) {
    const body = 'Preciso que seja entre 18 e 99.\n\nDigite só um número nessa faixa 👇'
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askAgeInvalid', direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await sendWhatsAppText(sendId, phone, body)
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    return true
  }

  onboarding.set(user.id, { step: 'askHairStyle', data: { ...d, age: n } })
  const comment = comentarioIdade(n)
  const outComment = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'commentAge', direction: 'out', type: 'text', content: comment, status: 'queued' } })
  const commentRes = await sendWhatsAppText(sendId, phone, comment)
  await prisma.onboardingMessage.update({ where: { id: outComment.id }, data: { status: commentRes.ok ? 'sent' : 'failed' } })

  const body = 'Agora vamos escolher o cabelo dela.\n\nQual *estilo* combina mais com a sua Crush?'
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askHairStyle', direction: 'out', type: 'text', content: body, status: 'queued' } })
  const result = await sendWhatsAppList(sendId, phone, body, CABELOS_LISTA, 'Estilo de cabelo', 'Ver opções')
  let metadata = undefined
  if (!result.ok) {
    const fallback = [
      { id: 'cabelo_liso', title: 'LISO' },
      { id: 'cabelo_cacheado_longo', title: 'CACHEADO LONGO' },
      { id: 'cabelo_coque', title: 'COQUE' },
    ]
    await sendWhatsAppButtons(sendId, phone, 'Selecione o estilo de cabelo:', fallback)
    metadata = { buttons: fallback }
  }
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed', metadata } })
  return true
}
