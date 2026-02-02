import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { createPixPayment, processMercadoPagoWebhook } from './pagamentos/mercadoPago.mjs'
import { startSubscriptionExpiryJob } from './assinaturas/controle.mjs'
import { createAdminRouter } from './rotas/admin.rotas.mjs'
import { createPagamentosRouter } from './rotas/pagamentos.rotas.mjs'
import { createWhatsAppRouter } from './rotas/whatsapp.rotas.mjs'
import { createAuthRouter } from './rotas/auth.rotas.mjs'
import { createCoreRouter } from './rotas/core.rotas.mjs'
import { createConversasRouter } from './rotas/conversas.rotas.mjs'
import { ensureConversation as ensureConversationBase, ensureDefaultPersona as ensureDefaultPersonaBase, ensureUserByPhone as ensureUserByPhoneBase } from './dominio/conversas/servico.mjs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ override: process.env.NODE_ENV !== 'production' })
const app = express()
const prisma = new PrismaClient()

const ensureUserByPhone = (phone) => ensureUserByPhoneBase(prisma, phone)
const ensureDefaultPersona = (userId) => ensureDefaultPersonaBase(prisma, userId)
const ensureConversation = (userId, personaId) => ensureConversationBase(prisma, userId, personaId)

app.use(cors({ origin: true }))
app.use(express.json())

// Logger básico para acompanhar chamadas ao webhook do WhatsApp
app.use('/api/whatsapp/webhook', (req, _res, next) => {
  try {
    console.log('[HTTP]', req.method, req.originalUrl)
  } catch {}
  next()
})
app.use(createCoreRouter())
app.use(createAuthRouter({ prisma }))
app.use(createAdminRouter({ prisma }))
app.use(createPagamentosRouter({ prisma, createPixPayment, processMercadoPagoWebhook, ensureUserByPhone, ensureDefaultPersona, ensureConversation }))
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
