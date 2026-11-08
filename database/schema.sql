-- Plus Store PostgreSQL schema - development draft
-- Run on a private PostgreSQL database with a restricted application role.
-- Authentication and authorization must be implemented server-side before production.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  description_ar text NOT NULL DEFAULT '',
  category text NOT NULL CHECK(category IN ('ios_app','signing','api','game_credit','gift_card')),
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  duration_days integer NOT NULL CHECK(duration_days > 0),
  price_fils integer CHECK(price_fils >= 0),
  currency char(3) NOT NULL DEFAULT 'AED' CHECK(currency='AED'),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES users(id),
  item_id uuid NOT NULL REFERENCES catalog_items(id),
  plan_id uuid REFERENCES plans(id),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_review','approved','rejected','fulfilled','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_customer_created_idx ON orders(customer_id,created_at DESC);
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES users(id),
  plan_id uuid NOT NULL REFERENCES plans(id),
  order_id uuid UNIQUE REFERENCES orders(id),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','expired','cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE TABLE IF NOT EXISTS signing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
  distribution_method text NOT NULL CHECK(distribution_method IN ('development','ad_hoc','app_store','custom_app','enterprise_internal')),
  status text NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','approved','rejected','processing','completed','failed')),
  -- Never store Apple private keys, certificates' secret passwords, or raw IPA blobs here.
  artifact_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
