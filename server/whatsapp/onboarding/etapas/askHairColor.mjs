import { COR_CABELO_POR_REPLY, CORPOS_LISTA } from '../opcoes.mjs'

export async function handle(ctx) {
  const { prisma, reply, typed, text, sendId, phone, user, persona, conv, sendWhatsAppButtons, sendWhatsAppList, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askHairColor' || (!reply && !typed)) return false

  const d = onboarding.get(user.id)?.data || {}
  let hc = ''
  if (reply) hc = COR_CABELO_POR_REPLY[reply] || ''
  if (!hc) hc = text
  if (!hc) return false

  onboarding.set(user.id, { step: 'askBodyType', data: { ...d, hairColor: hc } })
  const body = 'Qual tipo de corpo você prefere?'
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askBodyType', direction: 'out', type: 'text', content: body, status: 'queued' } })
  const result = await sendWhatsAppList(sendId, phone, body, CORPOS_LISTA, 'Tipo de corpo', 'Ver opções')
  if (!result.ok) {
    const fallback = [
      { id: 'corpo_magra', title: 'MAGRA' },
      { id: 'corpo_atletica', title: 'ATLÉTICA' },
      { id: 'corpo_cheinha', title: 'CHEINHA' },
    ]
    await sendWhatsAppButtons(sendId, phone, 'Selecione o tipo de corpo:', fallback)
  }
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
  return true
}

