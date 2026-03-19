alter table public.trial_reservations
  add column if not exists converted_at timestamptz,
  add column if not exists converted_registration_intent_id uuid references public.course_registration_intents(id);
