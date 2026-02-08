import express from 'express'

export function createMetaRouter() {
  const router = express.Router()

  router.get('/api/meta/config', (_req, res) => {
    const pixelId = (process.env.PIXEL_ID || '').toString().trim()
    res.json({ enabled: Boolean(pixelId), pixelId: pixelId || null })
  })

  return router
}
