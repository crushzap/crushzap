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

export async function gerarImagemRunComfy({ prompt, negativePrompt, aspectRatio = '2:3', steps = 32, cfg = 3, refs = [], poseType }) {
  const base = readEnvStr('RUNCOMFY_API_BASE', '')
  const apiKey = readEnvStr('RUNCOMFY_API_KEY', '')
  const workflowId = readEnvStr('RUNCOMFY_WORKFLOW_ID', '')
  const timeoutMs = readEnvInt('RUNCOMFY_TIMEOUT_MS', 60000)
  if (!base) return { ok: false, error: 'RUNCOMFY_API_BASE não configurado' }

  const stepsEnv = readEnvInt('COMFYUI_STEPS', 32)
  const cfgEnv = readEnvInt('COMFYUI_CFG', 3)
  const stepsVal = Number.isFinite(Number(steps)) ? Number(steps) : stepsEnv
  const cfgVal = Number.isFinite(Number(cfg)) ? Number(cfg) : cfgEnv

  const inputs = {
    prompt: String(prompt || ''),
    negative_prompt: String(negativePrompt || ''),
    aspect_ratio: String(aspectRatio || '2:3'),
    steps: stepsVal,
    cfg: cfgVal,
    refs: Array.isArray(refs) ? refs : [],
    poseType: String(poseType || ''),
  }

  const payload = {
    workflow_id: workflowId,
    inputs,
    input: inputs,
  }

  const controller = new AbortController()
  const to = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(to)
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return { ok: false, error: `RunComfy ${res.status}: ${txt || 'Falha ao enfileirar'}` }
    }
    const data = await res.json().catch(() => ({}))
    if (Array.isArray(data?.images) && data.images.length) {
      const first = data.images[0]
      const url = typeof first === 'string' ? first : (first?.url || '')
      if (url) return { ok: true, url, provider: 'runcomfy' }
    }
    const statusUrl = String(data?.status_url || '')
    if (!statusUrl) {
      return { ok: false, error: 'RunComfy sem status_url' }
    }
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const st = await fetch(statusUrl).catch(() => null)
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
        if (url) return { ok: true, url, provider: 'runcomfy' }
      }
      break
    }
    return { ok: false, error: 'RunComfy não retornou imagem' }
  } catch (e) {
    return { ok: false, error: (e?.message || 'Falha RunComfy').toString() }
  } finally {
    clearTimeout(to)
  }
}
