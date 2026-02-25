import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { createPixPayment, processEconixWebhook, processMercadoPagoWebhook } from './pagamentos/mercadoPago.mjs'
import { startSubscriptionExpiryJob } from './assinaturas/controle.mjs'
import { createAdminRouter } from './rotas/admin.rotas.mjs'
import { createPagamentosRouter } from './rotas/pagamentos.rotas.mjs'
import { createWhatsAppRouter } from './rotas/whatsapp.rotas.mjs'
import { createAuthRouter } from './rotas/auth.rotas.mjs'
import { createCoreRouter } from './rotas/core.rotas.mjs'
import { createConversasRouter } from './rotas/conversas.rotas.mjs'
import { createMetaRouter } from './rotas/meta.rotas.mjs'
import { ensureConversation as ensureConversationBase, ensureDefaultPersona as ensureDefaultPersonaBase, ensureUserByPhone as ensureUserByPhoneBase } from './dominio/conversas/servico.mjs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ override: process.env.NODE_ENV !== 'production' })
const app = express()
const prisma = new PrismaClient()

function deriveSuperadminPhone(email) {
  try {
    const hex = crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex')
    const n = BigInt('0x' + hex.slice(0, 16)) % 10000000000n
    return `0${n.toString().padStart(10, '0')}`
  } catch {
    return '00000000000'
  }
}

async function ensureSuperadmin() {
  try {
    const name = (process.env.SUPERADMIN_NAME || '').toString().trim()
    const email = (process.env.SUPERADMIN_EMAIL || '').toString().trim()
    const password = (process.env.SUPERADMIN_PASSWORD || '').toString().trim()
    if (!email || !password) return
    const phone = (process.env.SUPERADMIN_PHONE || '').toString().trim() || deriveSuperadminPhone(email)
    const passwordHash = bcrypt.hashSync(password, 10)
    await prisma.user.upsert({
      where: { email },
      update: { name: name || null, role: 'superadmin', status: 'active', passwordHash },
      create: {
        name: name || null,
        email,
        phone,
        role: 'superadmin',
        status: 'active',
        trialLimit: Number(process.env.TRIAL_LIMIT_PER_ACCOUNT ?? 10),
        passwordHash,
      },
    })
  } catch (e) {
    console.error('[Superadmin] falha ao garantir credenciais', e?.message || String(e))
  }
}

await ensureSuperadmin()

const ensureUserByPhone = (phone) => ensureUserByPhoneBase(prisma, phone)
const ensureDefaultPersona = (userId) => ensureDefaultPersonaBase(prisma, userId)
const ensureConversation = (userId, personaId) => ensureConversationBase(prisma, userId, personaId)

app.use(cors({ origin: true }))

app.use((req, _res, next) => {
  const url = req.originalUrl || req.url
  const isWebhook = url.startsWith('/api/whatsapp/webhook') || url.startsWith('/api/webhook/whatsapp')
  if (isWebhook) {
    const forwardedFor = (req.headers['x-forwarded-for'] || '').toString()
    const ip = forwardedFor.split(',')[0]?.trim() || req.socket?.remoteAddress || ''
    const ua = (req.headers['user-agent'] || '').toString()
    const ct = (req.headers['content-type'] || '').toString()
    const cl = (req.headers['content-length'] || '').toString()
    console.log(`[HTTP] ${req.method} ${url} ip=${ip} ua="${ua}" ct="${ct}" cl=${cl}`)
  } else {
    console.log(`[HTTP] ${req.method} ${url}`)
  }
  next()
})

const jsonParser = express.json()
const webhookJsonParser = express.json({
  verify: (req, _res, buf) => {
    try {
      req.rawBody = buf?.toString('utf8') || ''
    } catch {
      req.rawBody = ''
    }
  }
})

app.use((req, res, next) => {
  const url = req.originalUrl || req.url
  const isWebhook = url.startsWith('/api/whatsapp/webhook') || url.startsWith('/api/webhook/whatsapp')
  if (isWebhook) return webhookJsonParser(req, res, next)
  return jsonParser(req, res, next)
})

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('[JSON Error]', err.message)
    const raw = (req?.rawBody || '').toString()
    if (raw) console.error('[JSON Error] rawBody_head', raw.slice(0, 800))
    return res.status(400).send({ error: 'Invalid JSON' })
  }
  next()
})

app.get('/api/whatsapp/ping', (req, res) => {
  res.status(200).json({ ok: true })
})
app.use(createCoreRouter())
app.use(createMetaRouter())
app.use(createAuthRouter({ prisma }))
app.use(createAdminRouter({ prisma }))
app.use(createPagamentosRouter({ prisma, createPixPayment, processEconixWebhook, processMercadoPagoWebhook, ensureUserByPhone, ensureDefaultPersona, ensureConversation }))
app.use(createWhatsAppRouter({ prisma }))
app.use(createConversasRouter({ prisma }))

// Servir arquivos estáticos do React (pasta dist na raiz do projeto)
// Assumindo que o server roda em /server/index.mjs e o build está em /dist
const distPath = path.join(__dirname, '../dist')
app.use(express.static(distPath))

// Rota catch-all para SPA (React)
// Qualquer requisição que não seja API será redirecionada para o index.html
// Nota: Express 5 não suporta mais '*' como wildcard string simples. Usando RegExp.
app.get(/.*/, (req, res) => {
  if (req.path.startsWith('/api')) {
    // Se for api e não encontrou rota, retorna 404 JSON
    return res.status(404).json({ error: 'Endpoint não encontrado' })
  }
  res.sendFile(path.join(distPath, 'index.html'))
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`[CrushZap API] Servindo em http://localhost:${PORT}`)
})

const retentionDays = Number(process.env.MESSAGE_RETENTION_DAYS || 60)
setInterval(async () => {
  try {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
    await prisma.message.deleteMany({ where: { createdAt: { lt: cutoff } } })
  } catch {}
}, 6 * 60 * 60 * 1000)

startSubscriptionExpiryJob(prisma)
