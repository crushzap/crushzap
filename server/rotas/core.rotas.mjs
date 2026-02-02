import express from 'express'

export function createCoreRouter() {
  const router = express.Router()
  router.get('/api/health', (_req, res) => {
    res.json({ ok: true, name: process.env.CRUSHZAP_APP_NAME || 'CrushZap' })
  })
  return router
}

