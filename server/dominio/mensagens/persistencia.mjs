function normalizarTipoMensagem(type) {
  const t = (type || 'text').toString().trim().toLowerCase()
  if (t === 'audio' || t === 'voice') return 'audio'
  if (t === 'image') return 'image'
  return 'text'
}

export async function salvarEntradaWhatsapp({ prisma, store, conversationId, userId, personaId, step, direction, type, content, status, metadata }) {
  const normalizedType = normalizarTipoMensagem(type)
  const shouldAttachRawType = !!type && normalizedType !== (type || '').toString().trim().toLowerCase()
  const baseMetadata =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? metadata
      : {}
  const finalMetadata =
    shouldAttachRawType
      ? { ...baseMetadata, waType: (type || '').toString() }
      : baseMetadata

  if (store === 'onboarding') {
    return prisma.onboardingMessage.create({ data: { conversationId, userId, personaId, step: step || 'start', direction, type: normalizedType, content, status, metadata: Object.keys(finalMetadata).length ? finalMetadata : undefined } })
  }
  return prisma.message.create({ data: { conversationId, userId, personaId, direction, type: normalizedType, content, status, metadata: Object.keys(finalMetadata).length ? finalMetadata : undefined } })
}

export async function salvarSaidaEEnviar({ prisma, store, conversationId, userId, personaId, step, type, content, metadata, enviar }) {
  const msgType = normalizarTipoMensagem(type)
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
