export async function salvarEntradaWhatsapp({ prisma, store, conversationId, userId, personaId, step, direction, type, content, status, metadata }) {
  if (store === 'onboarding') {
    return prisma.onboardingMessage.create({ data: { conversationId, userId, personaId, step: step || 'start', direction, type, content, status, metadata: metadata || undefined } })
  }
  return prisma.message.create({ data: { conversationId, userId, personaId, direction, type, content, status, metadata: metadata || undefined } })
}

export async function salvarSaidaEEnviar({ prisma, store, conversationId, userId, personaId, step, type, content, metadata, enviar }) {
  const msgType = type === 'audio' ? 'audio' : 'text'
  const created = await salvarEntradaWhatsapp({ prisma, store, conversationId, userId, personaId, step, direction: 'out', type: msgType, content, status: 'queued', metadata })
  const result = await enviar()
  const finalStatus = result && result.ok ? 'sent' : 'failed'
  if (store === 'onboarding') {
    await prisma.onboardingMessage.update({ where: { id: created.id }, data: { status: finalStatus } })
  } else {
    await prisma.message.update({ where: { id: created.id }, data: { status: finalStatus } })
  }
  return { result, created }
}
