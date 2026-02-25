import { checkSubscriptionAllowance, getActiveSubscription, hasActiveSubscription } from '../../assinaturas/controle.mjs'
import { salvarSaidaEEnviar } from '../../dominio/mensagens/persistencia.mjs'

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
  const { prisma, typed, reply, sendId, phone, conv, user, persona, sendWhatsAppList, sendWhatsAppText } = ctx

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
