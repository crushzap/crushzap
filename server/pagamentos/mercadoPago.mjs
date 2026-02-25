import crypto from 'node:crypto'
import { gerarBase64QrCodePix } from './pix-qrcode.mjs'

function normalizarTexto(s) {
  return (s || '').toString().trim().toLowerCase()
}

function getCycleDaysForPlan(planName, env) {
  const n = normalizarTexto(planName)
  if (n.includes('semanal')) return Number(env.SUBSCRIPTION_CYCLE_DAYS_SEMANAL || 7)
  if (n.includes('mensal')) return Number(env.SUBSCRIPTION_CYCLE_DAYS_MENSAL || 30)
  return Number(env.SUBSCRIPTION_CYCLE_DAYS || 30)
}

let econixTokenCache = { token: null, expiresAt: 0, base: null }

function getEconixBase(env) {
  const base = (env.ECONIX_API_BASE_URL || env.ECONIX_API_BASE || env.ECONIX_BASE_URL || 'https://api.econixhub.com').toString().trim()
  return base.replace(/\/+$/, '')
}

function getEconixBases(env) {
  const primary = getEconixBase(env)
  const fallback = 'https://api.econixhub.com'
  const bases = [primary, fallback].map((b) => b.replace(/\/+$/, '')).filter(Boolean)
  return Array.from(new Set(bases))
}

function gerarNumeroAleatorio(digits) {
  let out = ''
  for (let i = 0; i < digits; i += 1) out += Math.floor(Math.random() * 10).toString()
  return out
}

function gerarCpfAleatorio() {
  const nums = []
  for (let i = 0; i < 9; i += 1) nums.push(Math.floor(Math.random() * 10))
  let soma = 0
  for (let i = 0; i < 9; i += 1) soma += nums[i] * (10 - i)
  let resto = (soma * 10) % 11
  if (resto === 10) resto = 0
  nums.push(resto)
  soma = 0
  for (let i = 0; i < 10; i += 1) soma += nums[i] * (11 - i)
  resto = (soma * 10) % 11
  if (resto === 10) resto = 0
  nums.push(resto)
  return nums.join('')
}

function gerarNomeAleatorio() {
  const nomes = ['Ana', 'Beatriz', 'Camila', 'Fernanda', 'Isabela', 'Juliana', 'Larissa', 'Mariana', 'Natalia', 'Patricia']
  const sobrenomes = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Lima', 'Pereira', 'Costa', 'Ferreira', 'Almeida', 'Gomes']
  const nome = nomes[Math.floor(Math.random() * nomes.length)]
  const sobrenome = sobrenomes[Math.floor(Math.random() * sobrenomes.length)]
  return `${nome} ${sobrenome}`
}

async function getEconixToken({ env, fetchImpl }) {
  const now = Date.now()
  const bases = getEconixBases(env)
  if (econixTokenCache.token && econixTokenCache.expiresAt > now + 10000 && econixTokenCache.base && bases.includes(econixTokenCache.base)) {
    return { token: econixTokenCache.token, base: econixTokenCache.base }
  }
  const clientId = (env.ECONIX_CLIENT_ID || '').toString().trim()
  const clientSecret = (env.ECONIX_CLIENT_SECRET || '').toString().trim()
  if (!clientId || !clientSecret) throw new Error('Gateway não configurado')
  let lastError = null
  for (const base of bases) {
    let loginRes = null
    const startedAt = Date.now()
    try {
      loginRes = await fetchImpl(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
      })
    } catch (e) {
      lastError = e
      console.error('[ECONIX PAY] erro de rede no login', { base, error: e?.message || String(e) })
      continue
    } finally {
      const ms = Date.now() - startedAt
      if (ms > 1000) {
        try { console.log('[ECONIX PAY] login tempo', { ms, base }) } catch {}
      }
    }
    if (!loginRes.ok) {
      const txt = await loginRes.text().catch(() => '')
      console.error('[ECONIX PAY] login falhou', { base, status: loginRes.status, body: txt })
      lastError = new Error(`Falha na autenticação ECONIX: ${txt || loginRes.status}`)
      continue
    }
    const loginData = await loginRes.json()
    const token = (loginData?.token || '').toString().trim()
    if (!token) {
      console.error('[ECONIX PAY] token ausente', { base, keys: Object.keys(loginData || {}) })
      lastError = new Error('Token ECONIX ausente')
      continue
    }
    econixTokenCache = { token, expiresAt: now + 9 * 60 * 1000, base }
    return { token, base }
  }
  throw lastError || new Error('Falha na autenticação ECONIX')
}

async function createPixPaymentEconix({ value, md, userPhone, payerEmail, payerName, env, fetchImpl }) {
  const { token, base } = await getEconixToken({ env, fetchImpl })
  const safePhone = (userPhone || '').toString().replace(/[^\d]/g, '') || gerarNumeroAleatorio(11)
  const email = `${safePhone}@gmail.com`
  const name = (payerName || '').toString().trim() || gerarNomeAleatorio()
  const enc = Buffer.from(JSON.stringify(md || {})).toString('base64url')
  const externalId = `cz:${enc}`
  const baseRaw = (env.WEBHOOK_BASE_URL || env.WHATSAPP_URL_WEBHOOK_BASE || '').toString().trim()
  const baseWebhook = baseRaw.replace(/\/api\/?$/i, '').replace(/\/$/, '')
  const clientCallbackUrl = (env.ECONIX_CALLBACK_URL || (baseWebhook ? `${baseWebhook}/api/webhook/pagamentos` : '')).toString().trim()
  const document = (env.ECONIX_PAYER_DOCUMENT || '').toString().trim() || gerarCpfAleatorio()
  const payload = {
    amount: Number(value),
    external_id: externalId,
    ...(clientCallbackUrl ? { clientCallbackUrl } : {}),
    payer: {
      name,
      email,
      document,
    },
  }
  let depRes = null
  const startedAt = Date.now()
  try {
    depRes = await fetchImpl(`${base}/api/payments/deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    console.error('[ECONIX PAY] erro de rede no depósito', { base, error: e?.message || String(e) })
    throw e
  } finally {
    const ms = Date.now() - startedAt
    if (ms > 1000) {
      try { console.log('[ECONIX PAY] depósito tempo', { ms }) } catch {}
    }
  }
  if (!depRes.ok) {
    const txt = await depRes.text().catch(() => '')
    console.error('[ECONIX PAY] depósito falhou', { status: depRes.status, body: txt })
    throw new Error(`Falha ao criar PIX na ECONIX: ${txt || depRes.status}`)
  }
  const dep = await depRes.json()
  const qr = dep?.qrCodeResponse?.qrcode || ''
  const txId = dep?.qrCodeResponse?.transactionId?.toString() || externalId
  if (!qr) {
    console.error('[ECONIX PAY] resposta sem qrcode', { keys: Object.keys(dep || {}) })
    throw new Error('ECONIX não retornou qrcode')
  }
  const qrBase64 = await gerarBase64QrCodePix({ copiaECola: qr })
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
  return {
    checkoutId: txId,
    qrCodeBase64: qrBase64 || undefined,
    copiaECola: qr,
    expiresAt,
  }
}

async function createPixPaymentMercadoPago({ value, type, planId, action, credits, userPhone, phoneNumberId, payerEmail, payerName, source, ctwaClid, env, fetchImpl }) {
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
    source: source || null,
    ctwa_clid: (ctwaClid || '').toString().trim() || null,
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

export async function createPixPayment({ prisma, type, planId, amount, action, credits, userPhone, phoneNumberId, payerEmail, payerName, source, ctwaClid, env = process.env, fetchImpl = fetch }) {
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

  try {
    const md = {
      type,
      planId: planId || null,
      action: action || null,
      credits: typeof credits === 'number' ? credits : (credits ? Number(credits) : null),
      userPhone: userPhone || null,
      phoneNumberId: phoneNumberId || null,
      source: source || null,
      ctwaClid: (ctwaClid || '').toString().trim() || null,
    }
    return await createPixPaymentEconix({ value, md, userPhone, payerEmail, payerName, env, fetchImpl })
  } catch (e) {
    try { console.warn('[ECONIX PAY] erro, aplicando fallback para Mercado Pago:', e?.message || String(e)) } catch {}
  }

  return await createPixPaymentMercadoPago({ value, type, planId, action, credits, userPhone, phoneNumberId, payerEmail, payerName, source, ctwaClid, env, fetchImpl })
}

function parseEconixExternalId(raw) {
  const s = (raw || '').toString().trim()
  if (!s.startsWith('cz:')) return null
  const b64 = s.slice(3)
  try {
    const json = Buffer.from(b64, 'base64url').toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

async function applyPaymentApproval({ prisma, ensureUserByPhone, paymentId, status, md, amount, currency, rawPayment, env }) {
  try {
    const alreadyProcessed = await prisma.paymentHistory.findUnique({ where: { paymentId: paymentId.toString() } })
    if (alreadyProcessed) {
      return { ok: true, paymentId: paymentId.toString() }
    }
  } catch (e) {
    try { console.warn('[Pagamento] PaymentHistory check failed, skipping idempotency check:', e.message) } catch {}
  }

  const mdType = (md?.type ?? '').toString()
  const mdPlanId = (md?.planId ?? md?.plan_id ?? '').toString()
  const mdAction = (md?.action ?? '').toString()
  const mdCredits = Number(md?.credits || 0) || 0
  const mdUserPhone = (md?.userPhone ?? md?.user_phone ?? '').toString()
  const mdPhoneNumberId = (md?.phoneNumberId ?? md?.phone_number_id ?? '').toString()
  const mdSource = (md?.source ?? '').toString()
  const mdCtwaClid = (md?.ctwaClid ?? md?.ctwa_clid ?? '').toString()

  const recordHistory = async (tx) => {
    await tx.paymentHistory.create({
      data: {
        paymentId: paymentId.toString(),
        status: status,
        type: mdType || 'unknown',
        amount: Number(amount || 0),
        metadata: rawPayment || { metadata: md },
      },
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
          amount: Number(amount || 0) || 0,
          currency: (currency || 'BRL').toString(),
          source: mdSource || null,
          ctwaClid: mdCtwaClid || null,
          phoneNumberId: mdPhoneNumberId || null,
        }
      } catch (e) {
        if (e.code === 'P2002') {
           return { ok: true, paymentId: paymentId.toString() }
        }
        throw e
      }
    }
  }

  if (mdType === 'avulso' && mdAction.startsWith('pacote_fotos_') && mdUserPhone) {
    const user = await ensureUserByPhone(mdUserPhone)
    let primary = await prisma.subscription.findFirst({
      where: { userId: user.id, status: 'active' },
      orderBy: { currentPeriodEnd: 'desc' },
    })
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
          amount: Number(amount || 0) || 0,
          currency: (currency || 'BRL').toString(),
          source: mdSource || null,
          ctwaClid: mdCtwaClid || null,
          phoneNumberId: mdPhoneNumberId || null,
        }
      } catch (e) {
        if (e.code === 'P2002') {
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
    const price = Number(amount || 0) || 0
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
        amount: Number(amount || 0) || 0,
        currency: (currency || 'BRL').toString(),
        source: mdSource || null,
        ctwaClid: mdCtwaClid || null,
        phoneNumberId: mdPhoneNumberId || null,
      }
    } catch (e) {
      if (e.code === 'P2002') {
         return { ok: true, paymentId: paymentId.toString() }
      }
      throw e
    }
  }

  return { ok: true, paymentId: paymentId.toString() }
}

export async function processEconixWebhook({ prisma, ensureUserByPhone, body, env = process.env }) {
  const hasSignal =
    Boolean(body?.external_id || body?.externalId || body?.transactionId || body?.transaction_id)
  if (!hasSignal) return { handled: false }
  const paymentId = (body?.transactionId || body?.transaction_id || body?.external_id || body?.externalId || '').toString().trim() || crypto.randomUUID()
  const statusRaw = (body?.status || body?.paymentStatus || body?.transactionStatus || '').toString().trim().toUpperCase()
  const amount = Number(body?.amount || body?.value || 0) || 0
  const currency = (body?.currency || body?.currency_id || 'BRL').toString()
  try {
    console.log('[ECONIX PAY] callback recebido', {
      paymentId,
      status: statusRaw || null,
      hasExternalId: Boolean(body?.external_id || body?.externalId),
      keys: Object.keys(body || {}).slice(0, 20),
    })
  } catch {}
  if (!(statusRaw === 'PAID' || statusRaw === 'APPROVED' || statusRaw === 'CONFIRMED' || statusRaw === 'SUCCESS')) {
    return { handled: true, ok: true, paymentId }
  }
  const externalId = (body?.external_id || body?.externalId || '').toString().trim()
  const parsed = parseEconixExternalId(externalId) || {}
  const md = { ...(body?.metadata || body?.meta || {}), ...parsed }
  const result = await applyPaymentApproval({ prisma, ensureUserByPhone, paymentId, status: 'approved', md, amount, currency, rawPayment: body, env })
  return { handled: true, ...result }
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
  const mdSource = (md?.source ?? '').toString()
  const mdCtwaClid = (md?.ctwaClid ?? md?.ctwa_clid ?? '').toString()

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
            amount: Number(pay?.transaction_amount || 0) || 0,
            currency: (pay?.currency_id || 'BRL').toString(),
            source: mdSource || null,
            ctwaClid: mdCtwaClid || null,
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
            amount: Number(pay?.transaction_amount || 0) || 0,
            currency: (pay?.currency_id || 'BRL').toString(),
            source: mdSource || null,
            ctwaClid: mdCtwaClid || null,
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
          amount: Number(pay?.transaction_amount || 0) || 0,
          currency: (pay?.currency_id || 'BRL').toString(),
          source: mdSource || null,
          ctwaClid: mdCtwaClid || null,
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
