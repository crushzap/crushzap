function readEnvStr(name, def = '') {
  const v = (process.env[name] || '').toString().trim()
  return v || def
}

function readEnvInt(name, def) {
  const v = Number((process.env[name] || '').toString().trim())
  return Number.isFinite(v) ? v : def
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function gerarImagemComfyUI({ prompt, negativePrompt, aspectRatio = '2:3', steps = 32, cfg = 3, refs = [], poseType }) {
  const base = readEnvStr('COMFYUI_API_BASE', '')
  const timeoutMs = readEnvInt('COMFYUI_TIMEOUT_MS', 60000)
  const apiKey = readEnvStr('COMFYUI_API_KEY', '')
  if (!base) return { ok: false, error: 'COMFYUI_API_BASE não configurado' }

  const stepsEnv = readEnvInt('COMFYUI_STEPS', 32)
  const cfgEnv = readEnvInt('COMFYUI_CFG', 3)
  const stepsVal = Number.isFinite(Number(steps)) ? Number(steps) : stepsEnv
  const cfgVal = Number.isFinite(Number(cfg)) ? Number(cfg) : cfgEnv

  const payload = {
    prompt: String(prompt || ''),
    negative_prompt: String(negativePrompt || ''),
    aspect_ratio: String(aspectRatio || '2:3'),
    steps: stepsVal,
    cfg: cfgVal,
    refs: Array.isArray(refs) ? refs : [],
    poseType: String(poseType || ''),
  }

  const controller = new AbortController()
  const to = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Key ${apiKey}` } : {}) },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(to)
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return { ok: false, error: `ComfyUI ${res.status}: ${txt || 'Falha ao enfileirar'}` }
    }
    const data = await res.json().catch(() => ({}))
    if (Array.isArray(data?.images) && data.images.length) {
      const first = data.images[0]
      const url = typeof first === 'string' ? first : (first?.url || '')
      if (url) return { ok: true, url, provider: 'comfyui' }
    }
    const statusUrl = String(data?.status_url || '')
    const jobId = String(data?.job_id || '')
    if (!statusUrl && !jobId) {
      return { ok: false, error: 'ComfyUI sem status_url/job_id' }
    }
    // Poll genérico: status_url tem precedência
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const u = statusUrl ? statusUrl : `${base.replace(/\/+$/, '')}/status/${jobId}`
      const st = await fetch(u).catch(() => null)
      if (!st || !st.ok) {
        await sleep(1000)
        continue
      }
      const sj = await st.json().catch(() => ({}))
      const done = Boolean(sj?.done || sj?.status === 'done' || sj?.success === true)
      if (!done) {
        await sleep(1000)
        continue
      }
      const out = sj?.output || sj?.result || sj
      const imgs = out?.images || out?.outputs || []
      if (Array.isArray(imgs) && imgs.length) {
        const item = imgs[0]
        const url =
          typeof item === 'string'
            ? item
            : (item?.url || item?.image_url || '')
        if (url) return { ok: true, url, provider: 'comfyui' }
      }
      break
    }
    return { ok: false, error: 'ComfyUI não retornou imagem' }
  } catch (e) {
    return { ok: false, error: (e?.message || 'Falha ComfyUI').toString() }
  } finally {
    clearTimeout(to)
  }
}
