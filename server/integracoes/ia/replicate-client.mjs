import Replicate from "replicate";

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

function readEnvStr(name, def = '') {
  const v = (process.env[name] || '').toString().trim()
  return v || def
}

function readEnvNum(name, def) {
  const n = Number((process.env[name] || '').toString().trim())
  return Number.isFinite(n) ? n : def
}

function readEnvBool(name, def = false) {
  const v = (process.env[name] || '').toString().trim().toLowerCase()
  if (!v) return def
  return v === '1' || v === 'true' || v === 'yes' || v === 'y'
}

function clampNumber(n, min, max, def) {
  const v = Number(n)
  if (!Number.isFinite(v)) return def
  return Math.min(max, Math.max(min, v))
}

function normalizeSteps(n, def) {
  const v = Math.trunc(Number(n))
  if (!Number.isFinite(v)) return clampNumber(def, 4, 50, 28)
  return clampNumber(v, 4, 50, 28)
}

function normalizeCfg(n, def) {
  return clampNumber(n, 0.1, 20, def)
}

const MODEL_NAME = readEnvStr(
  'REPLICATE_MODEL_NAME',
  "aisha-ai-official/flux.1dev-uncensored-msfluxnsfw-v3:b477d8fc3a62e591c6224e10020538c4a9c340fb1f494891aff60019ffd5bc48"
)

const REPLICATE_DEFAULT_STEPS = readEnvNum('REPLICATE_STEPS_DEFAULT', 28)
const REPLICATE_DEFAULT_CFG = readEnvNum('REPLICATE_CFG_DEFAULT', 5)
const REPLICATE_DEFAULT_SCHEDULER = readEnvStr('REPLICATE_SCHEDULER', 'default')
const REPLICATE_DEFAULT_SEED = readEnvNum('REPLICATE_SEED', -1)
const REPLICATE_LOGS = readEnvBool('REPLICATE_LOGS', false)

function getDimensions(aspectRatio) {
  switch (aspectRatio) {
    case "1:1": return { width: 1024, height: 1024 };
    case "2:3": return { width: 1024, height: 1536 };
    case "3:2": return { width: 1536, height: 1024 };
    case "9:16": return { width: 832, height: 1472 };
    case "16:9": return { width: 1472, height: 832 };
    default: return { width: 1024, height: 1024 };
  }
}

export async function gerarImagemReplicate({ prompt, aspectRatio = "2:3", numInferenceSteps, guidanceScale, negativePrompt, seed }) {
  if (!REPLICATE_API_TOKEN) {
    return { ok: false, error: "REPLICATE_API_TOKEN não configurado" };
  }

  const replicate = new Replicate({
    auth: REPLICATE_API_TOKEN,
  });

  const dims = getDimensions(aspectRatio);
  const stepsVal = normalizeSteps(numInferenceSteps, REPLICATE_DEFAULT_STEPS)
  const cfgVal = normalizeCfg(guidanceScale, REPLICATE_DEFAULT_CFG)
  const seedVal = Number.isFinite(Number(seed)) ? Number(seed) : REPLICATE_DEFAULT_SEED
  const schedulerVal = REPLICATE_DEFAULT_SCHEDULER

  try {
    if (REPLICATE_LOGS) {
      console.log(`[Replicate] Gerando imagem. Model=${MODEL_NAME} steps=${stepsVal} cfg=${cfgVal} size=${dims.width}x${dims.height}`);
    }

    const output = await replicate.run(MODEL_NAME, {
      input: {
        seed: seedVal,
        steps: stepsVal,
        width: dims.width,
        height: dims.height,
        prompt: prompt,
        negative_prompt: negativePrompt,
        cfg_scale: cfgVal,
        scheduler: schedulerVal
      }
    });

    if (REPLICATE_LOGS) {
      console.log("[Replicate] Resultado raw:", output);
    }

    if (Array.isArray(output) && output.length > 0) {
        const item = output[0];
        let url;
        if (typeof item === 'string') {
          url = item;
        } else if (item && typeof item.url === 'function') {
          url = item.url();
        } else {
          url = item.toString();
        }
        
        if (REPLICATE_LOGS) {
          console.log("[Replicate] Sucesso:", url);
        }
        return { ok: true, url: url, provider: "replicate" };
    }

    return { ok: false, error: "Replicate não retornou URL válida" };

  } catch (error) {
    const msg = (error?.message || 'Falha Replicate').toString()
    console.error("[Replicate] Exception:", msg);
    return { ok: false, error: msg };
  }
}
