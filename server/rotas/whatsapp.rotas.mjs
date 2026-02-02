import express from 'express'
import fs from 'fs'
import path from 'path'
import { extractWhatsAppMessages, extractWhatsAppStatuses } from '../integracoes/whatsapp/parser.mjs'
import { sendWhatsAppAudioSmart, sendWhatsAppButtons, sendWhatsAppImageSmart, sendWhatsAppList, sendWhatsAppReadTyping, sendWhatsAppText, getWhatsAppMediaUrl, downloadWhatsAppMedia } from '../integracoes/whatsapp/cliente.mjs'
import { descreverImagemGemini } from '../integracoes/ia/gemini-vision.mjs'
import { audioModal } from '../integracoes/ia/audio-modal.mjs'
import { uploadAudio } from '../integracoes/supabase/storage-audio.mjs'
import { onboarding, upgradeFlow, billingFlow } from '../whatsapp/estado.mjs'
import { criarContextoWhatsapp } from '../whatsapp/contexto.mjs'
import { ensureConversation, ensureDefaultPersona, ensureUserByPhone, isPersonaReady } from '../dominio/conversas/servico.mjs'
import { salvarEntradaWhatsapp } from '../dominio/mensagens/persistencia.mjs'
import { handleComandos } from '../whatsapp/fluxos/comandos.fluxo.mjs'
import { handleBilling } from '../whatsapp/fluxos/billing.fluxo.mjs'
import { handleUpgrade } from '../whatsapp/fluxos/upgrade.fluxo.mjs'
import { handleOnboarding } from '../whatsapp/fluxos/onboarding.fluxo.mjs'
import { handleConversaAgente } from '../whatsapp/fluxos/conversa-agente.fluxo.mjs'
import { applyTrialConsumption, checkSubscriptionAllowance, hasActiveSubscription } from '../assinaturas/controle.mjs'
import { createPixPayment } from '../pagamentos/mercadoPago.mjs'
import { composeSystemPrompt } from '../agents/prompt.mjs'
import { generateWithGrok } from '../integrations/grok.mjs'
import { buildLLMMessages } from '../dominio/llm/historico.mjs'
import { generateAndStoreSummary } from '../dominio/conversas/resumo.mjs'

export function createWhatsAppRouter({ prisma }) {
  const router = express.Router()
  const maps = { onboarding, upgradeFlow, billingFlow }
  const messageBuffer = new Map()
  const processedInboundIds = new Map()

  function shouldDisableBufferForAudioRequest(inputText) {
    const t = (inputText || '').toString().toLowerCase()
    return /(manda|envia|me manda|responde).*(áudio|audio)/.test(t)
      || /(por|em)\s+(áudio|audio)/.test(t)
      || /(voice note|nota de voz)/.test(t)
  }

  function shouldProcessInboundId(messageId) {
    const id = (messageId || '').toString().trim()
    if (!id) return true
    const now = Date.now()
    const prev = processedInboundIds.get(id)
    if (prev && (now - prev) < 10 * 60 * 1000) return false
    processedInboundIds.set(id, now)
    if (processedInboundIds.size > 5000) {
      for (const [k, ts] of processedInboundIds.entries()) {
        if ((now - ts) > 10 * 60 * 1000) processedInboundIds.delete(k)
      }
    }
    return true
  }

  async function flushMessageBuffer(userId) {
    const entry = messageBuffer.get(userId)
    if (!entry) return

    messageBuffer.delete(userId)
    clearTimeout(entry.timer)

    const { messages, ctx } = entry
    const combinedText = messages.join('\n')
    console.log('[Buffer] Flushing messages for', userId, 'Count:', messages.length)

    const newCtx = {
      ...ctx,
      text: combinedText,
      typed: combinedText.replace(/[!?.]/g, '').trim().toLowerCase(),
    }

    await salvarEntradaWhatsapp({
      prisma,
      store: 'message',
      conversationId: newCtx.conv.id,
      userId: newCtx.user.id,
      personaId: newCtx.persona.id,
      step: undefined,
      direction: 'in',
      type: 'text',
      content: combinedText,
      status: 'delivered',
    })

    if (await handleComandos(newCtx)) return
    if (await handleBilling(newCtx)) return
    if (await handleUpgrade(newCtx)) return
    if (await handleOnboarding(newCtx)) return
    await handleConversaAgente(newCtx)
  }

  async function processarMensagensWebhook(req, messages) {
    console.log('[Webhook] received', { count: messages.length })
    if (!messages.length) return

    for (const m of messages) {
      if (!shouldProcessInboundId(m.id)) {
        console.log('[Webhook] duplicate_inbound_skipped', { id: m.id })
        continue
      }
      const ctxBase = await criarContextoWhatsapp({
        prisma,
        req,
        waMessage: m,
        ensureUserByPhone: (phone) => ensureUserByPhone(prisma, phone),
        ensureDefaultPersona: (userId) => ensureDefaultPersona(prisma, userId),
        ensureConversation: (userId, personaId) => ensureConversation(prisma, userId, personaId),
        maps,
      })
      if (!ctxBase) continue

      let dbContent = null
      let dbType = null
      let dbMetadata = null

      // Tentar baixar mídia se for sticker ou imagem e tiver mediaId
      if (m.mediaId && (m.type === 'sticker' || m.type === 'image' || m.type === 'audio' || m.type === 'voice')) {
        try {
          const urlRes = await getWhatsAppMediaUrl(m.mediaId)
          if (urlRes.ok && urlRes.url) {
            const dlRes = await downloadWhatsAppMedia(urlRes.url)
            if (dlRes.ok && dlRes.buffer) {
              const isAudio = m.type === 'audio' || m.type === 'voice';
              
              if (isAudio) {
                 // Fluxo de Áudio
                 const ext = dlRes.contentType.includes('ogg') ? 'ogg' : 'mp3'; // WhatsApp geralmente manda OGG/Opus
                 console.log('[Webhook][Audio] downloaded', { bytes: dlRes.buffer?.length || 0, contentType: dlRes.contentType })
                 
                 // 1. Upload para Supabase (para persistência e URL pública)
                 try {
                    const publicUrl = await uploadAudio({ buffer: dlRes.buffer, contentType: dlRes.contentType });
                   dbContent = publicUrl;
                   dbType = 'audio';
                   console.log('[Webhook][Audio] uploaded', { url: publicUrl })
                   
                   // 2. Transcrição (Modal)
                   console.log('[Webhook] Transcrevendo áudio...');
                   const transcription = await audioModal.transcribe(dlRes.buffer);
                   console.log('[Webhook][Audio] transcription_done', { chars: (transcription || '').toString().length });
                   
                   if (transcription) {
                     dbMetadata = { transcription };
                   }
                 } catch (err) {
                   console.error('[Webhook] Erro no processamento de áudio:', err);
                   // Fallback: trata como áudio sem transcrição (agente vai receber vazio ou aviso)
                 }

              } else {
                // Fluxo de Imagem/Sticker (Código original)
                const ext = dlRes.contentType.includes('webp') ? 'webp' : dlRes.contentType.includes('png') ? 'png' : 'jpg'
                const fileName = `${m.mediaId}.${ext}`
                const uploadDir = path.join(process.cwd(), 'public', 'uploads')
                if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
                
                const filePath = path.join(uploadDir, fileName)
                fs.writeFileSync(filePath, dlRes.buffer)
                
                dbContent = `/uploads/${fileName}`
                dbType = 'image'

                // Gerar descrição com IA (Vision)
                console.log('[Webhook] Iniciando descrição de imagem com Gemini...')
                const visionRes = await descreverImagemGemini({
                  buffer: dlRes.buffer,
                  mimeType: dlRes.contentType
                })

                if (visionRes.ok && visionRes.text) {
                   console.log('[Webhook] Descrição gerada:', visionRes.text)
                   dbMetadata = { description: visionRes.text }
                } else {
                   console.warn('[Webhook] Falha na descrição:', visionRes)
                }
              }
            }
          }
        } catch (e) {
          console.error('[Media Download Error]', e)
        }
      }

      console.log('[Webhook] incoming', { 
        from: ctxBase.phone, 
        text: (ctxBase.text || '').toString(), 
        personaId: ctxBase.persona?.id, 
        personaName: ctxBase.persona?.name, 
        dbType,
        desc: dbMetadata?.description
      })

      const isCommandMenu = ctxBase.typed === '#comandos'
      const isCommand = isCommandMenu || (ctxBase.reply && ctxBase.reply.startsWith('cmd_'))
      const inboundStep = isCommandMenu ? 'commands_menu' : (ctxBase.reply && ctxBase.reply.startsWith('cmd_') ? `commands_${ctxBase.reply}` : (ctxBase.state?.step || 'start'))

      const shouldStoreOnboarding =
        isCommand
        || !!ctxBase.state
        || ctxBase.reply === 'vamos_sim'
        || ctxBase.typed === 'vamos sim'
        || (ctxBase.reply || '').startsWith('upgrade_')
        || (ctxBase.reply || '').startsWith('assinar_')
        || (ctxBase.reply || '').startsWith('billing_')
        || !!ctxBase.flow
        || !!ctxBase.billing

      const personaReady = await isPersonaReady(ctxBase.persona)

      // Injeta descrição da imagem no texto do contexto para o agente ler
      let contextText = ctxBase.text
      if (dbMetadata?.description) {
          contextText = `[O usuário enviou uma imagem/foto/figurinha]. O que tem na imagem: ${dbMetadata.description}. Legenda do usuário: "${ctxBase.text}"`
      } else if (dbMetadata?.transcription) {
          contextText = (dbMetadata.transcription || '').toString().trim()
      }

      const ctx = {
        ...ctxBase,
        text: contextText,
        typed: (contextText || '').toString().replace(/[!?.]/g, '').trim().toLowerCase(),
        msgType: dbType || ctxBase.msgType,
        personaReady,
        sendWhatsAppText,
        sendWhatsAppButtons,
        sendWhatsAppList,
        sendWhatsAppImageLink: sendWhatsAppImageSmart,
        sendWhatsAppAudioLink: sendWhatsAppAudioSmart,
        sendWhatsAppChatState: async (type) => {
          const enabled = (process.env.WHATSAPP_ENABLE_TYPING_INDICATOR || '').toString().trim().toLowerCase()
          const on = enabled === '1' || enabled === 'true' || enabled === 'sim' || enabled === 'yes'
          if (!on) return { ok: false, skipped: true }
          const inboundId = ctxBase?.waMessage?.id
          if (!inboundId) return { ok: false, skipped: true }
          const desiredRaw = (type || 'text').toString().trim().toLowerCase()
          const desired = desiredRaw === 'text' ? 'text' : 'text'
          return sendWhatsAppReadTyping(ctxBase.sendId, ctxBase.phone, inboundId, desired)
        },
        createPixPayment: (args) => createPixPayment({ prisma, ...args }),
        applyTrialConsumption,
        checkSubscriptionAllowance,
        maps,
      }

      const isText = ctx.msgType === 'text'
      if (!shouldStoreOnboarding && isText) {
        const userId = ctx.user.id
        const entry = messageBuffer.get(userId)
        const ctxOnboarding = entry
          ? { ...ctx, text: [...entry.messages, ctx.text].filter(Boolean).join('\n') }
          : ctx
        const handled = await handleOnboarding(ctxOnboarding)
        if (handled) {
          if (entry) {
            messageBuffer.delete(userId)
            clearTimeout(entry.timer)
          }
          await salvarEntradaWhatsapp({
            prisma,
            store: 'onboarding',
            conversationId: ctxBase.conv.id,
            userId: ctxBase.user.id,
            personaId: ctxBase.persona.id,
            step: inboundStep,
            direction: 'in',
            type: ctx.msgType,
            content: dbContent || ctxOnboarding.text,
            status: 'delivered',
            metadata: dbMetadata
          })
          continue
        }
      }

      // Lógica de Buffering para mensagens de texto soltas (chat)
      // Se não for comando/onboarding e for texto, agrupa.
      let shouldBuffer = !shouldStoreOnboarding && isText
      if (shouldBuffer && shouldDisableBufferForAudioRequest(ctxBase.text)) {
        shouldBuffer = false
      }

      if (shouldBuffer) {
        // Verificar se usuário deve ser bloqueado (Trial ou Cota) para responder imediatamente
        const hasSub = await hasActiveSubscription(prisma, ctx.user.id)
        if (hasSub) {
           // Usuário assinante: verificar cota
           const allowance = await checkSubscriptionAllowance(prisma, ctx.user.id)
           if (!allowance.allowed) {
             shouldBuffer = false
           }
        } else {
           // Usuário Trial: verificar se está bloqueado ou esgotou
           if (ctx.user.status === 'blocked' || (ctx.user.trialUsedCount || 0) >= (ctx.user.trialLimit || 10)) {
             shouldBuffer = false
           }
        }
      }

      if (shouldBuffer) {
        const userId = ctx.user.id
        if (messageBuffer.has(userId)) {
          const entry = messageBuffer.get(userId)
          clearTimeout(entry.timer)
          entry.messages.push(ctx.text)
          entry.ctx = ctx // atualiza contexto
          entry.timer = setTimeout(() => flushMessageBuffer(userId), 15000)
        } else {
          const timer = setTimeout(() => flushMessageBuffer(userId), 15000)
          messageBuffer.set(userId, {
            timer,
            messages: [ctx.text],
            ctx
          })
        }
        continue
      }

      // Se chegou aqui, é uma mensagem que deve ser processada imediatamente (comando, botão, etc)
      // Primeiro, processa qualquer coisa pendente no buffer
      await flushMessageBuffer(ctx.user.id)

      await salvarEntradaWhatsapp({
        prisma,
        store: shouldStoreOnboarding ? 'onboarding' : 'message',
        conversationId: ctxBase.conv.id,
        userId: ctxBase.user.id,
        personaId: ctxBase.persona.id,
        step: shouldStoreOnboarding ? inboundStep : undefined,
        direction: 'in',
        type: ctx.msgType,
        content: dbContent || ctxBase.text,
        status: 'delivered',
        metadata: dbMetadata
      })

      if (await handleComandos(ctx)) continue
      if (await handleBilling(ctx)) continue
      if (await handleUpgrade(ctx)) continue
      if (await handleOnboarding(ctx)) continue
      if (await handleConversaAgente(ctx)) continue
    }
  }

  router.get('/api/whatsapp/webhook/:phoneNumberId', async (req, res) => {
    try {
      const id = req.params.phoneNumberId
      const expectedRaw = (await prisma.whatsappConfig.findUnique({ where: { phoneNumberId: id } }))?.verifyToken
        || process.env.WHATSAPP_VERIFY_TOKEN
        || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
      const expected = (expectedRaw || '').toString().trim()
      const token = (req.query['hub.verify_token'] || req.query['verify_token'] || '').toString().trim()
      const challenge = (req.query['hub.challenge'] || '').toString()
      if (!challenge) return res.status(200).send('OK')
      if (!expected || !token || token !== expected) return res.status(403).send('Token inválido')
      if (!challenge) return res.status(400).send('Challenge ausente')
      res.status(200).send(challenge)
    } catch {
      res.status(500).send('Erro no webhook')
    }
  })

  router.post('/api/whatsapp/webhook/:phoneNumberId', async (req, res) => {
    res.status(200).json({ ok: true })
    try {
      const messages = extractWhatsAppMessages(req.body)
      try {
        const statuses = extractWhatsAppStatuses(req.body)
        for (const st of statuses) {
          if (st.status === 'failed') {
            console.error('[Webhook Status] failed', {
              id: st.id,
              recipientId: st.recipientId,
              phoneNumberId: st.phoneNumberId || req.params.phoneNumberId,
              errors: st.errors,
            })
          } else if (st.id && st.status) {
            console.log('[Webhook Status]', { id: st.id, status: st.status })
          }
        }
      } catch {}
      await processarMensagensWebhook(req, messages)
    } catch (e) {
      console.error('[Webhook] process_failed', { error: e?.message || String(e) })
    }
  })

  router.get('/api/webhook/whatsapp', async (req, res) => {
    try {
      const cfg = await prisma.whatsappConfig.findUnique({ where: { id: 'singleton' } })
      const token = req.query['hub.verify_token']?.toString()
      const challenge = req.query['hub.challenge']?.toString()
      const mode = req.query['hub.mode']?.toString()
      if (!mode || !token || !challenge) return res.status(400).send('')
      if (!cfg || cfg.verifyToken !== token) return res.status(403).send('')
      res.status(200).send(challenge)
    } catch {
      res.status(500).send('')
    }
  })

  router.post('/api/webhook/whatsapp', async (req, res) => {
    res.status(200).json({ ok: true })
    try {
      const messages = extractWhatsAppMessages(req.body)
      try {
        const statuses = extractWhatsAppStatuses(req.body)
        for (const st of statuses) {
          if (st.status === 'failed') {
            console.error('[Webhook Status] failed', {
              id: st.id,
              recipientId: st.recipientId,
              phoneNumberId: st.phoneNumberId,
              errors: st.errors,
            })
          } else if (st.id && st.status) {
            console.log('[Webhook Status]', { id: st.id, status: st.status })
          }
        }
      } catch {}
      await processarMensagensWebhook(req, messages)
    } catch (e) {
      console.error('[Webhook] process_failed', { error: e?.message || String(e) })
    }
  })

  router.post('/api/whatsapp/send', async (req, res) => {
    try {
      const { to, content, type } = req.body || {}
      const phone = (to || '').toString().trim()
      const body = (content || '').toString()
      const t = (type || 'text').toString()
      if (!phone || !body) return res.status(400).json({ error: 'Parâmetros inválidos' })
      const user = await ensureUserByPhone(prisma, phone)
      const persona = await ensureDefaultPersona(prisma, user.id)
      const conv = await ensureConversation(prisma, user.id, persona.id)
      const msgType = t === 'audio' ? 'audio' : 'text'
      const allowance = await checkSubscriptionAllowance(prisma, user.id)
      if (allowance.sub && !allowance.allowed) {
        const txt = `Limite do plano ${allowance.sub.plan.name} atingido. Acesse /planos para comprar mensagens avulsas via PIX.`
        const createdInfo = await prisma.message.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, direction: 'out', type: 'text', content: txt, status: 'sent' } })
        return res.json({ id: createdInfo.id })
      }
      const created = await prisma.message.create({ data: { conversationId: conv.id, userId: user.id, personaId: persona.id, direction: 'out', type: msgType, content: body, status: 'sent' } })
      const total = await prisma.message.count({ where: { conversationId: conv.id } })
      if (total % 50 === 0) {
        try { await generateAndStoreSummary(prisma, conv.id) } catch {}
      }
      res.json({ id: created.id })
    } catch {
      res.status(500).json({ error: 'Falha ao enviar mensagem' })
    }
  })

  return router
}
