import Link from "next/link";
import DashboardBackLink from "@/app/dashboard/_components/DashboardBackLink";
import { DEFAULT_PLATFORM_FEE_PERCENT } from "@/lib/platform-fees";
import { PROVIDER_PAYOUT_PROFILE_PROVIDER } from "@/lib/payout-profile";
import { getProfileAccountName, getProviderDisplayName, type ProviderType } from "@/lib/provider-profiles";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePaymentsV2AdminAccess } from "../payments-v2/access";
import { AuditNav, ADMIN_PROVIDERS_PATH, Section, StatusBadge, formatDateTime, shortenId } from "../payments-v2/ui";
import { updateProviderPlatformFeeOverrideAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  provider_type: ProviderType | null;
  organization_name: string | null;
  created_at: string | null;
};

type CourseRow = {
  id: string;
  teacher_id: string | null;
  title: string | null;
  kind: string | null;
  is_published: boolean | null;
  status: string | null;
  archived_at: string | null;
};

type BookingRow = {
  id: string;
  course_id: string | null;
  status: string | null;
  is_simulation?: boolean | null;
};

type RegistrationIntentRow = {
  id: string;
  course_id: string | null;
  status: string | null;
  is_simulation?: boolean | null;
};

type PaymentTransactionRow = {
  id: string;
  course_registration_intent_id: string | null;
  booking_id: string | null;
  provider: string | null;
  status: string | null;
};

type PayoutProfileRow = {
  id: string;
  teacher_id: string | null;
  provider: string;
  payout_method: string;
  iban_last4: string | null;
  paypal_email: string | null;
  address: string | null;
  billing_address_line_1: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
  vat_status: string | null;
  platform_fee_percent_override: number | string | null;
  platform_fee_override_note: string | null;
  platform_fee_override_updated_at: string | null;
  updated_at: string | null;
};

type AuthUserSummary = {
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
};

type ProviderDisplayRow = {
  id: string;
  name: string;
  email: string;
  registeredAt: string | null;
  profileComplete: boolean;
  payoutMethodLabel: string;
  vatStatusLabel: string;
  platformFeePercent: number;
  platformFeeIsOverride: boolean;
  platformFeeNote: string | null;
  platformFeeUpdatedAt: string | null;
  offersCount: number;
  publishedOffersCount: number;
  bookingsCount: number;
  lastActivityAt: string | null;
  testStatus: "Simulation" | "Pilot" | "aktiv";
  payoutProfileId: string | null;
};

const percentFormatter = new Intl.NumberFormat("de-DE", {
  style: "percent",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function formatPercentValue(value: number): string {
  return percentFormatter.format(value);
}

function formatPercentInputValue(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value * 100);
}

function formatPayoutMethod(profile: PayoutProfileRow | undefined): string {
  const method = normalizeOptionalText(profile?.payout_method);
  if (method === "paypal") return normalizeOptionalText(profile?.paypal_email) ? "PayPal" : "offen";
  if (method === "iban") return normalizeOptionalText(profile?.iban_last4) ? "IBAN" : "offen";
  return "offen";
}

function formatVatStatus(value: string | null): string {
  switch (value) {
    case "small_business":
      return "Kleinunternehmer*in";
    case "vat_registered":
      return "umsatzsteuerpflichtig";
    case "tax_exempt":
      return "steuerbefreit";
    default:
      return "offen";
  }
}

function formatOfferKind(value: string | null): string {
  switch (value) {
    case "course":
      return "Kurs";
    case "workshop":
      return "Workshop";
    default:
      return value || "-";
  }
}

function isProfileComplete(profile: ProfileRow, payoutProfile: PayoutProfileRow | undefined): boolean {
  const hasProviderName =
    profile.provider_type === "studio_provider"
      ? Boolean(normalizeOptionalText(profile.organization_name))
      : Boolean(normalizeOptionalText(profile.first_name) && normalizeOptionalText(profile.last_name));
  const hasBillingAddress = Boolean(
    normalizeOptionalText(payoutProfile?.address) ||
      (normalizeOptionalText(payoutProfile?.billing_address_line_1) &&
        normalizeOptionalText(payoutProfile?.billing_postal_code) &&
        normalizeOptionalText(payoutProfile?.billing_city) &&
        normalizeOptionalText(payoutProfile?.billing_country))
  );
  const hasVatStatus = Boolean(normalizeOptionalText(payoutProfile?.vat_status));
  const hasPayoutDestination = formatPayoutMethod(payoutProfile) !== "offen";

  return hasProviderName && hasBillingAddress && hasVatStatus && hasPayoutDestination;
}

function getProviderName(profile: ProfileRow): string {
  if (profile.provider_type) {
    return getProviderDisplayName(profile.provider_type, profile) || "Anbieter*in";
  }

  return getProfileAccountName(profile) || normalizeOptionalText(profile.organization_name) || "Anbieter*in";
}

function normalizePercent(value: number | string | null | undefined): number | null {
  if (value === null || typeof value === "undefined") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadAuthUserSummaries(): Promise<Map<string, AuthUserSummary>> {
  const admin = createSupabaseAdmin();
  const result = new Map<string, AuthUserSummary>();
  let page = 1;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;

    for (const user of data.users) {
      result.set(user.id, {
        email: user.email ?? null,
        createdAt: user.created_at ?? null,
        lastSignInAt: user.last_sign_in_at ?? null,
      });
    }

    if (data.users.length < 1000) break;
    page += 1;
  }

  return result;
}

function latestDate(...values: Array<string | null | undefined>): string | null {
  let latest: string | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!latest || new Date(value).getTime() > new Date(latest).getTime()) {
      latest = value;
    }
  }
  return latest;
}

export default async function AdminProvidersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePaymentsV2AdminAccess();
  const sp = await searchParams;
  const action = firstParam(sp.action);
  const actionMessage = firstParam(sp.message);
  const selectedProviderId = firstParam(sp.provider);

  const admin = createSupabaseAdmin();
  const [
    authUsersById,
    { data: profiles },
    { data: courses },
    { data: bookings },
    { data: registrationIntents },
    { data: paymentTransactions },
    { data: payoutProfiles },
  ] = await Promise.all([
    loadAuthUserSummaries(),
    admin
      .from("profiles")
      .select("id,first_name,last_name,provider_type,organization_name,created_at")
      .not("provider_type", "is", null)
      .order("created_at", { ascending: false })
      .returns<ProfileRow[]>(),
    admin.from("courses").select("id,teacher_id,title,kind,is_published,status,archived_at").returns<CourseRow[]>(),
    admin.from("bookings").select("id,course_id,status,is_simulation").returns<BookingRow[]>(),
    admin.from("course_registration_intents").select("id,course_id,status,is_simulation").returns<RegistrationIntentRow[]>(),
    admin
      .from("payment_transactions")
      .select("id,course_registration_intent_id,booking_id,provider,status")
      .returns<PaymentTransactionRow[]>(),
    admin
      .from("provider_payout_profiles")
      .select(
        "id,teacher_id,provider,payout_method,iban_last4,paypal_email,address,billing_address_line_1,billing_postal_code,billing_city,billing_country,vat_status,platform_fee_percent_override,platform_fee_override_note,platform_fee_override_updated_at,updated_at"
      )
      .order("updated_at", { ascending: false })
      .returns<PayoutProfileRow[]>(),
  ]);

  const coursesByProviderId = new Map<string, CourseRow[]>();
  for (const course of courses ?? []) {
    if (!course.teacher_id || course.archived_at) continue;
    coursesByProviderId.set(course.teacher_id, [...(coursesByProviderId.get(course.teacher_id) ?? []), course]);
  }

  const courseProviderById = new Map((courses ?? []).map((course) => [course.id, course.teacher_id] as const));
  const bookingsByProviderId = new Map<string, BookingRow[]>();
  for (const booking of bookings ?? []) {
    const providerId = booking.course_id ? courseProviderById.get(booking.course_id) : null;
    if (!providerId) continue;
    bookingsByProviderId.set(providerId, [...(bookingsByProviderId.get(providerId) ?? []), booking]);
  }

  const intentProviderById = new Map<string, string>();
  const intentsByProviderId = new Map<string, RegistrationIntentRow[]>();
  for (const intent of registrationIntents ?? []) {
    const providerId = intent.course_id ? courseProviderById.get(intent.course_id) : null;
    if (!providerId) continue;
    intentProviderById.set(intent.id, providerId);
    intentsByProviderId.set(providerId, [...(intentsByProviderId.get(providerId) ?? []), intent]);
  }

  const bookingProviderById = new Map<string, string>();
  for (const [providerId, providerBookings] of bookingsByProviderId) {
    for (const booking of providerBookings) {
      bookingProviderById.set(booking.id, providerId);
    }
  }

  const paymentTransactionsByProviderId = new Map<string, PaymentTransactionRow[]>();
  for (const transaction of paymentTransactions ?? []) {
    const providerId =
      (transaction.course_registration_intent_id && intentProviderById.get(transaction.course_registration_intent_id)) ||
      (transaction.booking_id && bookingProviderById.get(transaction.booking_id)) ||
      null;
    if (!providerId) continue;
    paymentTransactionsByProviderId.set(providerId, [
      ...(paymentTransactionsByProviderId.get(providerId) ?? []),
      transaction,
    ]);
  }

  const payoutProfileByProviderId = new Map<string, PayoutProfileRow>();
  for (const payoutProfile of payoutProfiles ?? []) {
    if (!payoutProfile.teacher_id) continue;
    const current = payoutProfileByProviderId.get(payoutProfile.teacher_id);
    if (!current || payoutProfile.provider === PROVIDER_PAYOUT_PROFILE_PROVIDER) {
      payoutProfileByProviderId.set(payoutProfile.teacher_id, payoutProfile);
    }
  }

  const rows: ProviderDisplayRow[] = (profiles ?? []).map((profile) => {
    const authUser = authUsersById.get(profile.id);
    const providerCourses = coursesByProviderId.get(profile.id) ?? [];
    const providerBookings = bookingsByProviderId.get(profile.id) ?? [];
    const providerIntents = intentsByProviderId.get(profile.id) ?? [];
    const providerTransactions = paymentTransactionsByProviderId.get(profile.id) ?? [];
    const payoutProfile = payoutProfileByProviderId.get(profile.id);
    const overridePercent = normalizePercent(payoutProfile?.platform_fee_percent_override);
    const hasNonSimulationActivity =
      providerBookings.some((booking) => booking.is_simulation !== true) ||
      providerIntents.some((intent) => intent.is_simulation !== true) ||
      providerTransactions.some((transaction) => transaction.provider !== "internal_simulation");
    const hasPublishedOffer = providerCourses.some((course) => course.is_published || course.status === "published");
    const hasSimulationActivity =
      providerBookings.some((booking) => booking.is_simulation === true) ||
      providerIntents.some((intent) => intent.is_simulation === true) ||
      providerTransactions.some((transaction) => transaction.provider === "internal_simulation");

    return {
      id: profile.id,
      name: getProviderName(profile),
      email: authUser?.email ?? "-",
      registeredAt: authUser?.createdAt ?? profile.created_at,
      profileComplete: isProfileComplete(profile, payoutProfile),
      payoutMethodLabel: formatPayoutMethod(payoutProfile),
      vatStatusLabel: formatVatStatus(payoutProfile?.vat_status ?? null),
      platformFeePercent: overridePercent ?? DEFAULT_PLATFORM_FEE_PERCENT,
      platformFeeIsOverride: overridePercent !== null,
      platformFeeNote: payoutProfile?.platform_fee_override_note ?? null,
      platformFeeUpdatedAt: payoutProfile?.platform_fee_override_updated_at ?? payoutProfile?.updated_at ?? null,
      offersCount: providerCourses.length,
      publishedOffersCount: providerCourses.filter((course) => course.is_published || course.status === "published").length,
      bookingsCount: providerBookings.length + providerIntents.length,
      lastActivityAt: latestDate(authUser?.lastSignInAt, payoutProfile?.updated_at, profile.created_at),
      testStatus: hasNonSimulationActivity ? "aktiv" : hasPublishedOffer ? "Pilot" : hasSimulationActivity ? "Simulation" : "Simulation",
      payoutProfileId: payoutProfile?.id ?? null,
    };
  });
  const selectedRow = selectedProviderId ? rows.find((row) => row.id === selectedProviderId) ?? null : null;
  const selectedCourses = selectedProviderId ? coursesByProviderId.get(selectedProviderId) ?? [] : [];

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <DashboardBackLink />
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-slate-500">Admin</p>
          <h1 className="text-2xl font-semibold text-slate-900">Anbieter*innen-Übersicht</h1>
          <p className="mt-1 text-sm text-slate-600">
            Registrierte Anbieter*innen, Profilstatus, Auszahlungsdaten, Plattformgebuehren und Nutzung.
          </p>
        </div>
        <AuditNav currentPath={ADMIN_PROVIDERS_PATH} />
      </div>

      {action === "fee-ok" && actionMessage ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{actionMessage}</p>
      ) : null}
      {action === "fee-error" && actionMessage ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{actionMessage}</p>
      ) : null}

      <Section
        title="Anbieter*innen"
        description="Nur Admin-Ansicht. Anbieter*innen erhalten keinen Zugriff auf diese Route."
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Name / Firma</th>
                <th className="px-3 py-2">E-Mail</th>
                <th className="px-3 py-2">Registriert</th>
                <th className="px-3 py-2">Profil</th>
                <th className="px-3 py-2">Auszahlung</th>
                <th className="px-3 py-2">USt.</th>
                <th className="px-3 py-2">Plattformgebuehr</th>
                <th className="px-3 py-2">Angebote</th>
                <th className="px-3 py-2">Buchungen</th>
                <th className="px-3 py-2">Aktivitaet</th>
                <th className="px-3 py-2">Teststatus</th>
                <th className="px-3 py-2">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="px-3 py-3">
                    <div className="font-medium text-slate-900">{row.name}</div>
                    <div className="text-xs text-slate-500">{shortenId(row.id)}</div>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{row.email}</td>
                  <td className="px-3 py-3 text-slate-700">{formatDateTime(row.registeredAt)}</td>
                  <td className="px-3 py-3">
                    <StatusBadge value={row.profileComplete ? "ja" : "nein"} />
                  </td>
                  <td className="px-3 py-3 text-slate-700">{row.payoutMethodLabel}</td>
                  <td className="px-3 py-3 text-slate-700">{row.vatStatusLabel}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-slate-900">{formatPercentValue(row.platformFeePercent)}</div>
                    <div className="text-xs text-slate-500">{row.platformFeeIsOverride ? "individuell" : "Standard"}</div>
                    {row.platformFeeNote ? <div className="mt-1 text-xs text-slate-500">{row.platformFeeNote}</div> : null}
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    <div>{row.offersCount}</div>
                    <div className="text-xs text-slate-500">{row.publishedOffersCount} veroeffentlicht</div>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{row.bookingsCount}</td>
                  <td className="px-3 py-3 text-slate-700">{formatDateTime(row.lastActivityAt)}</td>
                  <td className="px-3 py-3">
                    <StatusBadge value={row.testStatus} />
                  </td>
                  <td className="px-3 py-3">
                    <details className="min-w-72 rounded-lg border border-slate-200 bg-white p-3">
                      <summary className="cursor-pointer text-sm font-medium text-slate-900">Bearbeiten</summary>
                      <div className="mt-3 space-y-3">
                        <form action={updateProviderPlatformFeeOverrideAction} className="grid gap-2">
                          <input type="hidden" name="providerId" value={row.id} />
                          <label className="grid gap-1 text-xs font-medium text-slate-600">
                            Plattformgebuehr (%)
                            <input
                              name="platformFeePercent"
                              type="text"
                              inputMode="decimal"
                              defaultValue={formatPercentInputValue(row.platformFeePercent)}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                              disabled={!row.payoutProfileId}
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-medium text-slate-600">
                            Notiz
                            <input
                              name="note"
                              type="text"
                              defaultValue={row.platformFeeNote ?? ""}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                              disabled={!row.payoutProfileId}
                            />
                          </label>
                          <button
                            type="submit"
                            disabled={!row.payoutProfileId}
                            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            Plattformgebuehr speichern
                          </button>
                        </form>
                        <form action={updateProviderPlatformFeeOverrideAction}>
                          <input type="hidden" name="providerId" value={row.id} />
                          <input type="hidden" name="resetToDefault" value="1" />
                          <button
                            type="submit"
                            disabled={!row.platformFeeIsOverride || !row.payoutProfileId}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
                          >
                            Standard setzen
                          </button>
                        </form>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Link href={`/dashboard/admin/providers?provider=${row.id}#provider`} className="text-slate-700 underline">
                            Anbieter*in ansehen
                          </Link>
                          <Link href={`/dashboard/admin/providers?provider=${row.id}#offers`} className="text-slate-700 underline">
                            Angebote ansehen
                          </Link>
                        </div>
                        {!row.payoutProfileId ? (
                          <p className="text-xs text-amber-700">
                            Plattformgebuehr erst bearbeitbar, sobald ein Auszahlungprofil existiert.
                          </p>
                        ) : null}
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="p-6 text-sm text-slate-600">Noch keine Anbieter*innen gefunden.</p> : null}
        </div>
      </Section>

      {selectedRow ? (
        <Section
          title="Ausgewählte Anbieter*in"
          description="Kompakte Admin-Detailansicht für den aktuell ausgewählten Datensatz."
        >
          <div id="provider" className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Name / Firma</p>
              <p className="mt-1 font-medium text-slate-900">{selectedRow.name}</p>
              <p className="text-xs text-slate-500">{selectedRow.email}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Profil / Auszahlung</p>
              <p className="mt-1 text-sm text-slate-700">
                Profil {selectedRow.profileComplete ? "vollständig" : "offen"} · {selectedRow.payoutMethodLabel}
              </p>
              <p className="text-xs text-slate-500">{selectedRow.vatStatusLabel}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Gebühr / Status</p>
              <p className="mt-1 text-sm text-slate-700">
                {formatPercentValue(selectedRow.platformFeePercent)} ·{" "}
                {selectedRow.platformFeeIsOverride ? "individuell" : "Standard"}
              </p>
              <p className="text-xs text-slate-500">{selectedRow.testStatus}</p>
            </div>
          </div>

          <div id="offers" className="mt-6 overflow-x-auto">
            <h3 className="mb-3 text-base font-semibold text-slate-900">Angebote</h3>
            {selectedCourses.length > 0 ? (
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Titel</th>
                    <th className="px-3 py-2">Typ</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Veröffentlicht</th>
                    <th className="px-3 py-2">Aktion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedCourses.map((course) => (
                    <tr key={course.id}>
                      <td className="px-3 py-3 font-medium text-slate-900">{course.title || "Ohne Titel"}</td>
                      <td className="px-3 py-3 text-slate-700">{formatOfferKind(course.kind)}</td>
                      <td className="px-3 py-3">
                        <StatusBadge value={course.status ?? "-"} />
                      </td>
                      <td className="px-3 py-3 text-slate-700">{course.is_published ? "ja" : "nein"}</td>
                      <td className="px-3 py-3">
                        <Link href={`/courses/${course.id}`} className="text-sm text-slate-700 underline">
                          Öffentlich ansehen
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-slate-600">Keine Angebote vorhanden.</p>
            )}
          </div>
        </Section>
      ) : null}
    </main>
  );
}
