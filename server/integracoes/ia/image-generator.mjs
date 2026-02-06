
import { gerarImagemReplicate } from './replicate-client.mjs';
import { gerarImagemFal } from './fal-client.mjs';
import { gerarImagemComfyUI } from './comfyui-client.mjs';
import { gerarImagemRunComfy } from './runcomfy-client.mjs';
import { gerarImagemModal } from './modal-client.mjs';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

const PROMPT_MAOS_POSITIVO =
  'Perfect hand, Detailed hand, detailed perfect hands, five fingers per hand, anatomically correct fingers, no fused fingers, no extra digits, no missing fingers, realistic hand proportions, detailed knuckles and nails, natural hand pose'

const PROMPT_MAOS_NEGATIVO =
  'deformed hands, mutated fingers, extra fingers, missing fingers, fused fingers, bad anatomy hands, poorly drawn hands, blurry hands, lowres hands, six fingers, three fingers'

function promptPedeCloseUp(prompt) {
  const p = String(prompt || '')
  const hasClose = /\b(extreme close-up|close-up|macro lens|macro)\b/i.test(p)
  const hasFullBody = /\bfull[- ]body\b/i.test(p)
  const hasNegatedFullBody = /\b(no|without)\s+full[- ]body\b/i.test(p)
  return hasClose && (!hasFullBody || hasNegatedFullBody)
}

function anexarFragmentoPrompt(base, fragmento) {
  const b = String(base || '').trim()
  const f = String(fragmento || '').trim()
  if (!f) return b
  if (!b) return f
  if (b.toLowerCase().includes(f.toLowerCase())) return b
  if (b.endsWith(',')) return `${b} ${f}`
  return `${b}, ${f}`
}

function aplicarCorrecaoDeMaosNoPrompt({ prompt, negativePrompt }) {
  const desativado = String(process.env.DISABLE_HAND_FIX || '').trim().toLowerCase() === 'true'
  if (desativado) return { prompt, negativePrompt }
  return {
    prompt: anexarFragmentoPrompt(prompt, PROMPT_MAOS_POSITIVO),
    negativePrompt: anexarFragmentoPrompt(negativePrompt, PROMPT_MAOS_NEGATIVO),
  }
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
export async function gerarImagemNSFW({ prompt, aspectRatio = "2:3", negativePrompt, refs, poseType, seed, baseImage, maskImage }) {
  ;({ prompt, negativePrompt } = aplicarCorrecaoDeMaosNoPrompt({ prompt, negativePrompt }))
  console.log(`[ImageGenerator] Iniciando geração. Prompt: ${prompt.slice(0, 50)}...`);
  const recentKey = `${String(poseType || '').toLowerCase().trim()}|${Array.isArray(refs) && refs.length ? String(refs[0] || '') : ''}`

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

  let ipadapterWeight = closeUp ? ipadapterWeightCloseUp : ipadapterWeightDefault
  if ((process.env.DEBUG_IMAGE_FRAMING || '').toString().trim() === 'true') {
    console.log('[ImageGenerator] Framing', { closeUp, poseType, refsIn: refsArr.length, refsCloseUp: refsCloseUp.length, refsModal: refsParaModal.length, refsFallbacks: refsParaFallbacks.length, denoiseParaModal, ipadapterWeight })
  }

  // Lógica de Pose Asset (ControlNet)
  let selectedWorkflow = refsParaModal.length ? 'pack' : ''
  let selectedPoseImage = undefined
  let extraLora = undefined

  if (baseImage) {
    selectedWorkflow = 'inpainting'
    selectedPoseImage = undefined
  }
  
  // Ordem importa: Poses mais específicas primeiro!
   const poseMap = {
       // 1. BDSM & Específicos (Prioridade Máxima)
       'metalstocks': 'assets/poses/NSFW_metalstocks',
       'algema': 'assets/poses/NSFW_metalstocks',
       'presa': 'assets/poses/NSFW_metalstocks',
       'shackles': 'assets/poses/NSFW_metalstocks',
       'handcuff': 'assets/poses/NSFW_metalstocks',
       'handcuffs': 'assets/poses/NSFW_metalstocks',
       'handcuffed': 'assets/poses/NSFW_metalstocks',
       'cuffs': 'assets/poses/NSFW_metalstocks',
       'manacles': 'assets/poses/NSFW_metalstocks',
       'shibari': 'assets/poses/NSFW_suspended',
       'rope bondage': 'assets/poses/NSFW_suspended',
       'ropes': 'assets/poses/NSFW_suspended',
       'suspended': 'assets/poses/NSFW_suspended',
       'bondage': 'assets/poses/NSFW_suspended',
       'amarrada': 'assets/poses/NSFW_suspended',
       'cordas': 'assets/poses/NSFW_suspended',

       // 2. Poses "Fortes" (Definem a posição do corpo todo)
       'doggy': ['assets/poses/NSFW_all_fours_photos', 'assets/poses/NSFW_all_fours'],
       'de quatro': ['assets/poses/NSFW_all_fours_photos', 'assets/poses/NSFW_all_fours'],
       'de 4': ['assets/poses/NSFW_all_fours_photos', 'assets/poses/NSFW_all_fours'], // Adicionado variação numérica
       'doggystyle': ['assets/poses/NSFW_all_fours_photos', 'assets/poses/NSFW_all_fours'],
       'all fours': ['assets/poses/NSFW_all_fours_photos', 'assets/poses/NSFW_all_fours'],
       
       'squatting': 'assets/poses/NSFW_Squatting',
       'agachada': 'assets/poses/NSFW_Squatting',
       
       'standing': 'assets/poses/NSFW_standing',
       'em pé': 'assets/poses/NSFW_standing',
       'de pé': 'assets/poses/NSFW_standing',

       'kneeling': 'assets/poses/NSFW_Kneeling',
       'ajoelhada': 'assets/poses/NSFW_Kneeling',
       'de joelhos': 'assets/poses/NSFW_Kneeling',
       'blowjob': 'assets/poses/NSFW_Kneeling',
       'boquete': 'assets/poses/NSFW_Kneeling',
       'cowgirl': 'assets/poses/NSFW_Kneeling',
       'cavalgando': 'assets/poses/NSFW_Kneeling',

       // 3. Poses "Médias" (Lying/Sitting podem ser genéricas)
       'lying': 'assets/poses/NSFW_lying',
       'deitada': 'assets/poses/NSFW_lying',
       'cama': 'assets/poses/NSFW_lying',
       'legs up': 'assets/poses/NSFW_lying',
       'missionary': 'assets/poses/NSFW_lying',
       'papai e mamãe': 'assets/poses/NSFW_lying',

       'sitting': 'assets/poses/NSFW_sitting',
       'sentada': 'assets/poses/NSFW_sitting',
       'sofa': 'assets/poses/NSFW_sitting',
       'cadeira': 'assets/poses/NSFW_sitting',

       // 4. Detalhes/Variações (Menor prioridade, só ativa se não tiver doggy/standing etc)
       'split': 'assets/poses/NSFW_split_leg',
       'spread': 'assets/poses/NSFW_split_leg',
       'aberta': 'assets/poses/NSFW_split_leg',
       'pernas abertas': 'assets/poses/NSFW_split_leg'
   }
    const textSearch = (String(prompt) + ' ' + String(poseType)).toLowerCase()
    
    if ((process.env.DEBUG_IMAGE_FRAMING || '').toString().trim() === 'true') {
        console.log('[ImageGenerator] Buscando pose para:', textSearch)
    }

    // Detectar LoRA BDSM
  if (textSearch.includes('metalstocks') || textSearch.includes('shackles') || textSearch.includes('bondage')) {
      extraLora = 'metalstocks2-03.safetensors'
      console.log('[ImageGenerator] LoRA BDSM ativado')
  }

  const _recentAssets = globalThis.__recentPoseAssets ?? (globalThis.__recentPoseAssets = new Map())
  const rememberAsset = (k, file) => {
    const max = Math.max(2, parseInt((process.env.RECENT_POSE_ASSETS_MAX || '6').toString(), 10) || 6)
    const arr = Array.isArray(_recentAssets.get(k)) ? _recentAssets.get(k) : []
    const next = [file, ...arr.filter((v) => v !== file)].slice(0, max)
    _recentAssets.set(k, next)
  }
  const getRecent = (k) => {
    const arr = _recentAssets.get(k)
    return Array.isArray(arr) ? arr : []
  }

  for (const [key, pathOrFile] of Object.entries(poseMap)) {
      if (textSearch.includes(key)) {
          try {
             // Se for diretório, sorteia um arquivo
             const candidates = Array.isArray(pathOrFile) ? pathOrFile : [pathOrFile]
             let targetFile = candidates[0]

             for (const candidate of candidates) {
               if (!existsSync(candidate)) continue
               if (candidate.endsWith('.png')) {
                 targetFile = candidate
                 break
               }

               const filesAll = readdirSync(candidate).filter(f => f.endsWith('.png') && !f.includes('depth'))
               if (!filesAll.length) continue
               const filesPhoto = filesAll.filter(f => {
                 const l = f.toLowerCase()
                 return !l.includes('lineart') && !l.includes('bone') && !l.includes('skeleton')
               })
               const filesLineart = filesAll.filter(f => f.toLowerCase().includes('lineart'))
               const filesBone = filesAll.filter(f => f.toLowerCase().includes('bone') || f.toLowerCase().includes('skeleton'))
               const filesOther = filesAll.filter(f => !f.toLowerCase().includes('lineart') && !f.toLowerCase().includes('bone') && !f.toLowerCase().includes('skeleton'))
               const files = filesPhoto.length ? filesPhoto : (filesLineart.length ? filesLineart : (filesBone.length ? filesBone : filesOther))
               if (!files.length) continue
               const recents = new Set(getRecent(recentKey))
               const pool = files.filter((f) => !recents.has(join(candidate, f)))
               const pickFrom = pool.length ? pool : files
               const randomFile = pickFrom[Math.floor(Math.random() * pickFrom.length)]
               targetFile = join(candidate, randomFile)
               break
             }

             if (existsSync(targetFile)) {
                 const lower = targetFile.toLowerCase()
                 const isLineart = lower.includes('lineart')
                 const isSkeleton = lower.includes('bone') || lower.includes('skeleton')
                 const canUseAsBaseScene = !baseImage && !isLineart && !isSkeleton

                 if (canUseAsBaseScene) {
                   selectedWorkflow = 'inpainting'
                   selectedPoseImage = undefined
                   baseImage = targetFile
                   rememberAsset(recentKey, targetFile)
                 } else {
                   selectedWorkflow = 'pose'
                   selectedPoseImage = targetFile
                   rememberAsset(recentKey, targetFile)
                 }
                 console.log('[ImageGenerator] Pose detectada:', key, 'Asset:', targetFile, 'Workflow:', selectedWorkflow)
                 break
             }
          } catch (e) {
              console.error('[ImageGenerator] Erro ao buscar pose asset:', e)
          }
      }
  }

  // 1. Tentar Modal
  try {
    const controlStrength =
      selectedWorkflow === 'pose' && selectedPoseImage
        ? (readEnvNumber('MODAL_CONTROLNET_STRENGTH') ?? 0.95)
        : undefined
    if (selectedWorkflow === 'inpainting' && refsParaModal.length) {
      const inpaintWeight = readEnvNumber('MODAL_INPAINT_IPADAPTER_WEIGHT')
      const resolved = Number.isFinite(Number(inpaintWeight)) ? Number(inpaintWeight) : 0.6
      ipadapterWeight = Math.max(0, Math.min(2, resolved))
    }
    let refImageBase64 = refsParaModal.length ? await baixarRefComoBase64(refsParaModal[0]) : null
    if (!refImageBase64) {
      const fallbackRefPath = join(process.cwd(), 'assets', 'poses', 'ref.png')
      if (existsSync(fallbackRefPath)) {
        try {
          const buf = await readFile(fallbackRefPath)
          if (buf?.length) refImageBase64 = buf.toString('base64')
        } catch {}
      }
    }
    const denoiseForModal =
      selectedWorkflow === 'inpainting'
        ? (readEnvNumber('MODAL_INPAINT_DENOISE') ?? 0.35)
        : denoiseParaModal
    const resultModal = await gerarImagemModal({
      prompt,
      negativePrompt,
      aspectRatio,
      refs: refsParaModal,
      poseType,
      seed,
      workflow: selectedWorkflow,
      poseImage: selectedPoseImage,
      ...(baseImage ? { baseImage } : {}),
      ...(maskImage ? { maskImage } : {}),
      extraLora,
      useRefAsInit: closeUp ? false : true,
      ...(refsParaModal.length ? { ipadapterWeight } : {}),
      ...(refImageBase64 ? { refImageBase64 } : {}),
      ...(typeof controlStrength === 'number' ? { controlStrength } : {}),
      ...(Number.isFinite(Number(denoiseForModal)) ? { denoise: Number(denoiseForModal) } : {}),
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
