import { extrairNomeDoTexto, formatarNomePtBr } from '../nome.mjs'

export async function handle(ctx) {
  const { prisma, typed, text, sendId, phone, user, persona, conv, sendWhatsAppText, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'askName' || !typed) return false

  const extracted = extrairNomeDoTexto(text)
  const nome = formatarNomePtBr(extracted)
  if (!nome) {
    const body = 'Não consegui entender seu nome. Por favor, digite apenas seu nome (ex: Tayna).'
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askNameInvalid', direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await sendWhatsAppText(sendId, phone, body)
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    onboarding.set(user.id, { step: 'askName', data: {} })
    return true
  }
  onboarding.set(user.id, { step: 'confirmName', data: { name: nome } })
  const body = `Você digitou: ${nome}. Está correto?`
  const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'confirmName', direction: 'out', type: 'text', content: body, status: 'queued' } })
  const result = await ctx.sendWhatsAppButtons(sendId, phone, body, [
    { id: 'nome_confirmar', title: 'CONFIRMAR' },
    { id: 'nome_editar', title: 'EDITAR' },
  ])
  await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
  return true
}

