import 'server-only'

import { createClient } from '@supabase/supabase-js'

/** Cliente com service role: ignora o RLS. Valide o dono dos dados antes de usar. */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}
