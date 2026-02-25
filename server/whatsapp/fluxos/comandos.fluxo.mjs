import { checkSubscriptionAllowance, getActiveSubscription, hasActiveSubscription } from '../../assinaturas/controle.mjs'
import { salvarSaidaEEnviar } from '../../dominio/mensagens/persistencia.mjs'
import { gerarUrlPublicaQrCodePix } from '../../pagamentos/pix-qrcode.mjs'

function formatarDataHoraPtBr(data) {
  try {
    const d = data instanceof Date ? data : new Date(data)
    if (!d || Number.isNaN(d.getTime())) return ''
    return d.toLocaleString('pt-BR')
  } catch {
    return ''
  }
}

export async function handleComandos(ctx) {
  const { prisma, typed, reply, sendId, phone, conv, user, persona, sendWhatsAppList, sendWhatsAppText, sendWhatsAppButtons, sendWhatsAppImageLink, createPixPayment } = ctx

  if (typed === '#comandos') {
    const body = 'Menu de comandos:\n\nEscolha uma opção abaixo.'
    const rows = [
      { id: 'cmd_consulta_plano', title: 'Consulta Plano', description: 'Saldo e detalhes do seu plano' },
      { id: 'cmd_historico', title: 'Histórico', description: 'Em breve' },
      { id: 'cmd_configuracoes', title: 'Configurações', description: 'Em breve' },
      { id: 'cmd_suporte', title: 'Suporte', description: 'Em breve' },
    ]
    await salvarSaidaEEnviar({
      prisma,
      store: 'onboarding',
      conversationId: conv.id,
      userId: user.id,
      personaId: persona.id,
      step: 'commands_menu',
      content: body,
      enviar: () => sendWhatsAppList(sendId, phone, body, rows, 'Comandos', 'Abrir'),
    })
    return true
  }

  if (typed === '#plano@deteste') {
    const planName = 'Plano de teste'
    const price = 1.15
    const plan = await prisma.plan.upsert({
      where: { name: planName },
      update: {
        price,
        messagesPerCycle: 10,
        personasAllowed: 1,
        audioEnabled: false,
        imagesPerCycle: 0,
        active: false,
      },
      create: {
        name: planName,
        price,
        messagesPerCycle: 10,
        personasAllowed: 1,
        audioEnabled: false,
        imagesPerCycle: 0,
        active: false,
      },
    })

    const pix = await createPixPayment({
      prisma,
      type: 'assinatura',
      planId: plan.id,
      action: 'plano_teste',
      userPhone: phone,
      phoneNumberId: sendId,
      payerEmail: user.email || `${phone.replace(/[^\d]/g, '')}@gmail.com`,
      payerName: user.name || 'Cliente',
    })

    if (!pix) {
      const txt = 'Não consegui gerar o PIX do plano de teste agora. Tente novamente em instantes.'
      await salvarSaidaEEnviar({
        prisma,
        store: 'onboarding',
        conversationId: conv.id,
        userId: user.id,
        personaId: persona.id,
        step: 'plano_teste_pix_error',
        content: txt,
        enviar: () => sendWhatsAppText(sendId, phone, txt),
      })
      return true
    }

    let pixQrUrl = ''
    if (pix?.qrCodeBase64 && typeof sendWhatsAppImageLink === 'function') {
      try {
        const up = await gerarUrlPublicaQrCodePix({ checkoutId: pix.checkoutId, qrCodeBase64: pix.qrCodeBase64 })
        if (up.ok && up.publicUrl) pixQrUrl = up.publicUrl
      } catch {}
    }

    const intro = `Plano de teste ativado. Valor: *R$ ${price.toFixed(2).replace('.', ',')}*.\n\n*Toque em COPIAR PIX* para pegar o código.`
    const buttons = [
      { id: 'plano_teste_copiar_pix', title: 'COPIAR PIX' },
      { id: 'plano_teste_agora_nao', title: 'AGORA NÃO' },
    ]

    await salvarSaidaEEnviar({
      prisma,
      store: 'onboarding',
      conversationId: conv.id,
      userId: user.id,
      personaId: persona.id,
      step: 'plano_teste_pix_intro',
      content: intro,
      metadata: { buttons },
      enviar: () => sendWhatsAppButtons(sendId, phone, intro, buttons),
    })

    if (pixQrUrl && typeof sendWhatsAppImageLink === 'function') {
      await salvarSaidaEEnviar({
        prisma,
        store: 'onboarding',
        conversationId: conv.id,
        userId: user.id,
        personaId: persona.id,
        step: 'plano_teste_pix_qrcode',
        content: pixQrUrl,
        enviar: () => sendWhatsAppImageLink(sendId, phone, pixQrUrl, 'QR Code do PIX'),
      })
    }

    const code = (pix.copiaECola || '').toString().trim()
    if (code) {
      await salvarSaidaEEnviar({
        prisma,
        store: 'onboarding',
        conversationId: conv.id,
        userId: user.id,
        personaId: persona.id,
        step: 'plano_teste_pix_code',
        content: code,
        enviar: () => sendWhatsAppText(sendId, phone, code),
      })
    }
    return true
  }

  if (reply && reply.startsWith('cmd_') && reply !== 'cmd_consulta_plano') {
    const txt = 'Esse comando ainda está em desenvolvimento. Em breve eu libero essa opção aqui no menu.'
    await salvarSaidaEEnviar({
      prisma,
      store: 'onboarding',
      conversationId: conv.id,
      userId: user.id,
      personaId: persona.id,
      step: `commands_${reply}`,
      content: txt,
      enviar: () => sendWhatsAppText(sendId, phone, txt),
    })
    return true
  }

  if (reply === 'cmd_consulta_plano') {
    const now = new Date()
    const allowance = await checkSubscriptionAllowance(prisma, user.id)
    const activeSub = await getActiveSubscription(prisma, user.id)

    let txt = ''
    if (allowance?.sub?.plan) {
      const limit = Number(allowance.limit || 0) || 0
      const used = Number(allowance.used || 0) || 0
      const remaining = Math.max(0, limit - used)

      const primaryPlan =
        (await prisma.subscription.findMany({
          where: { userId: user.id, status: 'active', currentPeriodEnd: { gt: now }, currentPeriodStart: { lte: now } },
          include: { plan: true },
          orderBy: { currentPeriodEnd: 'desc' },
        }))
          .map((s) => s?.plan ? ({ sub: s, plan: s.plan }) : null)
          .filter(Boolean)
          .map((x) => x)
          .find((x) => x.plan.active)
        || (activeSub?.plan ? { sub: activeSub, plan: activeSub.plan } : null)
        || { sub: allowance.sub, plan: allowance.sub.plan }

      const planName = (primaryPlan?.plan?.name || allowance.sub.plan.name || 'Plano').toString()
      const start = primaryPlan?.sub?.currentPeriodStart || allowance.sub.currentPeriodStart
      const end = primaryPlan?.sub?.currentPeriodEnd || allowance.sub.currentPeriodEnd
      const cycleStart = formatarDataHoraPtBr(start)
      const cycleEnd = formatarDataHoraPtBr(end)
      const msgsPerCycle = Number(primaryPlan?.plan?.messagesPerCycle || allowance.sub.plan.messagesPerCycle || 0) || 0
      const personasAllowed = 1
      const audioEnabled = Boolean(primaryPlan?.plan?.audioEnabled || allowance.sub.plan.audioEnabled)

      txt =
        `Consulta do plano\n\n` +
        `Saldo de mensagens: ${remaining}/${limit}\n` +
        `Usadas no ciclo: ${used}\n\n` +
        `Plano atual: ${planName}\n` +
        `Mensagens por ciclo: ${msgsPerCycle}\n` +
        `Crush(es) permitida(s): ${personasAllowed}\n` +
        `Áudio: ${audioEnabled ? 'Liberado' : 'Não incluso'}\n\n` +
        `Aquisição (início do ciclo): ${cycleStart || '—'}\n` +
        `Expiração (fim do ciclo): ${cycleEnd || '—'}`
    } else {
      const trialLimit = Number(user.trialLimit || 10) || 10
      const trialUsed = Number(user.trialUsedCount || 0) || 0
      const trialRemaining = Math.max(0, trialLimit - trialUsed)
      const active = await hasActiveSubscription(prisma, user.id)
      txt =
        'Consulta do plano\n\n' +
        (active
          ? 'Encontrei uma assinatura ativa, mas não consegui carregar os detalhes do plano agora.\n'
          : `Você está no modo teste.\n\nSaldo de mensagens: ${trialRemaining}/${trialLimit}\nUsadas no teste: ${trialUsed}`)
    }

    await salvarSaidaEEnviar({
      prisma,
      store: 'onboarding',
      conversationId: conv.id,
      userId: user.id,
      personaId: persona.id,
      step: 'commands_consulta_plano',
      content: txt,
      enviar: () => sendWhatsAppText(sendId, phone, txt),
    })
    return true
  }

  return false
}
