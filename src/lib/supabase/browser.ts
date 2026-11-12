/**
 * Whether accounts are configured. Authentication itself runs on the server (see app/api/auth),
 * so no Supabase client or token ever lives in browser code.
 */
export const accountsConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
