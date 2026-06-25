alter table public.bookings
  add column if not exists customer_billing_name text,
  add column if not exists customer_billing_street text,
  add column if not exists customer_billing_house_number text,
  add column if not exists customer_billing_postal_code text,
  add column if not exists customer_billing_city text,
  add column if not exists customer_billing_country text;
