
import { gerarImagemReplicate } from './replicate-client.mjs';
import { gerarImagemFal } from './fal-client.mjs';
import { gerarImagemComfyUI } from './comfyui-client.mjs';
import { gerarImagemRunComfy } from './runcomfy-client.mjs';
import { gerarImagemModal } from './modal-client.mjs';

function promptPedeCloseUp(prompt) {
  const p = String(prompt || '')
  const hasClose = /\b(extreme close-up|close-up|macro lens|macro)\b/i.test(p)
  const hasFullBody = /\bfull[- ]body\b/i.test(p)
  const hasNegatedFullBody = /\b(no|without)\s+full[- ]body\b/i.test(p)
  return hasClose && (!hasFullBody || hasNegatedFullBody)
}

function readEnvNumber(name) {
  const raw = (process.env[name] || '').toString().trim()
  if (!raw) return undefined
  const v = Number(raw)
  return Number.isFinite(v) ? v : undefined
}

function getUrlBasenameLower(u) {
  const raw = String(u || '').trim()
  if (!raw) return ''
  try {
    const p = new URL(raw).pathname || ''
    const base = p.split('/').pop() || ''
    return base.toLowerCase()
  } catch {
    const base = raw.split('?')[0].split('#')[0].split('/').pop() || ''
    return String(base).toLowerCase()
  }
}

function filtrarRefsCloseUp(refs, poseType) {
  const t = String(poseType || '').toLowerCase().trim()
  const allowBase =
    t === 'pussy'
      ? ['pussy_']
      : t === 'breasts'
        ? ['breasts_']
        : t === 'butt'
          ? ['butt_']
          : t === 'anal'
            ? ['anal_', 'butt_']
            : t === 'oral'
              ? ['oral_', 'face_']
              : []
  const allow = [...allowBase, 'face_', 'body_']
  if (!allow.length) return []
  const out = []
  for (const r of Array.isArray(refs) ? refs : []) {
    const base = getUrlBasenameLower(r)
    if (!base) continue
    if (allow.some((p) => base.startsWith(p))) out.push(r)
  }
  return [...new Set(out)]
}

async function baixarRefComoBase64(url) {
  const u = String(url || '').trim()
  if (!u) return null
  const controller = new AbortController()
  const to = setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch(u, { signal: controller.signal })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 64) return null
    const maxBytes = 8 * 1024 * 1024
    if (buf.length > maxBytes) return null
    return buf.toString('base64')
  } catch {
    return null
  } finally {
    clearTimeout(to)
  }
}

/**
 * Gera imagem NSFW usando Replicate como principal e Fal.ai como fallback.
 * @param {Object} params
 * @param {string} params.prompt - Prompt positivo
 * @param {string} [params.aspectRatio="2:3"] - Proporção (ex: "2:3")
 * @returns {Promise<{ok: boolean, url?: string, provider?: string, error?: string}>}
 */
export async function gerarImagemNSFW({ prompt, aspectRatio = "2:3", negativePrompt, refs, poseType, seed }) {
  console.log(`[ImageGenerator] Iniciando geração. Prompt: ${prompt.slice(0, 50)}...`);

  const refsArr = Array.isArray(refs) ? refs : []
  // Força detecção de close-up se a pose for explicita de partes intimas ou se o prompt pedir
  const intimateTypes = ['pussy', 'anal', 'breasts', 'oral', 'butt']
  const poseTypeLower = String(poseType || '').toLowerCase()
  const poseIsCloseUp = intimateTypes.some(t => poseTypeLower.startsWith(t))
  const closeUp = poseIsCloseUp || promptPedeCloseUp(prompt)
  
  const refsCloseUp = closeUp ? filtrarRefsCloseUp(refsArr, poseType) : []
  const refsParaModal = closeUp ? refsCloseUp : refsArr
  const refsParaFallbacks = closeUp ? refsCloseUp : refsArr
  const denoisePadraoRaw = readEnvNumber('MODAL_REF_DENOISE_DEFAULT') ?? readEnvNumber('REF_DENOISE_DEFAULT')
  const denoisePadrao = typeof denoisePadraoRaw === 'number' && denoisePadraoRaw > 0 && denoisePadraoRaw <= 1 ? denoisePadraoRaw : 0.75
  const denoiseCloseUpRaw = readEnvNumber('MODAL_REF_DENOISE_CLOSEUP') ?? readEnvNumber('REF_DENOISE_CLOSEUP')
  // Aumentado para 0.90 para maximizar liberdade criativa e ignorar a estrutura da ref (selfie) em poses anais/vaginais
  const denoiseCloseUp = typeof denoiseCloseUpRaw === 'number' && denoiseCloseUpRaw > 0 && denoiseCloseUpRaw <= 1 ? denoiseCloseUpRaw : 0.90
  const denoiseParaModal = refsParaModal.length ? (closeUp ? denoiseCloseUp : denoisePadrao) : undefined
  const ipadapterWeightDefaultRaw = readEnvNumber('MODAL_IPADAPTER_WEIGHT_DEFAULT') ?? readEnvNumber('IPADAPTER_WEIGHT_DEFAULT')
  const ipadapterWeightCloseUpRaw = readEnvNumber('MODAL_IPADAPTER_WEIGHT_CLOSEUP') ?? readEnvNumber('IPADAPTER_WEIGHT_CLOSEUP')
  const ipadapterWeightDefault =
    typeof ipadapterWeightDefaultRaw === 'number' && ipadapterWeightDefaultRaw >= 0 && ipadapterWeightDefaultRaw <= 2 ? ipadapterWeightDefaultRaw : 0.50
  
  // Reduzido para 0.45 para garantir que a pose/rosto da ref não vazem no close-up
  let ipadapterWeightCloseUp =
    typeof ipadapterWeightCloseUpRaw === 'number' && ipadapterWeightCloseUpRaw >= 0 && ipadapterWeightCloseUpRaw <= 2 ? ipadapterWeightCloseUpRaw : 0.45

  // SAFETY NET: Para poses íntimas (anal/pussy), limitamos o peso drasticamente.
  // 0.45 é o limite máximo para garantir que a IA gere a anatomia do prompt (close sem rosto) e não a da ref.
  if (poseTypeLower.startsWith('anal') || poseTypeLower.startsWith('pussy')) {
     if (ipadapterWeightCloseUp > 0.45) {
        console.log('[ImageGenerator] Forçando teto de IPAdapter para pose íntima (safety net)', { original: ipadapterWeightCloseUp, new: 0.45 })
        ipadapterWeightCloseUp = 0.45
     }
  }

  const ipadapterWeight = closeUp ? ipadapterWeightCloseUp : ipadapterWeightDefault
  if ((process.env.DEBUG_IMAGE_FRAMING || '').toString().trim() === 'true') {
    console.log('[ImageGenerator] Framing', { closeUp, poseType, refsIn: refsArr.length, refsCloseUp: refsCloseUp.length, refsModal: refsParaModal.length, refsFallbacks: refsParaFallbacks.length, denoiseParaModal, ipadapterWeight })
  }

  // 1. Tentar Modal
  try {
    const refImageBase64 = refsParaModal.length ? await baixarRefComoBase64(refsParaModal[0]) : null
    const resultModal = await gerarImagemModal({
      prompt,
      negativePrompt,
      aspectRatio,
      refs: refsParaModal,
      poseType,
      seed,
      workflow: refsParaModal.length ? 'pack' : '',
      useRefAsInit: closeUp ? false : true,
      ...(refsParaModal.length ? { ipadapterWeight } : {}),
      ...(refImageBase64 ? { refImageBase64 } : {}),
      ...(typeof denoiseParaModal === 'number' ? { denoise: denoiseParaModal } : {}),
    });
    if (resultModal.ok) {
      console.log("[ImageGenerator] Sucesso com Modal");
      return resultModal;
    }
    console.warn("[ImageGenerator] Falha no Modal, tentando RunComfy:", resultModal.error);
  } catch (err) {
    console.error("[ImageGenerator] Erro crítico no Modal:", err);
  }

  // 2. Tentar RunComfy
  try {
    const resultRunComfy = await gerarImagemRunComfy({ prompt, negativePrompt, aspectRatio, refs: refsParaFallbacks, poseType });
    if (resultRunComfy.ok) {
      console.log("[ImageGenerator] Sucesso com RunComfy");
      return resultRunComfy;
    }
    console.warn("[ImageGenerator] Falha no RunComfy, tentando ComfyUI:", resultRunComfy.error);
  } catch (err) {
    console.error("[ImageGenerator] Erro crítico no RunComfy:", err);
  }

  // 3. Tentar ComfyUI
  try {
    const resultComfy = await gerarImagemComfyUI({ prompt, negativePrompt, aspectRatio, refs: refsParaFallbacks, poseType });
    if (resultComfy.ok) {
      console.log("[ImageGenerator] Sucesso com ComfyUI");
      return resultComfy;
    }
    console.warn("[ImageGenerator] Falha no ComfyUI, tentando Replicate:", resultComfy.error);
  } catch (err) {
    console.error("[ImageGenerator] Erro crítico no ComfyUI:", err);
  }

  // 4. Tentar Replicate
  try {
    const resultReplicate = await gerarImagemReplicate({ prompt, aspectRatio, negativePrompt });
    if (resultReplicate.ok) {
      console.log("[ImageGenerator] Sucesso com Replicate");
      return resultReplicate;
    }
    console.warn("[ImageGenerator] Falha no Replicate, tentando fallback:", resultReplicate.error);
  } catch (err) {
    console.error("[ImageGenerator] Erro crítico no Replicate:", err);
  }

  // 5. Tentar Fal.ai (Fallback)
  try {
    console.log("[ImageGenerator] Tentando Fal.ai...");
    const resultFal = await gerarImagemFal({ prompt, aspectRatio, negativePrompt });
    if (resultFal.ok) {
      console.log("[ImageGenerator] Sucesso com Fal.ai");
      return resultFal;
    }
    console.error("[ImageGenerator] Falha também no Fal.ai:", resultFal.error);
    return { ok: false, error: `Falha em ambos provedores. Last error: ${resultFal.error}` };
  } catch (err) {
    console.error("[ImageGenerator] Erro crítico no Fal.ai:", err);
    return { ok: false, error: "Erro crítico em todos os provedores" };
  }
}
