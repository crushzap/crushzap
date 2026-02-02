export async function handle(ctx) {
  const { prisma, reply, typed, sendId, phone, user, persona, conv, sendWhatsAppText, maps } = ctx
  const onboarding = maps.onboarding

  if (ctx?.state?.step !== 'confirmName' || (!reply && !typed)) return false

  const d = onboarding.get(user.id)?.data || {}
  const nome = (d.name || '').toString().trim()
  const confirm = reply === 'nome_confirmar' || typed === 'confirmar' || typed === 'sim'
  const edit = reply === 'nome_editar' || typed === 'editar' || typed === 'não' || typed === 'nao'
  if (confirm && nome) {
    try { await prisma.user.update({ where: { id: user.id }, data: { name: nome } }) } catch {}
    onboarding.set(user.id, { step: 'askEmail', data: { name: nome } })
    const body = `Perfeito, ${nome}! Agora me diga seu email.\n\nUsaremos para enviar informações importantes e para você acessar sua conta depois. Digite o email que você mais usa.\n\nDigite abaixo 👇`
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askEmail', direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await sendWhatsAppText(sendId, phone, body)
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    return true
  }
  if (edit) {
    onboarding.set(user.id, { step: 'askName', data: {} })
    const body = 'Sem problemas! Digite novamente apenas seu nome, sem frases (ex: Tayna).'
    const outMsg = await prisma.onboardingMessage.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, step: 'askName', direction: 'out', type: 'text', content: body, status: 'queued' } })
    const result = await sendWhatsAppText(sendId, phone, body)
    await prisma.onboardingMessage.update({ where: { id: outMsg.id }, data: { status: result.ok ? 'sent' : 'failed' } })
    return true
  }
  return false
}

