const BETATESTER_MULTIPLIER = 3

async function isBetaTester(prisma, userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  return user?.role === 'betatester'
}

async function isSuperAdmin(prisma, userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  return user?.role === 'superadmin'
}

function buildUnlimitedPlan() {
  return {
    id: 'superadmin-ilimitado',
    name: 'Acesso ilimitado',
    price: 0,
    currency: 'BRL',
    messagesPerCycle: Number.MAX_SAFE_INTEGER,
    imagesPerCycle: Number.MAX_SAFE_INTEGER,
    personasAllowed: 1,
    audioEnabled: true,
    active: true,
  }
}

async function resolveBetaTesterPlan(prisma) {
  const plan = await prisma.plan.findFirst({
    where: { active: true, name: { contains: 'mensal', mode: 'insensitive' } },
    orderBy: { price: 'asc' },
  })
  if (plan) return plan
  return {
    id: 'betatester-mensal',
    name: 'Mensal',
    price: 29.9,
    currency: 'BRL',
    messagesPerCycle: 500,
    imagesPerCycle: 15,
    personasAllowed: 1,
    audioEnabled: true,
    active: true,
  }
}

function buildBetaTesterPlan(basePlan) {
  const name = `${(basePlan?.name || 'Mensal').toString().trim()} 3x`.trim()
  return {
    ...basePlan,
    name,
    messagesPerCycle: Number(basePlan?.messagesPerCycle || 0) * BETATESTER_MULTIPLIER,
    imagesPerCycle: Number(basePlan?.imagesPerCycle || 0) * BETATESTER_MULTIPLIER,
    personasAllowed: 1,
    audioEnabled: true,
  }
}

function getBetaTesterPeriod(now) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return { start, end }
}

export async function hasActiveSubscription(prisma, userId) {
  if (await isSuperAdmin(prisma, userId)) return true
  if (await isBetaTester(prisma, userId)) return true
  const now = new Date()
  const sub = await prisma.subscription.findFirst({ where: { userId, status: 'active', currentPeriodEnd: { gt: now } } })
  return Boolean(sub)
}

export async function getActiveSubscription(prisma, userId) {
  const now = new Date()
  return prisma.subscription.findFirst({
    where: { userId, status: 'active', currentPeriodEnd: { gt: now } },
    include: { plan: true },
    orderBy: { currentPeriodEnd: 'desc' },
  })
}

export async function checkSubscriptionAllowance(prisma, userId) {
  const now = new Date()
  const audioMultiplier = Math.max(1, parseInt((process.env.AUDIO_COST_MULTIPLIER || '10').toString(), 10) || 10)
  if (await isSuperAdmin(prisma, userId)) {
    const plan = buildUnlimitedPlan()
    const period = getBetaTesterPeriod(now)
    return {
      allowed: true,
      sub: { plan, currentPeriodStart: period.start, currentPeriodEnd: period.end },
      used: 0,
      usedMessages: 0,
      limit: plan.messagesPerCycle,
      audioMultiplier,
    }
  }
  if (await isBetaTester(prisma, userId)) {
    const basePlan = await resolveBetaTesterPlan(prisma)
    const plan = buildBetaTesterPlan(basePlan)
    const period = getBetaTesterPeriod(now)
    const out = await prisma.message.findMany({
      where: { userId, direction: 'out', createdAt: { gte: period.start, lt: period.end } },
      select: { type: true },
    })
    const usedMessages = Array.isArray(out) ? out.length : 0
    const used = (Array.isArray(out) ? out : []).reduce((sum, m) => sum + (m.type === 'audio' ? audioMultiplier : 1), 0)
    const limit = Number(plan.messagesPerCycle || 0) || 0
    const allowed = used < limit
    return {
      allowed,
      sub: { plan, currentPeriodStart: period.start, currentPeriodEnd: period.end },
      used,
      usedMessages,
      limit,
      audioMultiplier,
    }
  }
  const subs = await prisma.subscription.findMany({
    where: { userId, status: 'active', currentPeriodEnd: { gt: now }, currentPeriodStart: { lte: now } },
    include: { plan: true },
    orderBy: { currentPeriodEnd: 'desc' },
  })
  const primary = subs.find((s) => s?.plan) || null
  if (!primary?.plan) return { allowed: false, sub: null, used: 0, limit: 0 }

  const periodStart = primary.currentPeriodStart
  const periodEnd = primary.currentPeriodEnd
  const limit = subs
    .filter((s) => s?.plan && s.currentPeriodStart.getTime() === periodStart.getTime() && s.currentPeriodEnd.getTime() === periodEnd.getTime())
    .reduce((sum, s) => sum + (s.plan.messagesPerCycle || 0), 0)
  const out = await prisma.message.findMany({
    where: { userId, direction: 'out', createdAt: { gte: periodStart, lt: periodEnd } },
    select: { type: true },
  })
  const usedMessages = Array.isArray(out) ? out.length : 0
  const used = (Array.isArray(out) ? out : []).reduce((sum, m) => sum + (m.type === 'audio' ? audioMultiplier : 1), 0)
  const allowed = used < (limit || 0)
  return { allowed, sub: primary, used, usedMessages, limit, audioMultiplier }
}

export async function applyTrialConsumption(prisma, user, opts) {
  if (user?.role === 'superadmin') return { allowed: true, updated: user }
  if (user?.role === 'betatester') return { allowed: true, updated: user }
  if (await hasActiveSubscription(prisma, user.id)) return { allowed: true, updated: user }
  if (user.status === 'blocked') return { allowed: false, updated: user }
  const weight = Math.max(1, parseInt((opts && opts.weight != null ? opts.weight : 1).toString(), 10) || 1)
  const used = (user.trialUsedCount || 0) + weight
  const limit = user.trialLimit || 10
  const blocked = used >= limit
  const updated = await prisma.user.update({ where: { id: user.id }, data: { trialUsedCount: used, status: blocked ? 'blocked' : user.status } })
  return { allowed: !blocked, updated }
}

export async function checkImageAllowance(prisma, userId) {
  const now = new Date()
  if (await isSuperAdmin(prisma, userId)) {
    const plan = buildUnlimitedPlan()
    return { allowed: true, limit: plan.imagesPerCycle, used: 0, sub: { plan } }
  }
  if (await isBetaTester(prisma, userId)) {
    const sub = await prisma.subscription.findFirst({
      where: { userId, status: 'active', currentPeriodEnd: { gt: now } },
      include: { plan: true },
      orderBy: { currentPeriodEnd: 'desc' },
    })
    const basePlan = sub?.plan || await resolveBetaTesterPlan(prisma)
    const plan = buildBetaTesterPlan(basePlan)
    const extraLimit = sub?.extraImagesCount || 0
    const totalLimit = Number(plan.imagesPerCycle || 0) + extraLimit
    const used = sub?.imagesUsedCount || 0
    if (totalLimit <= 0) {
      return { allowed: false, reason: 'limit_exceeded', limit: totalLimit, used, sub }
    }
    if (used >= totalLimit) {
      return { allowed: false, reason: 'limit_exceeded', limit: totalLimit, used, sub }
    }
    return { allowed: true, limit: totalLimit, used, sub: sub || { plan } }
  }
  
  // 1. Busca assinatura ativa
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: 'active', currentPeriodEnd: { gt: now } },
    include: { plan: true },
    orderBy: { currentPeriodEnd: 'desc' }
  })

  // 2. Se não tem assinatura, é Trial -> Bloqueado para imagens NSFW
  if (!sub) {
    return { allowed: false, reason: 'trial', limit: 0, used: 0 }
  }

  // 3. Verifica limites
  const planLimit = sub.plan.imagesPerCycle || 0
  const extraLimit = sub.extraImagesCount || 0
  const totalLimit = planLimit + extraLimit
  const used = sub.imagesUsedCount || 0
  
  // FIX: Se o limite do plano for 0, deve ser tratado como sem limite? 
  // Não, conforme regra de negócio, planos tem limites rígidos (3 ou 15). 
  // Se veio 0 do banco, pode ser que o seed não rodou ou o plano foi criado errado.
  // Vamos assumir 0 = bloqueado.
  // LOG PARA DEBUG
  console.log('[checkImageAllowance]', { userId, planName: sub.plan.name, planLimit, extraLimit, used })

  if (used >= totalLimit) {
    return { allowed: false, reason: 'limit_exceeded', limit: totalLimit, used, sub }
  }

  return { allowed: true, limit: totalLimit, used, sub }
}

export async function consumeImageQuota(prisma, userId) {
  if (await isSuperAdmin(prisma, userId)) {
    return { ok: true, remaining: Number.MAX_SAFE_INTEGER }
  }
  const allowance = await checkImageAllowance(prisma, userId)
  if (!allowance.allowed) {
    throw new Error(`Quota exceeded or trial: ${allowance.reason}`)
  }

  const sub = allowance.sub
  if (!sub?.id) {
    return { ok: true, remaining: allowance.limit - allowance.used - 1 }
  }
  
  // Incrementa uso
  await prisma.subscription.update({
    where: { id: sub.id },
    data: { imagesUsedCount: { increment: 1 } }
  })

  return { ok: true, remaining: allowance.limit - allowance.used - 1 }
}

export function startSubscriptionExpiryJob(prisma, intervalMs = 24 * 60 * 60 * 1000) {
  return setInterval(async () => {
    try {
      const now = new Date()
      await prisma.subscription.updateMany({ where: { status: 'active', currentPeriodEnd: { lt: now } }, data: { status: 'expired' } })
    } catch {}
  }, intervalMs)
}
