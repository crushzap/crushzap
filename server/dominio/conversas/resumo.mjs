function scoreMessageForHighlight(text) {
  let score = 0
  if (!text) return score
  const t = text.toLowerCase()
  score += Math.min(text.length / 40, 5)
  if (/[!😍❤️😂✨]/.test(text)) score += 3
  const keywords = ['importante', 'plano', 'assina', 'pagamento', 'duvida', 'ajuda', 'problema', 'amo', 'gostar', 'feliz', 'triste', 'upgrade', 'trial']
  for (const k of keywords) if (t.includes(k)) score += 2
  return score
}

export async function generateAndStoreSummary(prisma, conversationId) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } })
  if (!conversation) return
  const msgs = await prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' }, take: 50 })
  const labeled = msgs.map((m) => ({ role: m.direction === 'in' ? 'Usuário' : 'Agente', text: m.content }))
  const highlights = labeled
    .map((m, idx) => ({ idx, role: m.role, text: m.text, score: scoreMessageForHighlight(m.text) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
  const important = labeled.filter((m) => /importante|plano|pagamento|assin|upgrade|trial/i.test(m.text)).slice(0, 8)
  const lines = []
  if (highlights.length) {
    lines.push('Melhores momentos:')
    for (const h of highlights) lines.push(`- ${h.role}: ${h.text}`)
  }
  if (important.length) {
    lines.push('Pontos importantes:')
    for (const i of important) lines.push(`- ${i.role}: ${i.text}`)
  }
  if (!lines.length) {
    const sampled = labeled.filter((_, i) => i % 5 === 0).slice(0, 10)
    lines.push('Resumo geral:')
    for (const s of sampled) lines.push(`- ${s.role}: ${s.text}`)
  }
  let summary = `Resumo da conversa (últimas 50 mensagens)\n${lines.join('\n')}`
  if (summary.length > 2000) summary = summary.slice(0, 2000)
  await prisma.message.create({
    data: {
      conversationId,
      userId: conversation.userId,
      personaId: conversation.personaId,
      direction: 'out',
      type: 'text',
      content: `RESUMO: ${summary}`,
      status: 'sent',
    },
  })
}

