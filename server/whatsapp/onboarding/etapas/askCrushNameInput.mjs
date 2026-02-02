import { PERSONALIDADES_LISTA, PERSONALIDADES_FALLBACK_BOTOES } from '../opcoes.mjs'

export async function handle(ctx) {
  const { prisma, typed, text, sendId, phone, user, persona, conv, sendWhatsAppText, sendWhatsAppButtons, sendWhatsAppList, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askCrushNameInput' || !typed) return false

  const crush = text.replace(/\s+/g, ' ').trim()
  if (!crush.length) return false

  try { await prisma.persona.update({ where: { id: persona.id }, data: { name: crush } }) } catch {}
  onboarding.set(user.id, { step: 'askPersonality', data: { ...(ctx?.state?.data || {}), crushName: crush } })
  const body = 'Agora vamos criar sua crush perfeita. Para começar vamos dar uma personalidade própria para ela.\n\nEscolha uma das opções abaixo:'
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askPersonality', direction: 'out', type: 'text', content: body, status: 'queued' } })
  const result = await sendWhatsAppList(sendId, phone, body, PERSONALIDADES_LISTA, 'Personalidades', 'Ver opções')
  if (!result.ok) {
    await sendWhatsAppButtons(sendId, phone, 'Selecione a personalidade:', PERSONALIDADES_FALLBACK_BOTOES)
  }
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
  void sendWhatsAppText
  return true
}

