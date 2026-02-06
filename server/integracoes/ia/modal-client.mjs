function readEnvStr(name, def = '') {
  const v = (process.env[name] || '').toString().trim()
  return v || def
}

function readEnvInt(name, def) {
  const v = Number((process.env[name] || '').toString().trim())
  return Number.isFinite(v) ? v : def
}

async function toBase64(input) {
  if (!input) return undefined
  if (typeof input !== 'string') return undefined
  const normalized = input.replace(/\\/g, '/')
  
  // Se for path local
  if (normalized.startsWith('/') || normalized.match(/^[a-z]:\//i) || normalized.startsWith('assets/')) {
    try {
      const fs = await import('fs/promises')
      const buf = await fs.readFile(normalized)
      return buf.toString('base64')
    } catch (e) {
      console.error('[ModalClient] Erro lendo arquivo local:', input, e)
      return undefined
    }
  }
  // Se for URL
  if (normalized.startsWith('http')) {
     try {
       const r = await fetch(normalized)
       if (!r.ok) return undefined
       const ab = await r.arrayBuffer()
       return Buffer.from(ab).toString('base64')
     } catch (e) {
       console.error('[ModalClient] Erro baixando URL:', input, e)
       return undefined
     }
  }
  // Se ja parecer base64 (sem headers de data uri)
  if (input.length > 100 && !input.includes('\n')) {
      return input
  }
  return undefined
}

export async function gerarImagemModal({ 
    prompt, negativePrompt, aspectRatio = '2:3', steps = 32, cfg = 3, seed, 
    refs = [], poseType, denoise, workflow, useRefAsInit, ipadapterWeight, refImageBase64,
    poseImage, maskImage, baseImage, extraLora, controlStrength
}) {
  const apiUrl = readEnvStr('MODAL_COMFY_API_URL', '')
  const timeoutMs = readEnvInt('MODAL_COMFY_TIMEOUT_MS', 180000)
  const apiKey = readEnvStr('MODAL_COMFY_API_KEY', '')
  if (!apiUrl) return { ok: false, error: 'MODAL_COMFY_API_URL não configurado' }

  const stepsEnv = readEnvInt('COMFYUI_STEPS', 32)
  const cfgEnv = readEnvInt('COMFYUI_CFG', 3)
  const stepsVal = Number.isFinite(Number(steps)) ? Number(steps) : stepsEnv
  const cfgVal = Number.isFinite(Number(cfg)) ? Number(cfg) : cfgEnv

    // Adicionar suporte para refs_images (lista de base64)
    // O backend Modal espera `refs_images` quando o workflow é 'pack', contendo a lista de strings base64 das imagens de referência
    // Se refImageBase64 estiver presente, usamos ela.
    // Se refs (URLs) estiver presente, o backend Modal deve baixar?
    // O erro 500/400 sugere que o backend Modal está tentando baixar a URL do Supabase e falhando (talvez 403 ou 400).
    // O erro "400 Client Error: Bad Request for url" no log do Modal confirma que ele tenta baixar a URL.
    // Pode ser que a URL do Supabase precise de tratamento ou o Modal não consegue acessar URLs com query params (embora download=1 devesse funcionar).
    // Alternativa segura: Baixar as refs aqui no Node e enviar como base64 para o Modal.
    
    let refsBase64 = []
    if (refs && refs.length > 0) {
       // Se temos refs URLs e o workflow é pack ou usamos refs, vamos tentar baixar e converter para base64
       // para evitar que o Modal falhe ao baixar.
       try {
         // Import dinâmico ou função helper se necessário. Assumindo fetch global.
         const downloadPromises = refs.map(async (rUrl) => {
            if (!rUrl.startsWith('http')) return null
            try {
              const r = await fetch(rUrl)
              if (!r.ok) return null
              const ab = await r.arrayBuffer()
              return Buffer.from(ab).toString('base64')
            } catch (e) {
               console.error('[ModalClient] Erro ao baixar ref para base64:', rUrl, e)
               return null
            }
         })
         const downloaded = await Promise.all(downloadPromises)
         refsBase64 = downloaded.filter(Boolean)
       } catch (e) {
         console.error('[ModalClient] Falha geral ao processar refs base64:', e)
       }
    }

    if (refImageBase64) {
        refsBase64.push(refImageBase64)
    }

    const poseB64 = await toBase64(poseImage)
    const maskB64 = await toBase64(maskImage)
    const baseB64 = await toBase64(baseImage)

    const payload = {
    prompt: String(prompt || ''),
    negative_prompt: String(negativePrompt || ''),
    aspect_ratio: String(aspectRatio || '2:3'),
    steps: stepsVal,
    cfg: cfgVal,
    ...(Number.isFinite(Number(seed)) ? { seed: Number(seed) } : {}),
    refs: [], // Envia array vazio de URLs para forçar uso do base64 se o backend suportar, ou mantem vazio se for enviar images
    // O backend Modal parece usar 'refs' para URLs. Se enviarmos base64, deve ser outro campo ou o backend precisa ser ajustado.
    // Pelo erro, o backend TENTA baixar refs.
    // Vamos tentar enviar 'ref_images_base64' (lista) se o backend suportar, OU substituir 'refs' por base64 se o backend esperar isso?
    // Analisando o erro: "requests.exceptions.HTTPError... url: ...avatar-pack...png?download=1"
    // O erro é no REQUEST do Python dentro do Modal.
    // A URL tem ?download=1. O Supabase as vezes rejeita ou o requests do Python se perde.
    // Vamos limpar a URL enviada para remover query params desnecessários se for o caso, OU enviar base64.
    // Como não tenho acesso ao código do Modal (Python), vou assumir que enviar base64 é mais seguro se eu puder.
    // Mas se o contrato for URL, vou tentar limpar a URL.
    
    // Tentativa 1: Limpar URL (remover ?download=1) e enviar URLs limpas.
    refs: Array.isArray(refs) ? refs.map(r => r.split('?')[0]) : [],
    
    poseType: String(poseType || ''),
    ...(String(workflow || '').trim() ? { workflow: String(workflow || '').trim() } : {}),
    ...(Number.isFinite(Number(denoise)) ? { denoise: Number(denoise) } : {}),
    ...(typeof useRefAsInit === 'boolean' ? { use_ref_as_init: useRefAsInit } : {}),
    ...(Number.isFinite(Number(ipadapterWeight)) ? { ipadapter_weight: Number(ipadapterWeight) } : {}),
    ...(Number.isFinite(Number(controlStrength)) ? { control_strength: Number(controlStrength) } : {}),
    
    // Se o backend suportar ref_image_base64 unico:
    ...(typeof refImageBase64 === 'string' && refImageBase64.trim() ? { ref_image_base64: refImageBase64.trim() } : {}),
    ...(poseB64 ? { pose_image_base64: poseB64 } : {}),
    ...(maskB64 ? { mask_base64: maskB64 } : {}),
    ...(baseB64 ? { base_image_base64: baseB64 } : {}),
    ...(extraLora ? { extra_lora: extraLora } : {}),
    
    // Se eu baixei e converti, posso tentar enviar como 'ref_images' (lista) se o backend Python iterar sobre isso.
    // Mas sem ver o código Python, a aposta mais segura para corrigir o erro "Bad Request for url" 
    // é garantir que a URL seja acessível. 
    // O erro 400 na URL do supabase pode ser assinatura expirada ou formato inválido.
    // Supabase URLs publicas geralmente não expiram, mas ?download=1 pode causar issues em alguns clients.
  }

  const controller = new AbortController()
  const to = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(to)
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return { ok: false, error: `Modal ${res.status}: ${txt || 'Falha ao gerar'}` }
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase().split(';')[0].trim()
    if (contentType.startsWith('image/')) {
      const buffer = Buffer.from(await res.arrayBuffer())
      return { ok: true, bytes: buffer, contentType: contentType || 'image/png', provider: 'modal' }
    }

    const data = await res.json().catch(() => ({}))
    const url = String(data?.url || data?.image_url || '').trim()
    if (url) return { ok: true, url, provider: 'modal' }

    const b64 = String(data?.image_base64 || data?.base64 || '').trim()
    if (b64) {
      const buf = Buffer.from(b64, 'base64')
      return { ok: true, bytes: buf, contentType: 'image/png', provider: 'modal' }
    }

    return { ok: false, error: 'Modal retornou resposta sem imagem' }
  } catch (e) {
    if (e?.name === 'AbortError') {
      return { ok: false, error: `Timeout Modal após ${timeoutMs}ms` }
    }
    return { ok: false, error: (e?.message || 'Falha Modal').toString() }
  } finally {
    clearTimeout(to)
  }
}
