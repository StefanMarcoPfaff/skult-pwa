const DEFAULT_SITE_URL = "https://www.getreser.app";

function normalizeSiteUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function getSiteUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL;

  if (!configured) return DEFAULT_SITE_URL;

  if (/^https?:\/\//i.test(configured)) {
    return normalizeSiteUrl(configured);
  }

  return normalizeSiteUrl(`https://${configured}`);
}
