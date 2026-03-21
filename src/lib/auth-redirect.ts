import type { SupabaseClient, User } from "@supabase/supabase-js";

type ProfileRedirectRow = {
  first_name: string | null;
  last_name: string | null;
};

export const PROVIDER_ONBOARDING_PATH = "/dashboard/profile?onboarding=1";
export const DEFAULT_AUTH_REDIRECT_PATH = "/dashboard";

export async function resolvePostAuthRedirectPath(
  supabase: SupabaseClient,
  user: User | null
): Promise<string> {
  if (!user) return "/login";

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name,last_name")
    .eq("id", user.id)
    .maybeSingle<ProfileRedirectRow>();

  const profileComplete = Boolean(profile?.first_name && profile?.last_name);
  return profileComplete ? DEFAULT_AUTH_REDIRECT_PATH : PROVIDER_ONBOARDING_PATH;
}

export function sanitizeRedirectPath(path: string | null | undefined): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return null;
  }

  return path;
}
