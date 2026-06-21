import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
const BLOCKED_PROJECT_REFS = ['ohhgnvaxhaggqctxqwrn']
const isBlockedProject = BLOCKED_PROJECT_REFS.some((ref) => supabaseUrl?.includes(ref))

export const supabase =
  supabaseUrl && supabaseAnonKey && !isBlockedProject ? createClient(supabaseUrl, supabaseAnonKey) : null

export function isSupabaseConfigured() {
  return Boolean(supabase)
}
