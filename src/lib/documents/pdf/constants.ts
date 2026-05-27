import { RESER_BRAND_NAME, RESER_BRAND_TAGLINE } from "@/lib/brand";

export const FINANCIAL_DOCUMENTS_STORAGE_BUCKET = "financial-documents";

export const RESER_COMPANY = {
  brand: RESER_BRAND_NAME,
  tagline: RESER_BRAND_TAGLINE,
  legalName: "Stefan Pfaff",
  addressLines: ["Holstenplatz 13", "22765 Hamburg", "Deutschland"],
  email: "hello@getreser.app",
} as const;
