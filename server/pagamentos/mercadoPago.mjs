import crypto from 'node:crypto'

function normalizarTexto(s) {
  return (s || '').toString().trim().toLowerCase()
}

function getCycleDaysForPlan(planName, env) {
  const n = normalizarTexto(planName)
  if (n.includes('semanal')) return Number(env.SUBSCRIPTION_CYCLE_DAYS_SEMANAL || 7)
  if (n.includes('mensal')) return Number(env.SUBSCRIPTION_CYCLE_DAYS_MENSAL || 30)
  return Number(env.SUBSCRIPTION_CYCLE_DAYS || 30)
}

export async function createPixPayment({ prisma, type, planId, amount, action, credits, userPhone, phoneNumberId, payerEmail, payerName, env = process.env, fetchImpl = fetch }) {
  if (!type || !['assinatura', 'avulso'].includes(type)) {
    throw new Error('Tipo inválido')
  }

  let value = Number(amount) || 0
  if (type === 'assinatura') {
    if (!planId) throw new Error('planId obrigatório')
    const plan = await prisma.plan.findUnique({ where: { id: planId } })
    if (!plan) throw new Error('Plano não encontrado')
    value = Number(plan.price)
  } else {
    const a = (action || '').toString().trim()
    if (!a) throw new Error('action obrigatório')
    if (!value || value <= 0) throw new Error('amount inválido')
  }

  const token = env.MERCADO_PAGO_ACCESS_TOKEN
  if (!token) throw new Error('Gateway não configurado')

  const description =
    type === 'assinatura'
      ? 'Assinatura CrushZap'
      : ((action || '').toString().trim() === 'creditos_100'
          ? 'Créditos avulsos (100 mensagens) - CrushZap'
          : 'Acesso avulso CrushZap')
  const metadata = {
    type,
    plan_id: planId || null,
    action: action || null,
    credits: typeof credits === 'number' ? credits : (credits ? Number(credits) : null),
    user_phone: userPhone || null,
    phone_number_id: phoneNumberId || null,
  }
  const baseRaw = (env.WEBHOOK_BASE_URL || env.WHATSAPP_URL_WEBHOOK_BASE || '').toString().trim()
  const base = baseRaw.replace(/\/api\/?$/i, '').replace(/\/$/, '')
  const notificationUrl = base ? `${base}/api/webhook/pagamentos` : undefined
  const safePhone = (userPhone || '').toString().replace(/[^\d]/g, '') || 'cliente'
  const email = (payerEmail || '').toString().trim() || `${safePhone}@crushzap.com.br`
  const payer = { email }
  const idempotencyKey = crypto.randomUUID()

  const resp = await fetchImpl('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotencyKey,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      transaction_amount: value,
      description,
      payment_method_id: 'pix',
      payer: payerName ? { ...payer, first_name: payerName } : payer,
      metadata,
      notification_url: notificationUrl,
    }),
  })

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '')
    console.error('[MercadoPago Error]', errBody)
    throw new Error('Falha ao criar PIX no gateway')
  }

  const data = await resp.json()
  const tr = data?.point_of_interaction?.transaction_data || {}
  const expiresAt = data?.date_of_expiration || new Date(Date.now() + 30 * 60 * 1000).toISOString()

  return {
    checkoutId: data?.id?.toString() || 'pix',
    qrCodeBase64: tr?.qr_code_base64 || undefined,
    copiaECola: tr?.qr_code || 'Copia e cola indisponível',
    expiresAt,
  }
}

export async function processMercadoPagoWebhook({ prisma, ensureUserByPhone, body, env = process.env, fetchImpl = fetch }) {
  const token = env.MERCADO_PAGO_ACCESS_TOKEN
  if (!token) throw new Error('Gateway não configurado')

  try {
    const keys = body && typeof body === 'object' ? Object.keys(body).slice(0, 20) : []
    console.log('[MercadoPago Webhook] received', { keys })
  } catch {}

  let paymentId = body?.data?.id || body?.id || null
  let resourceUrl = body?.resource || null

  if (!paymentId && resourceUrl) {
    try {
      const r = resourceUrl.toString()
      if (/^https?:\/\//i.test(r)) {
        const u = new URL(r)
        const parts = u.pathname.split('/')
        paymentId = parts[parts.length - 1]
      } else {
        const parts = r.split('?')[0].split('/')
        paymentId = parts[parts.length - 1]
      }
    } catch {}
  }

  if (!paymentId) {
    console.log('[MercadoPago Webhook] ignore: missing paymentId')
    return { ok: true, paymentId: null }
  }

  const resp = await fetchImpl(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) return { ok: true, paymentId: paymentId.toString() }

  const pay = await resp.json()
  const status = pay?.status
  const md = pay?.metadata || {}
  try {
    console.log('[MercadoPago Webhook] payment', { paymentId: paymentId.toString(), status: status || null, type: md?.type || null })
  } catch {}

  if (status === 'approved') {
    // Verifica idempotência usando PaymentHistory
    try {
      const alreadyProcessed = await prisma.paymentHistory.findUnique({ where: { paymentId: paymentId.toString() } })
      if (alreadyProcessed) {
        console.log(`[MercadoPago] Payment ${paymentId} already processed (idempotency check).`)
        return { ok: true, paymentId: paymentId.toString() }
      }
    } catch (e) {
      // Se a tabela não existir ainda (antes do db push), apenas loga erro e continua (fallback)
      console.warn('[MercadoPago] PaymentHistory table check failed, skipping idempotency check:', e.message)
    }

    const mdType = (md?.type ?? '').toString()
    const mdPlanId = (md?.planId ?? md?.plan_id ?? '').toString()
    const mdAction = (md?.action ?? '').toString()
    const mdCredits = Number(md?.credits || 0) || 0
    const mdUserPhone = (md?.userPhone ?? md?.user_phone ?? '').toString()
    const mdPhoneNumberId = (md?.phoneNumberId ?? md?.phone_number_id ?? '').toString()

    // Função auxiliar para registrar histórico
    const recordHistory = async (tx) => {
      // Se falhar (ex: unique constraint), o erro deve propagar para abortar a transação
      await tx.paymentHistory.create({
        data: {
          paymentId: paymentId.toString(),
          status: status,
          type: mdType || 'unknown',
          amount: Number(pay?.transaction_amount || 0),
          metadata: pay
        }
      })
    }

    if (mdType === 'assinatura' && mdPlanId && mdUserPhone) {
      const user = await ensureUserByPhone(mdUserPhone)
      const plan = await prisma.plan.findUnique({ where: { id: mdPlanId } })
      if (plan) {
        const now = new Date()
        const cycleDays = getCycleDaysForPlan(plan.name, env)
        const end = new Date(now.getTime() + cycleDays * 24 * 60 * 60 * 1000)
        try {
          await prisma.$transaction(async (tx) => {
            await recordHistory(tx)
            await tx.subscription.updateMany({ where: { userId: user.id, status: 'active' }, data: { status: 'expired' } })
            await tx.subscription.create({ data: { userId: user.id, planId: plan.id, status: 'active', currentPeriodStart: now, currentPeriodEnd: end } })
            if (user.status !== 'active') {
              await tx.user.update({ where: { id: user.id }, data: { status: 'active' } })
            }
          })
          return {
            ok: true,
            paymentId: paymentId.toString(),
            event: { type: 'assinatura_aprovada', userPhone: mdUserPhone, planName: plan.name, cycleDays, action: mdAction || null },
            phoneNumberId: mdPhoneNumberId || null,
          }
        } catch (e) {
          if (e.code === 'P2002') {
             console.log(`[MercadoPago] Payment ${paymentId} already processed (transaction race condition).`)
             return { ok: true, paymentId: paymentId.toString() }
          }
          throw e
        }
      }
    }

    if (mdType === 'avulso' && mdAction.startsWith('pacote_fotos_') && mdUserPhone) {
      const user = await ensureUserByPhone(mdUserPhone)
      
      // Tenta encontrar assinatura ativa primeiro
      let primary = await prisma.subscription.findFirst({
        where: { userId: user.id, status: 'active' },
        orderBy: { currentPeriodEnd: 'desc' },
      })

      // Se não tiver ativa, pega a última criada (mesmo expirada) para creditar
      if (!primary) {
        primary = await prisma.subscription.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
        })
      }

      const count = Number(mdAction.replace('pacote_fotos_', '')) || 0

      if (primary && count > 0) {
        try {
          await prisma.$transaction(async (tx) => {
            await recordHistory(tx)
            await tx.subscription.update({
              where: { id: primary.id },
              data: { extraImagesCount: { increment: count } },
            })
          })
          return {
            ok: true,
            paymentId: paymentId.toString(),
            event: { type: 'pacote_fotos_aprovado', userPhone: mdUserPhone, count },
            phoneNumberId: mdPhoneNumberId || null,
          }
        } catch (e) {
          if (e.code === 'P2002') {
             console.log(`[MercadoPago] Payment ${paymentId} already processed (transaction race condition).`)
             return { ok: true, paymentId: paymentId.toString() }
          }
          throw e
        }
      }
    }

    if (mdType === 'avulso' && mdAction === 'creditos_100' && mdUserPhone) {
      const user = await ensureUserByPhone(mdUserPhone)
      const now = new Date()
      const primary = await prisma.subscription.findFirst({
        where: { userId: user.id, status: 'active', currentPeriodEnd: { gt: now } },
        orderBy: { currentPeriodEnd: 'desc' },
        include: { plan: true },
      })
      if (!primary?.plan) return { ok: true, paymentId: paymentId.toString() }

      const credits = mdCredits > 0 ? mdCredits : 100
      const planName = `Créditos ${credits} mensagens`
      const price = Number(pay?.transaction_amount || 0) || 0
      
      try {
        await prisma.$transaction(async (tx) => {
          await recordHistory(tx)
          const creditPlan =
            (await tx.plan.findUnique({ where: { name: planName } }))
            || (await tx.plan.create({
              data: {
                name: planName,
                price: price,
                currency: (primary.plan.currency || 'BRL').toString(),
                messagesPerCycle: credits,
                personasAllowed: 0,
                audioEnabled: false,
                active: false,
              },
            }))

          await tx.subscription.create({
            data: {
              userId: user.id,
              planId: creditPlan.id,
              status: 'active',
              currentPeriodStart: primary.currentPeriodStart,
              currentPeriodEnd: primary.currentPeriodEnd,
            },
          })
        })

        return {
          ok: true,
          paymentId: paymentId.toString(),
          event: { type: 'creditos_aprovados', userPhone: mdUserPhone, credits },
          phoneNumberId: mdPhoneNumberId || null,
        }
      } catch (e) {
        if (e.code === 'P2002') {
           console.log(`[MercadoPago] Payment ${paymentId} already processed (transaction race condition).`)
           return { ok: true, paymentId: paymentId.toString() }
        }
        throw e
      }
    }
  }

  return { ok: true, paymentId: paymentId.toString() }
}
