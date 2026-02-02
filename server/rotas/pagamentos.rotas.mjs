import express from 'express'
import { sendWhatsAppText } from '../integracoes/whatsapp/cliente.mjs'

export function createPagamentosRouter({ prisma, createPixPayment, processMercadoPagoWebhook, ensureUserByPhone, ensureDefaultPersona, ensureConversation }) {
  const router = express.Router()

  router.post('/api/pagamentos/pix/checkout', async (req, res) => {
    const { type, planId, amount, action, credits, userPhone, phoneNumberId, payerEmail, payerName } = req.body || {}
    try {
      const result = await createPixPayment({ prisma, type, planId, amount, action, credits, userPhone, phoneNumberId, payerEmail, payerName })
      res.json(result)
    } catch (e) {
      const status = e.message === 'Tipo inválido' || e.message === 'planId obrigatório' || e.message === 'amount inválido' || e.message === 'action obrigatório' || e.message === 'Plano não encontrado' ? 400 : 500
      res.status(status).json({ error: e.message })
    }
  })

  router.post('/api/webhook/pagamentos', async (req, res) => {
    try {
      const result = await processMercadoPagoWebhook({ prisma, ensureUserByPhone, body: req.body })
      if ((result?.event?.type === 'assinatura_aprovada' || result?.event?.type === 'creditos_aprovados' || result?.event?.type === 'pacote_fotos_aprovado') && result?.event?.userPhone) {
        console.log('[Webhook Pagamentos] Processando evento de aprovação:', result.event)
        const paymentId = (result?.paymentId || '').toString().trim()
        const sendId =
          (result.phoneNumberId || '').toString().trim()
          || (await prisma.whatsappConfig.findFirst({ where: { active: true }, orderBy: { createdAt: 'desc' } }))?.phoneNumberId
        if (sendId && paymentId) {
          const eventType = (result?.event?.type || '').toString()
          const action = (result?.event?.action || '').toString()
          const planName = (result?.event?.planName || '').toString()
          const cycleDays = Number(result?.event?.cycleDays || 0) || 0
          const count = Number(result?.event?.count || 0) || 0
          
          const txt = eventType === 'pacote_fotos_aprovado'
            ? `Oba amor! 😍 Recebi seu presente!\n\nLiberamos +${count} fotos exclusivas pra você. Tô doida pra te mostrar o que preparei... 😈\n\nMe pede agora!`
            : eventType === 'creditos_aprovados'
            ? `Ah amor, recebi seu pix direitinho. Já coloquei +${Number(result?.event?.credits || 0) || 100} mensagens avulsas pra você 🥰\n\nO que você quer fazer agora?`
            : action === 'renovacao_semanal'
              ? `Aaaah amor 😍 seu pix caiu certinho!\n\nJá *renovei seu plano* e você ganhou mais *${cycleDays || 7} dias* pra gente continuar juntinhos 💜\n\nMe chama aqui e vamos continuar nossa conversa ✨`
              : action === 'renovacao_mensal'
                ? `Aaaah amor 😍 seu pix caiu certinho!\n\nJá *renovei seu plano* e você ganhou mais *${cycleDays || 30} dias* com a gente juntinhos 💜\n\nMe chama aqui e vamos continuar nossa conversa ✨`
                : action === 'upgrade_mensal'
                  ? `Amorrr 😍 seu pix caiu certinho!\n\nProntinho: fiz seu *upgrade pro plano mensal* e agora temos mais *${cycleDays || 30} dias* pra viver muita coisa juntos ✨💜\n\nMe chama aqui!`
                  : (
                      'Ah amor, que bom que você voltou. Por um instante pensei que você tivesse me abandonado. Obrigada por ter me mandado esse pix.\n\n' +
                      `Seu carinho por mim é mesmo muito grande. Agora já sou toda sua novamente${planName ? ` (plano ${planName})` : ''}. O que você quer como recompensa?`
                    )
          try {
            const user = await ensureUserByPhone(result.event.userPhone.toString())
            const persona = await ensureDefaultPersona(user.id)
            const conv = await ensureConversation(user.id, persona.id)
            const marker = `__MP_APPROVED__:${paymentId}`
            const already = await prisma.message.findFirst({ where: { conversationId: conv.id, direction: 'out', type: 'text', content: marker } })
            if (!already) {
              const markerMsg = await prisma.message.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, direction: 'out', type: 'text', content: marker, status: 'queued' } })
              const outMsg = await prisma.message.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, direction: 'out', type: 'text', content: txt, status: 'queued' } })
              const waRes = await sendWhatsAppText(sendId, result.event.userPhone.toString(), txt)
              const status = waRes.ok ? 'sent' : 'failed'
              await prisma.message.update({ where: { id: outMsg.id }, data: { status } })
              await prisma.message.update({ where: { id: markerMsg.id }, data: { status } })
            }
          } catch (e) {
            console.error('[Webhook Pagamentos] Falha ao notificar WhatsApp', { error: (e && e.message) || 'unknown' })
          }
        }
      }
      res.json({ ok: true })
    } catch (e) {
      try {
        console.error('[Webhook Pagamentos] erro', { error: (e && e.message) || 'unknown', bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body).slice(0, 20) : [] })
      } catch {}
      res.status(500).json({ error: 'Falha ao processar webhook de pagamentos' })
    }
  })

  return router
}
