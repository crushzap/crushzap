import {
  BUNDAS_LISTA,
  CABELOS_LISTA,
  CORES_CABELO_LISTA,
  CORPOS_LISTA,
  ETNIAS_LISTA,
  PERSONALIDADES_LISTA,
  PROFISSOES_LISTA,
  ROUPAS_LISTA,
  SEIOS_LISTA,
} from './opcoes.mjs'
import { generateWithGrok } from '../../integrations/grok.mjs'

function norm(v) {
  return (v || '').toString().trim().toLowerCase()
}

function hashNome(v) {
  const s = norm(v)
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function pickByName(nome, arr) {
  const list = Array.isArray(arr) ? arr : []
  if (!list.length) return ''
  const idx = hashNome(nome) % list.length
  return list[idx]
}

function acharDescricao(lista, escolha) {
  const alvo = norm(escolha)
  if (!alvo) return ''
  const item = (lista || []).find((x) => norm(x?.title) === alvo)
  return (item?.description || '').toString().trim()
}

const SIGNIFICADOS_NOMES = {
  melissa: '“abelha”. Vem do grego “mélissa” (μέλισσα), associado à doçura e delicadeza.',
  luna: '“lua”. Remete ao mistério, charme e um brilho que puxa o olhar.',
  valentina: '“valente” e “forte”. Um nome com presença e coragem.',
  aurora: '“amanhecer”. Traz a ideia de recomeço, luz e encanto.',
  maya: 'pode significar “ilusão” (sânscrito) ou “mãe” (hebraico, em algumas interpretações). Um nome curto e marcante.',
}

const cacheNomeCrush = new Map()

export function comentarioNomeUsuario(nome) {
  const n = (nome || '').toString().trim()
  if (!n) return ''
  const sig = SIGNIFICADOS_NOMES[norm(n)]
  if (sig) return `${n} é um belo nome… ${sig}`
  return pickByName(n, [
    `${n}… gostei. Tem presença e eu já consigo imaginar sua Crush falando isso bem pertinho.`,
    `${n}… perfeito. É curto, marcante e fica fácil de chamar com carinho.`,
    `${n}… adorei. Tem uma vibe única — do tipo que vira apelido rápido.`,
    `${n}… bom demais. É o tipo de nome que prende atenção só de ouvir.`,
  ])
}

function comentarioNomeCrushDeterministico(nome) {
  const n = (nome || '').toString().trim()
  if (!n) return ''
  const sig = SIGNIFICADOS_NOMES[norm(n)]
  if (sig) return `${n}… adorei. ${sig} Combina com uma Crush que marca.`
  return pickByName(n, [
    `${n}… gostei. Tem uma sonoridade que dá vontade de chamar de novo.`,
    `${n}… perfeito pra ela. É um nome que chega com presença.`,
    `${n}… adorei. Parece nome de alguém que vira lembrança fácil.`,
    `${n}… que escolha boa. É delicado, mas com atitude.`,
  ])
}

export async function comentarioNomeCrushAsync(nome) {
  const n = (nome || '').toString().trim()
  if (!n) return ''
  const key = norm(n)
  const cached = cacheNomeCrush.get(key)
  if (cached) return cached

  const sig = SIGNIFICADOS_NOMES[key]
  if (sig) {
    const out = comentarioNomeCrushDeterministico(n)
    cacheNomeCrush.set(key, out)
    return out
  }

  try {
    const system = 'Você é a Aura, atendente do CrushZap. Você fala em pt-BR, com tom imersivo e carinhoso.'
    const user = [
      'Crie um comentário curto sobre um nome escolhido para a Crush.',
      '',
      `Nome da Crush: ${n}`,
      '',
      'Regras:',
      '- 1 ou 2 frases, no máximo 220 caracteres',
      '- Se você souber com segurança a origem/significado, mencione brevemente',
      '- Se não tiver certeza, NÃO invente significado; comente só a sonoridade/energia do nome',
      '- Não mencione IA, robô, modelo, sistema, regras ou “não tenho certeza”',
      '- Não faça perguntas',
      '- No máximo 1 emoji',
    ].join('\n')
    const gen = await generateWithGrok(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { useStore: false, timeoutMs: 4500, compact: true }
    )
    if (gen?.ok && gen?.content) {
      const out = gen.content.replace(/\s+/g, ' ').trim().slice(0, 220)
      if (out) {
        cacheNomeCrush.set(key, out)
        return out
      }
    }
  } catch {}

  const fallback = comentarioNomeCrushDeterministico(n)
  cacheNomeCrush.set(key, fallback)
  return fallback
}

export function comentarioPersonalidade(pers) {
  const p = (pers || '').toString().trim()
  if (!p) return ''
  const desc = acharDescricao(PERSONALIDADES_LISTA, p)
  if (desc) return `${p} é uma ótima escolha. ${desc}.`
  return `${p} é uma ótima escolha. Vai deixar sua Crush com uma presença única.`
}

export function comentarioEtnia(eth) {
  const e = (eth || '').toString().trim()
  if (!e) return ''
  const desc = acharDescricao(ETNIAS_LISTA, e)
  if (desc) return `${e}… gostei. ${desc}.`
  return `${e}… gostei. Isso dá um toque especial nela.`
}

export function comentarioIdade(age) {
  const n = Number(age)
  if (!Number.isFinite(n)) return ''
  return `${n}… perfeito. Uma idade que combina com a vibe que você está criando.`
}

export function comentarioCabeloEstilo(hs) {
  const h = (hs || '').toString().trim()
  if (!h) return ''
  const desc = acharDescricao(CABELOS_LISTA, h)
  if (desc) return `${h}… escolha linda. ${desc}.`
  return `${h}… escolha linda. Vai ficar um visual marcante.`
}

export function comentarioCabeloCor(hc) {
  const c = (hc || '').toString().trim()
  if (!c) return ''
  const desc = acharDescricao(CORES_CABELO_LISTA, c)
  if (desc) return `${c}… perfeito. ${desc}.`
  return `${c}… perfeito. Dá um charme imediato.`
}

export function comentarioCorpo(bt) {
  const b = (bt || '').toString().trim()
  if (!b) return ''
  const desc = acharDescricao(CORPOS_LISTA, b)
  if (desc) return `${b}… ótima escolha. ${desc}.`
  return `${b}… ótima escolha. Vai ficar do jeitinho que você imagina.`
}

export function comentarioSeios(bs) {
  const s = (bs || '').toString().trim()
  if (!s) return ''
  const desc = acharDescricao(SEIOS_LISTA, s)
  if (desc) return `${s}… entendi. ${desc}.`
  return `${s}… entendi. Perfeito.`
}

export function comentarioBunda(bs2) {
  const b = (bs2 || '').toString().trim()
  if (!b) return ''
  const desc = acharDescricao(BUNDAS_LISTA, b)
  if (desc) return `${b}… ótima. ${desc}.`
  return `${b}… ótima.`
}

export function comentarioProfissao(job) {
  const j = (job || '').toString().trim()
  if (!j) return ''
  const desc = acharDescricao(PROFISSOES_LISTA, j)
  if (desc) return `${j}… adorei. ${desc}.`
  return `${j}… adorei. Isso dá personalidade pra história dela.`
}

export function comentarioRoupa(outfit) {
  const o = (outfit || '').toString().trim()
  if (!o) return ''
  const desc = acharDescricao(ROUPAS_LISTA, o)
  if (desc) return `${o}… combina demais. ${desc}.`
  return `${o}… combina demais.`
}

export function comentarioModoResposta(mode) {
  const m = (mode || '').toString().trim()
  if (!m) return ''
  if (m === 'text') return 'TEXTO… perfeito. Direto, íntimo e sem perder nenhum detalhe.'
  if (m === 'audio') return 'ÁUDIO… adorei. Voz tem um poder diferente, né?'
  if (m === 'both') return 'AMBOS… escolha perfeita. O melhor dos dois mundos.'
  return 'Perfeito. Vou ajustar isso do jeitinho que você prefere.'
}
