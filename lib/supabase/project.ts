// B3S league database — do not delete or pause this Supabase project.
// Project ref: edkfopfresjhsaljwpqh (dashboard name: DEAD)
export const B3S_SUPABASE_PROJECT_REF = "edkfopfresjhsaljwpqh";

export function getConfiguredSupabaseHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function isB3sSupabaseConfigured(): boolean {
  const host = getConfiguredSupabaseHost();
  return Boolean(host?.includes(B3S_SUPABASE_PROJECT_REF));
}
