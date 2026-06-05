CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE user_role AS ENUM ('employee', 'approver', 'admin');
CREATE TYPE expense_status AS ENUM ('draft', 'submitted', 'approved', 'rejected');
CREATE TYPE expense_category AS ENUM (
    'travel',
    'meals',
    'accommodation',
    'supplies',
    'entertainment',
    'communication',
    'other'
);

CREATE TABLE users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email        TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name         TEXT NOT NULL,
    role         user_role NOT NULL DEFAULT 'employee',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE expenses (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    description  TEXT,
    category     expense_category NOT NULL,
    amount_jpy   BIGINT NOT NULL CHECK (amount_jpy >= 0),
    incurred_on  DATE NOT NULL,
    status       expense_status NOT NULL DEFAULT 'draft',
    submitted_at TIMESTAMPTZ,
    decided_at   TIMESTAMPTZ,
    decided_by   UUID REFERENCES users(id),
    decision_note TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_user      ON expenses(user_id);
CREATE INDEX idx_expenses_status    ON expenses(status);
CREATE INDEX idx_expenses_incurred  ON expenses(incurred_on);

CREATE TABLE receipts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id   UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    file_name    TEXT NOT NULL,
    content_type TEXT NOT NULL,
    byte_size    BIGINT NOT NULL,
    storage_key  TEXT NOT NULL,
    uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_receipts_expense ON receipts(expense_id);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed users are inserted by the API at startup (so password hashes are real Argon2).
-- See app/api/src/seed.rs.
