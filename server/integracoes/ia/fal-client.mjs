
const FAL_KEY = process.env.FAL_KEY;

// Modelo fallback: Flux Dev no Fal.ai
const FAL_MODEL = "fal-ai/flux/dev";

function buildFalAuthHeader(key) {
  const k = (key || '').toString().trim()
  if (!k) return ''
  if (/^key\s+/i.test(k)) return k
  if (/^bearer\s+/i.test(k)) return k
  return `Key ${k}`
}

export async function gerarImagemFal({ prompt, aspectRatio = "2:3", numInferenceSteps = 28, guidanceScale = 3 }) {
  if (!FAL_KEY) {
    return { ok: false, error: "FAL_KEY não configurado" };
  }

  // Debug da chave (apenas verificação visual no log)
  console.log(`[Fal.ai] Usando chave: ${FAL_KEY.substring(0, 4)}... (Length: ${FAL_KEY.length})`);
  const authHeader = buildFalAuthHeader(FAL_KEY)

  try {
    // Fal.ai Queue API
    const response = await fetch(`https://queue.fal.run/${FAL_MODEL}`, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: prompt,
        image_size: mapAspectRatioToFal(aspectRatio),
        num_inference_steps: numInferenceSteps,
        guidance_scale: guidanceScale,
        enable_safety_checker: false // CRÍTICO para NSFW
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[Fal.ai] Erro HTTP:", response.status, err);
      if (response.status === 401) {
        return {
          ok: false,
          error:
            `Fal.ai 401: chave inválida/sem permissão para o modelo "${FAL_MODEL}". ` +
            `Confira se FAL_KEY é um token do Fal (ex.: começando com "Key " ou "Bearer ") e se tem acesso ao app.`
        }
      }
      return { ok: false, error: `Erro Fal.ai: ${response.status} - ${err}` };
    }

    const data = await response.json();
    
    // O retorno da queue contém request_id e status_url
    if (data.status_url) {
      console.log("[Fal.ai] Iniciando polling para:", data.status_url); // LOG ADICIONADO
      return await fazerPollingFal(data.status_url);
    } else {
       console.error("[Fal.ai] Resposta sem status_url"); // LOG ADICIONADO
       return { ok: false, error: "Fal.ai não retornou status_url" };
    }

  } catch (error) {
    console.error("[Fal.ai] Exception:", error);
    return { ok: false, error: error.message };
  }
}

function mapAspectRatioToFal(ar) {
    // Fal aceita strings como "portrait_4_3", "square_hd", etc ou objeto {width, height}
    // Simplificando mapeamento
    if (ar === "2:3") return { width: 832, height: 1216 };
    if (ar === "3:2") return { width: 1216, height: 832 };
    if (ar === "1:1") return "square_hd";
    if (ar === "16:9") return "landscape_16_9";
    return "portrait_4_3"; // Default fallback
}

async function fazerPollingFal(statusUrl) {
  const maxAttempts = 30;
  const interval = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, interval));

    try {
      const authHeader = buildFalAuthHeader(FAL_KEY)
      const res = await fetch(statusUrl, {
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/json"
        }
      });

      if (!res.ok) continue;

      const data = await res.json();
      console.log(`[Fal.ai] Polling attempt ${i+1}: ${data.status}`); // LOG ADICIONADO
      
      if (data.status === "COMPLETED") {
        if (data.images && data.images.length > 0) {
             return { ok: true, url: data.images[0].url, provider: "fal-ai" };
        }
        return { ok: false, error: "Fal.ai completou mas sem imagens" };
      } else if (data.status === "FAILED") {
        console.error("[Fal.ai] Falha no polling:", data.error); // LOG ADICIONADO
        return { ok: false, error: `Fal.ai falhou: ${data.error}` };
      }
      // IN_QUEUE ou IN_PROGRESS, continua
    } catch (e) {
      console.error("[Fal.ai] Polling error:", e);
    }
  }

  return { ok: false, error: "Fal.ai timeout" };
}
