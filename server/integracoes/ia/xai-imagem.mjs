function withTimeout(promise, timeoutMs) {
  const ms = Number.isFinite(Number(timeoutMs)) ? Number(timeoutMs) : 0
  if (!ms || ms <= 0) return promise
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout ao gerar imagem')), ms)),
  ])
}

export async function gerarImagemXai({ prompt, timeoutMs }) {
  const apiKey = (process.env.XAI_API_KEY || process.env.GROK_API_KEY || '').toString().trim()
  if (!apiKey) return { ok: false, error: 'XAI_API_KEY não configurado' }
  const model = (process.env.XAI_IMAGE_MODEL || 'grok-2-image').toString().trim()

  try {
    const res = await withTimeout(
      fetch('https://api.x.ai/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          prompt,
          n: 1
        }),
      }),
      timeoutMs,
    )

    const body = await res.text()
    if (!res.ok) {
      try {
        const err = JSON.parse(body)
        const msg = err?.error?.message || err?.message || body || 'Falha ao gerar imagem na xAI'
        return { ok: false, error: `[xAI ${res.status}] ${msg}` }
      } catch {
        const snippet = (body || '').toString().slice(0, 900)
        return { ok: false, error: `[xAI ${res.status}] ${snippet || 'Falha ao gerar imagem na xAI'}` }
      }
    }

    const parsed = JSON.parse(body)
    const item = parsed?.data?.[0]
    const revisedPrompt = (item?.revised_prompt || '').toString().trim()
    if (item?.b64_json) {
      const b64Raw = item.b64_json
      const b64 = String(b64Raw).includes('base64,') ? String(b64Raw).split('base64,').pop() : String(b64Raw)
      const bytes = Buffer.from(b64, 'base64')
      const mimeType =
        String(b64Raw).includes('data:image/jpeg') ? 'image/jpeg'
          : String(b64Raw).includes('data:image/jpg') ? 'image/jpeg'
            : String(b64Raw).includes('data:image/webp') ? 'image/webp'
              : String(b64Raw).includes('data:image/png') ? 'image/png'
                : 'image/jpeg'
      return { ok: true, bytes, mimeType, model, revisedPrompt }
    }
    if (item?.url) {
      const imgRes = await withTimeout(fetch(String(item.url)), timeoutMs)
      if (!imgRes.ok) return { ok: false, error: `[xAI fetch] ${imgRes.status} ao baixar imagem por URL` }
      const arr = await imgRes.arrayBuffer()
      const bytes = Buffer.from(arr)
      const ct = (imgRes.headers.get('content-type') || 'image/jpeg').toString()
      return { ok: true, bytes, mimeType: ct, model, revisedPrompt }
    }
    return { ok: false, error: 'Resposta da xAI sem b64_json nem url' }
  } catch (e) {
    return { ok: false, error: (e?.message || 'Falha ao gerar imagem na xAI').toString() }
  }
}
