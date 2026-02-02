import { createClient } from '@supabase/supabase-js'

function getSupabaseEnv() {
  const url = (process.env.SUPABASE_URL || '').toString().trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').toString().trim()
  const bucket = (process.env.SUPABASE_BUCKET_FOTOS_PERSONAS || '').toString().trim() || 'fotos-personas'
  if (!url) return { ok: false, error: 'SUPABASE_URL não configurado' }
  if (!serviceRoleKey) return { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY não configurado' }
  return { ok: true, url, serviceRoleKey, bucket }
}

export function criarClienteSupabase() {
  const env = getSupabaseEnv()
  if (!env.ok) return env
  const supabase = createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return { ok: true, supabase, bucket: env.bucket }
}

export async function uploadImagemPublicaSupabase({ path, bytes, contentType, upsert = true, bucketName }) {
  const env = getSupabaseEnv()
  if (!env.ok) return env

  const supabase = createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const bucket = bucketName || env.bucket
  const uploadRes = await supabase.storage.from(bucket).upload(path, bytes, { contentType, upsert })
  if (uploadRes.error) return { ok: false, error: uploadRes.error.message || 'Falha ao enviar para o Supabase' }

  const pub = supabase.storage.from(bucket).getPublicUrl(path)
  const publicUrl = pub?.data?.publicUrl
  if (!publicUrl) return { ok: false, error: 'Não foi possível obter URL pública do Supabase' }

  return { ok: true, bucket, path, publicUrl }
}

export async function listarPublicUrlsSupabase({ prefix, bucketName, limit = 50 }) {
  const env = getSupabaseEnv()
  if (!env.ok) return env

  const supabase = createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const bucket = bucketName || env.bucket
  const dir = (prefix || '').toString().replace(/^\/+/, '').replace(/\/+$/, '')
  const listRes = await supabase.storage.from(bucket).list(dir, { limit })
  if (listRes.error) return { ok: false, error: listRes.error.message || 'Falha ao listar no Supabase' }
  const items = Array.isArray(listRes.data) ? listRes.data : []
  const urls = []
  for (const it of items) {
    const path = `${dir}/${String(it.name)}`
    const pub = supabase.storage.from(bucket).getPublicUrl(path)
    const publicUrl = pub?.data?.publicUrl
    if (publicUrl) urls.push({ name: String(it.name), path, publicUrl })
  }
  return { ok: true, bucket, prefix: dir, items: urls }
}
