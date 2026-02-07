import { PERSONALIDADES_LISTA, PERSONALIDADES_FALLBACK_BOTOES } from '../opcoes.mjs'
import { comentarioNome } from '../aura-comentarios.mjs'

export async function handle(ctx) {
  const { prisma, typed, text, sendId, phone, user, persona, conv, sendWhatsAppText, sendWhatsAppButtons, sendWhatsAppList, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askCrushNameInput' || !typed) return false

  const crush = text.replace(/\s+/g, ' ').trim()
  if (!crush.length) return false

  try { await prisma.persona.update({ where: { id: persona.id }, data: { name: crush } }) } catch {}
  onboarding.set(user.id, { step: 'askPersonality', data: { ...(ctx?.state?.data || {}), crushName: crush } })
  const comment = comentarioNome(crush, { sujeito: 'crush' })
  const outComment = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'commentCrushName', direction: 'out', type: 'text', content: comment, status: 'queued' } })
  const commentRes = await sendWhatsAppText(sendId, phone, comment)
  await prisma.onboardingMessage.update({ where: { id: outComment.id }, data: { status: commentRes.ok ? 'sent' : 'failed' } })

  const body = 'Agora vamos dar vida a ela.\n\nQue *personalidade* combina mais com a sua Crush?'
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askPersonality', direction: 'out', type: 'text', content: body, status: 'queued' } })
  const result = await sendWhatsAppList(sendId, phone, body, PERSONALIDADES_LISTA, 'Personalidades', 'Ver opções')
  if (!result.ok) {
    await sendWhatsAppButtons(sendId, phone, 'Selecione a personalidade:', PERSONALIDADES_FALLBACK_BOTOES)
  }
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
  void sendWhatsAppText
  return true
}
