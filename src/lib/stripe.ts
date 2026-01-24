// src/lib/stripe.ts
import Stripe from "stripe";

let stripe: Stripe | null = null;

export function getStripe() {
  if (stripe) return stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY fehlt. Prüfe: .env.local im Projekt-Root + Dev-Server komplett neu gestartet."
    );
  }

  stripe = new Stripe(key, {
    // Falls TypeScript meckert, ist das ok – Stripe Types hinken manchmal hinterher.
    apiVersion: "2024-06-20" as any,
  });

  return stripe;
}
