import { extrairNomeDoTexto, formatarNomePtBr } from '../nome.mjs'
import { comentarioNomeUsuario } from '../aura-comentarios.mjs'

export async function handle(ctx) {
  const { prisma, typed, text, sendId, phone, user, persona, conv, sendWhatsAppText, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askName' || !typed) return false

  const extracted = extrairNomeDoTexto(text)
  const nome = formatarNomePtBr(extracted)
  if (!nome) {
    const body = 'Quero te chamar do jeitinho certo.\n\nDigite apenas seu nome, sem frases (ex: Tayna).'
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askNameInvalid', direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await sendWhatsAppText(sendId, phone, body)
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    onboarding.set(user.id, { step: 'askName', data: {} })
    return true
  }

  const comment = comentarioNomeUsuario(nome)
  const outComment = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'commentUserName', direction: 'out', type: 'text', content: comment, status: 'queued' } })
  const commentRes = await sendWhatsAppText(sendId, phone, comment)
  await prisma.onboardingMessage.update({ where: { id: outComment.id }, data: { status: commentRes.ok ? 'sent' : 'failed' } })

  onboarding.set(user.id, { step: 'confirmName', data: { name: nome } })
  const body = `Só confirmando pra eu não errar: *${nome}* está correto?`
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'confirmName', direction: 'out', type: 'text', content: body, status: 'queued' } })
  const result = await ctx.sendWhatsAppButtons(sendId, phone, body, [
    { id: 'nome_confirmar', title: 'CONFIRMAR' },
    { id: 'nome_editar', title: 'EDITAR' },
  ])
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
  return true
}
