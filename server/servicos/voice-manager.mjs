import fs from 'fs';
import path from 'path';

const VOICES_DIR = path.join(process.cwd(), 'server', 'assets', 'voices');

// Mapeamento padrão: Personalidade -> Nome do Arquivo de Voz (sem extensão)
// As personalidades são strings livres, mas tentamos dar match por keywords.
const DEFAULT_VOICE_MAP = {
  'sedutora': 'sedutora',
  'dominante': 'dominante',
  'brincalhona': 'brincalhona',
  'timida': 'timida',
  'intelectual': 'intelectual',
  'padrao': 'padrao'
};

const QWEN3_VOICE_PROMPT_DEFAULT = (process.env.QWEN3_VOICE_PROMPT_DEFAULT || 'Voz feminina brasileira, pronúncia do Brasil, entonação brasileira natural. Soe conversacional e espontânea, com variação de ritmo e ênfase emocional. Fala clara, pausas naturais e respiração leve, tom acolhedor e íntimo.').toString().trim();
const QWEN3_VOICE_PROMPT_MAP = {
  sedutora: 'Voz feminina brasileira, pronúncia do Brasil, sedutora e quente. Soe conversacional e espontânea, com variação de ritmo, pausas naturais e respiração leve. Tom íntimo e confiante.',
  dominante: 'Voz feminina brasileira, pronúncia do Brasil, dominante e segura. Soe conversacional e espontânea, com ritmo controlado, pausas curtas e ênfase firme. Tom autoritário e elegante.',
  brincalhona: 'Voz feminina brasileira, pronúncia do Brasil, brincalhona e sorridente. Soe conversacional e espontânea, com ritmo ágil, variação de entonação e pausas naturais. Tom divertido.',
  timida: 'Voz feminina brasileira, pronúncia do Brasil, tímida e delicada. Soe conversacional e espontânea, com ritmo mais lento, pausas naturais e respiração leve. Tom doce e carinhoso.',
  intelectual: 'Voz feminina brasileira, pronúncia do Brasil, clara e bem articulada. Soe conversacional e espontânea, com ritmo calmo, pausas naturais e ênfase leve. Tom confiante.',
  padrao: 'Voz feminina brasileira, pronúncia do Brasil, natural e clara. Soe conversacional e espontânea, com variação de ritmo e pausas naturais. Tom acolhedor.'
};

function resolveVoiceKey(persona) {
  let voiceName = persona?.voicePreset;
  if (!voiceName && persona?.personality) {
    const p = persona.personality.toLowerCase();
    for (const [key, val] of Object.entries(DEFAULT_VOICE_MAP)) {
      if (p.includes(key)) {
        voiceName = val;
        break;
      }
    }
  }
  return voiceName || 'padrao';
}

function escapeRegExp(input) {
  return (input || '').toString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function listVoiceFiles(voiceName, extensions) {
  if (!fs.existsSync(VOICES_DIR)) return [];
  const safe = escapeRegExp(voiceName);
  const files = fs.readdirSync(VOICES_DIR);
  const matched = [];
  for (const f of files) {
    const lower = f.toLowerCase();
    const ext = extensions.find(e => lower.endsWith(e));
    if (!ext) continue;
    const rx = new RegExp(`^${safe}([_-].+)?\\${ext}$`, 'i');
    if (rx.test(f)) matched.push(path.join(VOICES_DIR, f));
  }
  return matched;
}

/**
 * Serviço para gerenciar presets de voz.
 */
export const voiceManager = {
  async getVoiceSampleItemsByName(voiceName) {
    const name = (voiceName || '').toString().trim() || 'padrao';
    const paths = listVoiceFiles(name, ['.wav']);
    if (!paths.length && name !== 'padrao') {
      const fallback = listVoiceFiles('padrao', ['.wav']);
      if (fallback.length) {
        return fallback.map(p => ({ file: path.basename(p), buffer: fs.readFileSync(p) })).filter(Boolean);
      }
    }
    if (!paths.length) return [];
    const items = [];
    for (const p of paths) {
      try {
        items.push({ file: path.basename(p), buffer: fs.readFileSync(p) });
      } catch {}
    }
    return items;
  },

  async getVoiceSampleItems(persona) {
    const voiceName = resolveVoiceKey(persona);
    const paths = listVoiceFiles(voiceName, ['.wav']);
    if (!paths.length && voiceName !== 'padrao') {
      const fallback = listVoiceFiles('padrao', ['.wav']);
      if (fallback.length) {
        return fallback.map(p => ({ file: path.basename(p), buffer: fs.readFileSync(p) })).filter(Boolean);
      }
    }
    if (!paths.length) return [];
    const items = [];
    for (const p of paths) {
      try {
        items.push({ file: path.basename(p), buffer: fs.readFileSync(p) });
      } catch (err) {
        console.error(`[VoiceManager] Erro ao ler arquivo de voz ${p}:`, err);
      }
    }
    return items;
  },

  async getVoiceSamplesByName(voiceName) {
    const items = await this.getVoiceSampleItemsByName(voiceName);
    return items.map(i => i.buffer).filter(Boolean);
  },
  async getVoiceSamples(persona) {
    const items = await this.getVoiceSampleItems(persona);
    return items.map(i => i.buffer).filter(Boolean);
  },
  /**
   * Obtém o buffer do áudio de referência para uma dada persona.
   * Tenta encontrar baseada no preset salvo ou infere pela personalidade.
   * 
   * @param {Object} persona - Objeto persona do banco
   * @returns {Promise<Buffer|null>} Buffer do arquivo .wav ou null se não achar
   */
  async getVoiceSample(persona) {
    const wavs = await this.getVoiceSamples(persona);
    if (wavs.length) return wavs[0];
    let voiceName = resolveVoiceKey(persona);
    const paths = listVoiceFiles(voiceName, ['.mp3']);
    if (!paths.length && voiceName !== 'padrao') {
      const fallback = listVoiceFiles('padrao', ['.mp3']);
      if (fallback.length) return fs.readFileSync(fallback[0]);
    }
    if (!paths.length) {
      console.warn(`[VoiceManager] Nenhuma voz encontrada para persona ${persona.name} (preset: ${persona.voicePreset}, personality: ${persona.personality})`);
      return null;
    }
    try {
      return fs.readFileSync(paths[0]);
    } catch (err) {
      console.error(`[VoiceManager] Erro ao ler arquivo de voz ${paths[0]}:`, err);
      return null;
    }
  },
  getQwen3VoicePrompt(persona) {
    const rawPreset = (persona?.voicePreset || '').toString().trim();
    if (rawPreset && rawPreset.startsWith('qwen3:')) {
      const prompt = rawPreset.slice(6).trim();
      if (prompt) return prompt;
    }
    const key = resolveVoiceKey(persona);
    const mapped = (QWEN3_VOICE_PROMPT_MAP[key] || QWEN3_VOICE_PROMPT_MAP.padrao || '').toString().trim();
    if (mapped) return mapped;
    return QWEN3_VOICE_PROMPT_DEFAULT || 'Voz feminina brasileira, natural, clara, ritmo médio, tom acolhedor.';
  },

  /**
   * Lista as vozes disponíveis no diretório de assets.
   * @returns {string[]} Lista de nomes de vozes
   */
  listAvailableVoices() {
    if (!fs.existsSync(VOICES_DIR)) return [];
    
    const files = fs.readdirSync(VOICES_DIR);
    const voices = new Set();
    
    files.forEach(f => {
      if (f.endsWith('.wav') || f.endsWith('.mp3')) {
        voices.add(path.parse(f).name);
      }
    });
    
    return Array.from(voices);
  }
};
