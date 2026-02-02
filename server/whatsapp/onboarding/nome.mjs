export function formatarNomePtBr(nome) {
  const raw = (nome || '').toString().trim().replace(/\s+/g, ' ')
  if (!raw) return ''
  const conectores = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])
  const partes = raw.split(' ').filter(Boolean).slice(0, 6)
  const normalizadas = partes.map((p, idx) => {
    const lower = p.toLowerCase()
    if (idx > 0 && conectores.has(lower)) return lower
    const segs = p.split(/([\-'])/g).filter((x) => x.length)
    const out = segs.map((s) => {
      if (s === '-' || s === "'") return s
      const sl = s.toLowerCase()
      if (idx > 0 && conectores.has(sl)) return sl
      return sl.charAt(0).toUpperCase() + sl.slice(1)
    }).join('')
    return out
  })
  return normalizadas.join(' ').trim().slice(0, 60)
}

export function extrairNomeDoTexto(texto) {
  const original = (texto || '').toString().trim()
  const compact = original.replace(/\s+/g, ' ').trim()
  if (!compact) return ''

  const prefixos = [
    /^meu nome é\s+/i,
    /^meu nome eh\s+/i,
    /^me chamo\s+/i,
    /^eu me chamo\s+/i,
    /^chamo-me\s+/i,
    /^pode me chamar de\s+/i,
    /^pode chamar de\s+/i,
    /^sou o\s+/i,
    /^sou a\s+/i,
  ]

  let s = compact
  for (const re of prefixos) {
    if (re.test(s)) {
      s = s.replace(re, '')
      break
    }
  }

  s = s.split(/[\n.!?]/)[0].trim()
  s = s.replace(/^[:\-–—]+\s*/, '').trim()
  s = s.replace(/["“”'`]/g, '').trim()

  const tokens = s.split(' ').filter(Boolean)
  if (!tokens.length) return ''

  const conectores = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])
  const bloquear = new Set(['tenho', 'idade', 'anos', 'ano', 'moro', 'cidade', 'sou', 'estou', 'chamo', 'nome', 'meu', 'minha', 'prazer'])
  const nomeParts = []

  const ehPalavraNome = (w) => {
    const t = (w || '').toString()
    if (!t) return false
    if (/\d/.test(t)) return false
    if (!/^[\p{L}][\p{L}'-]{1,}$/u.test(t)) return false
    return true
  }

  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i]
    const wl = w.toLowerCase()
    if (bloquear.has(wl)) break
    if (conectores.has(wl)) {
      if (nomeParts.length) nomeParts.push(wl)
      continue
    }
    if (!ehPalavraNome(w)) break
    nomeParts.push(w)
    if (nomeParts.filter((p) => !conectores.has(String(p).toLowerCase())).length >= 4) break
  }

  while (nomeParts.length && conectores.has(String(nomeParts[nomeParts.length - 1]).toLowerCase())) nomeParts.pop()
  const out = nomeParts.join(' ').trim()
  return out
}

