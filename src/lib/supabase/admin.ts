import { createClient } from '@supabase/supabase-js';

/**
 * Admin client (service_role) — BYPASSA RLS.
 * USAR SOMENTE em Server Actions, Route Handlers, jobs e workers.
 * NUNCA importar em Client Components.
 */
export function createSupabaseAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
