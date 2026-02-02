import { ETNIAS_LISTA, PERSONALIDADE_POR_REPLY } from '../opcoes.mjs'

export async function handle(ctx) {
  const { prisma, reply, typed, text, sendId, phone, user, persona, conv, sendWhatsAppButtons, sendWhatsAppList, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askPersonality' || (!reply && !typed)) return false

  let pers = ''
  if (reply) pers = PERSONALIDADE_POR_REPLY[reply] || ''
  if (!pers) pers = text
  if (!pers) return false

  try { await prisma.persona.update({ where: { id: persona.id }, data: { personality: pers } }) } catch {}
  const d = onboarding.get(user.id)?.data || {}
  const uName = (d.name || user.name || '').toString()
  onboarding.set(user.id, { step: 'askEthnicity', data: { ...(d || {}), personality: pers } })
  const body = `Ótimo, ${uName}. Agora vamos modelar sua Crush perfeita...\n\nEscolha a etnia que você prefere:`
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askEthnicity', direction: 'out', type: 'text', content: body, status: 'queued' } })
  const result = await sendWhatsAppList(sendId, phone, body, ETNIAS_LISTA, 'Etnia', 'Ver opções')
  if (!result.ok) {
    const fallback = [
      { id: 'etnia_caucasian', title: 'BRANCA' },
      { id: 'etnia_afro', title: 'NEGRA' },
      { id: 'etnia_latina', title: 'LATINA' },
    ]
    await sendWhatsAppButtons(sendId, phone, 'Selecione a etnia:', fallback)
  }
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
  return true
}

