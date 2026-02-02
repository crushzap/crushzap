import express from 'express'
import { requireAdminAuth } from '../infra/auth-admin.mjs'

export function createAdminRouter({ prisma }) {
  const router = express.Router()

  router.get('/api/admin/clients', requireAdminAuth, async (req, res) => {
    try {
      const { search, type } = req.query
      const where = {}
      
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } }
        ]
      }

      if (type === 'lead') {
        where.status = 'lead'
      } else if (type === 'cliente') {
        where.status = 'active'
      }

      const users = await prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          phone: true,
          status: true,
          role: true,
          trialLimit: true,
          trialUsedCount: true,
          createdAt: true,
          subscriptions: {
            where: { status: 'active' },
            select: {
              plan: { select: { name: true } }
            },
            take: 1
          },
          personas: {
            take: 1,
            select: { avatar: true }
          }
        }
      })

      const clients = users.map(u => ({
        id: u.id,
        name: u.name || 'Sem nome',
        phone: u.phone,
        type: u.status === 'active' ? 'cliente' : 'lead',
        minutesRemaining: u.status === 'lead' ? (u.trialLimit - u.trialUsedCount) : 999,
        avatar: u.personas?.[0]?.avatar || undefined
      }))

      res.json(clients)
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: 'Falha ao buscar clientes' })
    }
  })

  router.post('/api/admin/config/whatsapp', requireAdminAuth, async (req, res) => {
    const { phoneNumberId, wabaId, verifyToken } = req.body || {}
    if (!phoneNumberId || !wabaId || !verifyToken) {
      return res.status(400).json({ error: 'Dados inválidos' })
    }
    try {
      const cfg = await prisma.whatsappConfig.upsert({
        where: { phoneNumberId },
        update: { phoneNumberId, wabaId, verifyToken },
        create: { phoneNumberId, wabaId, verifyToken },
      })
      res.json(cfg)
    } catch (e) {
      res.status(500).json({ error: 'Falha ao salvar configuração do WhatsApp' })
    }
  })

  router.get('/api/admin/whatsapp/configs', requireAdminAuth, async (_req, res) => {
    try {
      const base = process.env.WHATSAPP_URL_WEBHOOK_BASE || ''
      const items = await prisma.whatsappConfig.findMany({ orderBy: { createdAt: 'desc' } })
      const out = items.map((c) => ({
        id: c.id,
        phoneNumberId: c.phoneNumberId,
        displayNumber: c.displayNumber || undefined,
        wabaId: c.wabaId,
        webhookUrl: c.webhookUrl || (base ? `${base}/api/whatsapp/webhook/${c.phoneNumberId}` : undefined),
        verifyToken: c.verifyToken,
        active: typeof c.active === 'boolean' ? c.active : true,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }))
      res.json(out)
    } catch (e) {
      res.status(500).json({ error: 'Falha ao listar configurações do WhatsApp' })
    }
  })

  router.post('/api/admin/whatsapp/configs', requireAdminAuth, async (req, res) => {
    try {
      const { phoneNumberId, displayNumber, wabaId } = req.body || {}
      if (!phoneNumberId || !wabaId) return res.status(400).json({ error: 'Dados inválidos' })
      const base = process.env.WHATSAPP_URL_WEBHOOK_BASE || ''
      const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
      if (!verifyToken) return res.status(400).json({ error: 'Token de verificação não configurado' })
      const webhookUrl = base ? `${base}/api/whatsapp/webhook/${phoneNumberId}` : null
      const created = await prisma.whatsappConfig.upsert({
        where: { phoneNumberId },
        update: { displayNumber: displayNumber || null, wabaId, verifyToken, webhookUrl },
        create: { phoneNumberId, displayNumber: displayNumber || null, wabaId, verifyToken, webhookUrl },
      })
      res.json({
        id: created.id,
        phoneNumberId: created.phoneNumberId,
        displayNumber: created.displayNumber || undefined,
        wabaId: created.wabaId,
        webhookUrl: created.webhookUrl || undefined,
        verifyToken: created.verifyToken,
        active: typeof created.active === 'boolean' ? created.active : true,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      })
    } catch (e) {
      res.status(500).json({ error: 'Falha ao criar configuração do WhatsApp' })
    }
  })

  router.put('/api/admin/whatsapp/configs/:id', requireAdminAuth, async (req, res) => {
    try {
      const id = req.params.id
      const { displayNumber, wabaId, active } = req.body || {}
      const data = {}
      if (typeof displayNumber !== 'undefined') data.displayNumber = displayNumber || null
      if (typeof wabaId !== 'undefined') data.wabaId = wabaId
      if (typeof active !== 'undefined') data.active = Boolean(active)
      const updated = await prisma.whatsappConfig.update({ where: { id }, data })
      res.json(updated)
    } catch (e) {
      res.status(500).json({ error: 'Falha ao atualizar configuração do WhatsApp' })
    }
  })

  router.delete('/api/admin/whatsapp/configs/:id', requireAdminAuth, async (req, res) => {
    try {
      const id = req.params.id
      const byId = await prisma.whatsappConfig.findUnique({ where: { id } })
      const where = byId ? { id } : { phoneNumberId: id }
      const existing = await prisma.whatsappConfig.findUnique({ where })
      if (!existing) return res.status(404).json({ error: 'Configuração não encontrada' })
      await prisma.whatsappConfig.delete({ where })
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ error: 'Falha ao excluir configuração do WhatsApp' })
    }
  })

  router.post('/api/admin/config/grok', requireAdminAuth, async (req, res) => {
    const { model, enabled } = req.body || {}
    if (!model || typeof enabled === 'undefined') {
      return res.status(400).json({ error: 'Dados inválidos' })
    }
    try {
      const cfg = await prisma.grokConfig.upsert({
        where: { id: 'singleton' },
        update: { model, enabled: Boolean(enabled) },
        create: { id: 'singleton', model, enabled: Boolean(enabled) },
      })
      res.json(cfg)
    } catch (e) {
      res.status(500).json({ error: 'Falha ao salvar configuração do Grok' })
    }
  })

  router.get('/api/admin/planos', requireAdminAuth, async (_req, res) => {
    try {
      const plans = await prisma.plan.findMany({ orderBy: { name: 'asc' } })
      res.json(plans)
    } catch {
      res.status(500).json({ error: 'Falha ao listar planos' })
    }
  })

  router.post('/api/admin/planos', requireAdminAuth, async (req, res) => {
    try {
      const { name, price, currency, messagesPerCycle, personasAllowed, audioEnabled, active } = req.body || {}
      if (!name || !price || !messagesPerCycle || !personasAllowed) {
        return res.status(400).json({ error: 'Dados inválidos' })
      }
      const created = await prisma.plan.upsert({
        where: { name },
        update: { price: price, currency: currency || 'BRL', messagesPerCycle, personasAllowed, audioEnabled: Boolean(audioEnabled), active: typeof active === 'boolean' ? active : true },
        create: { name, price: price, currency: currency || 'BRL', messagesPerCycle, personasAllowed, audioEnabled: Boolean(audioEnabled), active: typeof active === 'boolean' ? active : true },
      })
      res.json(created)
    } catch {
      res.status(500).json({ error: 'Falha ao criar/atualizar plano' })
    }
  })

  router.get('/api/admin/conversas', requireAdminAuth, async (req, res) => {
    const q = (req.query.q || '').toString().trim()
    try {
      const conversations = await prisma.conversation.findMany({
        where: q
          ? {
              OR: [
                { user: { phone: { contains: q } } },
                { user: { name: { contains: q, mode: 'insensitive' } } },
                { persona: { name: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : undefined,
        include: {
          user: true,
          persona: true,
          messages: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
          onboardingMessages: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { messages: true, onboardingMessages: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
      const out = conversations.map((c) => ({
        lastMessageAt: [c.messages[0]?.createdAt, c.onboardingMessages[0]?.createdAt, c.createdAt]
          .filter(Boolean)
          .sort((a, b) => b.getTime() - a.getTime())[0],
        id: c.id,
        userPhone: c.user.phone,
        userName: c.user.name,
        personaName: c.persona.name,
        messagesCount: c._count.messages + c._count.onboardingMessages,
        createdAt: c.createdAt,
      }))
      res.json(out)
    } catch (e) {
      res.status(500).json({ error: 'Falha ao listar conversas' })
    }
  })

  router.get('/api/admin/conversas/:id/mensagens', requireAdminAuth, async (req, res) => {
    const id = (req.params.id || '').toString()
    const takeRaw = Number(req.query.take || 200)
    const take = Number.isFinite(takeRaw) ? Math.min(Math.max(takeRaw, 1), 500) : 200
    try {
      const conv = await prisma.conversation.findUnique({ where: { id }, select: { id: true } })
      if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' })

      const [messages, onboarding] = await Promise.all([
        prisma.message.findMany({
          where: {
            conversationId: id,
            NOT: [
              { content: { startsWith: '__MP_' } },
              { content: { startsWith: 'RESUMO:' } },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take,
        }),
        prisma.onboardingMessage.findMany({
          where: {
            conversationId: id,
            NOT: [
              { content: { startsWith: '__MP_' } },
              { content: { startsWith: 'RESUMO:' } },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take,
        }),
      ])

      const merged = [
        ...messages.map((m) => ({ _src: 'mensagem', ...m })),
        ...onboarding.map((m) => ({ _src: 'onboarding', ...m })),
      ]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, take)
        .reverse()

      res.json(
        merged.map((m) => ({
          id: m._src === 'mensagem' ? `m_${m.id}` : `o_${m.id}`,
          direction: m.direction,
          type: m.type,
          content: m.content,
          status: m.status,
          createdAt: m.createdAt,
        })),
      )
    } catch {
      res.status(500).json({ error: 'Falha ao obter mensagens' })
    }
  })

  router.get('/api/admin/assinaturas', requireAdminAuth, async (_req, res) => {
    try {
      const subs = await prisma.subscription.findMany({ include: { user: true, plan: true }, orderBy: { currentPeriodEnd: 'desc' } })
      const out = subs.map((s) => ({
        id: s.id,
        userPhone: s.user.phone,
        planName: s.plan.name,
        status: s.status,
        currentPeriodEnd: s.currentPeriodEnd,
      }))
      res.json(out)
    } catch (e) {
      res.status(500).json({ error: 'Falha ao listar assinaturas' })
    }
  })

  router.get('/api/admin/personas', requireAdminAuth, async (_req, res) => {
    try {
      const personas = await prisma.persona.findMany({
        include: { user: { select: { id: true, phone: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      })
      res.json(
        personas.map((p) => ({
          id: p.id,
          userId: p.userId,
          userPhone: p.user?.phone,
          userName: p.user?.name,
          name: p.name,
          personality: p.personality,
          avatar: p.avatar,
          responseMode: p.responseMode,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
      )
    } catch {
      res.status(500).json({ error: 'Falha ao listar personas' })
    }
  })

  return router
}
