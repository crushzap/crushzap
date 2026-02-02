import express from 'express'

export function createConversasRouter({ prisma }) {
  const router = express.Router()

  router.get('/api/conversas/:id/context', async (req, res) => {
    try {
      const id = req.params.id
      const conv = await prisma.conversation.findUnique({ where: { id } })
      if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' })
      const messages = await prisma.message.findMany({ where: { conversationId: id, NOT: { content: { startsWith: '__MP_' } } }, orderBy: { createdAt: 'asc' }, take: 50 })
      const lastSummary = await prisma.message.findFirst({ where: { conversationId: id, direction: 'out', type: 'text', content: { startsWith: 'RESUMO:' } }, orderBy: { createdAt: 'desc' } })
      const out = {
        summary: lastSummary ? lastSummary.content : null,
        messages: messages.map((m) => ({ role: m.direction === 'in' ? 'usuario' : 'agente', type: m.type, content: m.content, createdAt: m.createdAt })),
      }
      res.json(out)
    } catch {
      res.status(500).json({ error: 'Falha ao obter contexto da conversa' })
    }
  })

  return router
}

