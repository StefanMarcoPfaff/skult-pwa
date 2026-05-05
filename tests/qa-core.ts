import assert from "node:assert/strict";
import {
  formatCourseLifecycleDate,
  getBerlinTodayDate,
  getFirstDayOfNextMonthDate,
  getLastDayOfMonthDate,
  getNextPossiblePauseDate,
  isCourseOpenForNewRegistrations,
  isFirstDayOfMonthDate,
  isLastDayOfMonthDate,
  resolveDashboardCourseStatus,
  toCourseLifecycleDate,
} from "../src/lib/course-lifecycle-shared";
import {
  getCourseSubscriptionBillingCycleAnchor,
  getCourseSubscriptionCheckoutCurrencyError,
  isCourseSubscriptionCheckoutCurrencySupported,
  normalizeCourseSubscriptionCurrency,
} from "../src/lib/course-subscription-checkout";
import {
  getProfileImageMaxSizeLabel,
  validateProfileImageFile,
} from "../src/lib/profile-image-upload";
import {
  buildMailtoHref,
  buildOfferMailSubject,
  buildParticipantMailSubject,
  normalizeEmailRecipients,
  shouldWarnAboutLargeMailingGroup,
} from "../src/lib/mailto";
import {
  createSessionCheckInToken,
  verifySessionCheckInToken,
} from "../src/lib/session-checkin-token";
import { getSiteUrl } from "../src/lib/site-url";

type TestCase = {
  name: string;
  run: () => void;
};

function withEnv<T>(overrides: Record<string, string | undefined>, run: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

const cases: TestCase[] = [
  {
    name: "site-url normalizes configured domains and strips trailing slash",
    run() {
      withEnv(
        {
          NEXT_PUBLIC_SITE_URL: "getreser.app/",
          VERCEL_PROJECT_PRODUCTION_URL: undefined,
          VERCEL_URL: undefined,
        },
        () => {
          assert.equal(getSiteUrl(), "https://getreser.app");
        }
      );
    },
  },
  {
    name: "site-url falls back to Vercel production URL when explicit site URL is missing",
    run() {
      withEnv(
        {
          NEXT_PUBLIC_SITE_URL: undefined,
          VERCEL_PROJECT_PRODUCTION_URL: "preview.getreser.app/",
          VERCEL_URL: undefined,
        },
        () => {
          assert.equal(getSiteUrl(), "https://preview.getreser.app");
        }
      );
    },
  },
  {
    name: "profile image validation accepts supported images and normalizes jpeg extension",
    run() {
      const result = validateProfileImageFile({
        size: 1024,
        type: "image/jpeg",
        name: "portrait.jpeg",
      });

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.normalizedExtension, "jpeg");
      }
      assert.equal(getProfileImageMaxSizeLabel(), "5 MB");
    },
  },
  {
    name: "profile image validation rejects oversized and invalid files",
    run() {
      const tooLarge = validateProfileImageFile({
        size: 5 * 1024 * 1024 + 1,
        type: "image/png",
        name: "avatar.png",
      });
      assert.deepEqual(tooLarge, {
        ok: false,
        error: "Das Bild ist zu gross. Bitte waehle eine kleinere Datei.",
        reason: "file_too_large",
      });

      const invalidType = validateProfileImageFile({
        size: 4096,
        type: "image/gif",
        name: "avatar.gif",
      });
      assert.deepEqual(invalidType, {
        ok: false,
        error: "Dieses Dateiformat wird nicht unterstuetzt. Bitte nutze JPG, PNG oder WebP.",
        reason: "invalid_type",
      });
    },
  },
  {
    name: "course lifecycle date helpers enforce month boundaries",
    run() {
      assert.equal(isLastDayOfMonthDate("2026-02-28"), true);
      assert.equal(isLastDayOfMonthDate("2026-02-27"), false);
      assert.equal(isFirstDayOfMonthDate("2026-03-01"), true);
      assert.equal(isFirstDayOfMonthDate("2026-03-02"), false);
      assert.equal(getFirstDayOfNextMonthDate("2026-12-31"), "2027-01-01");
      assert.equal(getLastDayOfMonthDate(2026, 2), "2026-02-28");
      assert.equal(toCourseLifecycleDate("2026-02-30"), null);
      assert.equal(formatCourseLifecycleDate("2026-03-01"), "01.03.2026");
    },
  },
  {
    name: "course lifecycle status helpers stay consistent for dashboard and registration gating",
    run() {
      const now = new Date("2026-05-02T12:00:00.000Z");

      assert.equal(
        resolveDashboardCourseStatus({
          status: null,
          isPublished: true,
          endsAt: null,
        }),
        "active"
      );

      assert.equal(
        resolveDashboardCourseStatus({
          status: null,
          isPublished: false,
          endsAt: "2026-05-01T10:00:00.000Z",
        }),
        "ended"
      );

      assert.equal(isCourseOpenForNewRegistrations("active", null, now), true);
      assert.equal(isCourseOpenForNewRegistrations("draft", null, now), false);
      assert.equal(
        isCourseOpenForNewRegistrations("active", "2026-06-01T00:00:00.000Z", now),
        true
      );
      assert.equal(
        isCourseOpenForNewRegistrations("active", "2026-05-01T00:00:00.000Z", now),
        false
      );
      assert.equal(isCourseOpenForNewRegistrations("pause_scheduled", "invalid", now), false);
    },
  },
  {
    name: "course subscription checkout stays on EUR and anchors to the next month start",
    run() {
      assert.equal(normalizeCourseSubscriptionCurrency(" eur "), "EUR");
      assert.equal(isCourseSubscriptionCheckoutCurrencySupported("eur"), true);
      assert.equal(
        getCourseSubscriptionCheckoutCurrencyError("usd"),
        "Dieser Kurs ist aktuell nur fuer Subscription-Checkout in EUR freigegeben. Hinterlegt ist derzeit USD."
      );

      const anchor = getCourseSubscriptionBillingCycleAnchor(new Date("2026-05-20T12:00:00.000Z"));
      assert.equal(new Date(anchor * 1000).toISOString(), "2026-05-31T22:00:00.000Z");
    },
  },
  {
    name: "berlin date helpers are stable for same-day lifecycle scheduling",
    run() {
      const reference = new Date("2026-05-02T12:00:00.000Z");
      assert.equal(getBerlinTodayDate(reference), "2026-05-02");
      assert.equal(getNextPossiblePauseDate(reference), "2026-05-31");
    },
  },
  {
    name: "mailto helper deduplicates recipients and encodes bcc plus subject safely",
    run() {
      const recipients = normalizeEmailRecipients([
        "Test@Example.com ",
        "test@example.com",
        "",
        null,
        "zwei@example.com",
      ]);

      assert.deepEqual(recipients, ["test@example.com", "zwei@example.com"]);

      const href = buildMailtoHref({
        bcc: recipients,
        subject: buildOfferMailSubject("workshop", "Malen & Musik"),
      });

      assert.equal(
        href,
        "mailto:?subject=Information%20zu%20deinem%20Workshop%3A%20Malen%20%26%20Musik&bcc=test%40example.com%2Czwei%40example.com"
      );
    },
  },
  {
    name: "mailto helper supports participant emails and large-group warnings",
    run() {
      const href = buildMailtoHref({
        to: ["teilnehmer@example.com"],
        subject: buildParticipantMailSubject("Yoga für Anfänger"),
      });

      assert.equal(
        href,
        "mailto:teilnehmer%40example.com?subject=Information%20zu%20deiner%20Buchung%3A%20Yoga%20f%C3%BCr%20Anf%C3%A4nger"
      );
      assert.equal(shouldWarnAboutLargeMailingGroup(5, href), false);
      assert.equal(shouldWarnAboutLargeMailingGroup(40, href), true);
    },
  },
  {
    name: "session check-in tokens are signed and scoped to one event",
    run() {
      const token = withEnv(
        { ATTENDANCE_QR_SECRET: "test-secret" },
        () =>
          createSessionCheckInToken({
            courseId: "course-1",
            sessionId: "session-1",
            eventDate: "2026-05-05",
            expiresAt: new Date(Date.now() + 60_000),
          })
      );

      const verified = withEnv({ ATTENDANCE_QR_SECRET: "test-secret" }, () =>
        verifySessionCheckInToken(token)
      );

      assert.equal(verified?.courseId, "course-1");
      assert.equal(verified?.sessionId, "session-1");
      assert.equal(verified?.eventDate, "2026-05-05");
    },
  },
];

let passed = 0;
for (const testCase of cases) {
  testCase.run();
  passed += 1;
  console.log(`PASS ${testCase.name}`);
}

console.log(`Executed ${passed} QA assertions.`);
