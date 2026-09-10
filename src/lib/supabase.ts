import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

// Si faltan las variables usamos una URL con formato válido (pero inerte) para
// que el cliente no explote al crearse; App.tsx corta antes de usarlo de verdad
// y muestra instrucciones de configuración.
export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder-anon-key')
