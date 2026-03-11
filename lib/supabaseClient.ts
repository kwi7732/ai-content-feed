import { createClient } from "@supabase/supabase-js";

// Safely create the client – falls back to empty strings at build time so the
// Next.js static analysis pass doesn't crash.  At runtime the real env vars
// from .env.local are always present.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
