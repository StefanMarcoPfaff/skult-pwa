import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { courseId } = (await req.json()) as { courseId?: string };
    if (!courseId) return NextResponse.json({ error: "courseId fehlt" }, { status: 400 });

    const supabase = await createClient();
    const { data: course, error } = await supabase
      .from("courses_lite")
      .select("id,title,price_type,price_cents,currency,offer_type")
      .eq("id", courseId)
      .single();

    if (error || !course) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    if (course.offer_type !== "workshop")
      return NextResponse.json({ error: "Checkout nur für Workshops (V1)" }, { status: 400 });
    if (course.price_type !== "paid" || !course.price_cents || course.price_cents <= 0)
      return NextResponse.json({ error: "Workshop nicht paid konfiguriert" }, { status: 400 });

    const stripe = getStripe();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: (course.currency || "EUR").toLowerCase(),
            unit_amount: course.price_cents,
            product_data: { name: course.title || "Workshop" },
          },
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/checkout/success?courseId=${course.id}`,
      cancel_url: `${siteUrl}/checkout/cancel?courseId=${course.id}`,
      metadata: { courseId: course.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Serverfehler" }, { status: 500 });
  }
}
