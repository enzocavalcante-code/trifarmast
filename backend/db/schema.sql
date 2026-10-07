-- =============================================================
-- Trifarmas — esquema do banco (PostgreSQL)
-- Executado automaticamente ao iniciar o servidor (idempotente).
-- =============================================================

-- ---------- Catálogo ----------
CREATE TABLE IF NOT EXISTS pharmacies (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  dist_km   NUMERIC(5,2) NOT NULL,
  domain    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS medicines (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  owner_id    INTEGER,                     -- NULL = catálogo público; preenchido = remédio adicionado por um usuário
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS medicine_prices (
  medicine_id  TEXT NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  pharmacy_id  TEXT NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  price        NUMERIC(10,2) NOT NULL,
  PRIMARY KEY (medicine_id, pharmacy_id)
);

CREATE TABLE IF NOT EXISTS rewards (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  cost         INTEGER NOT NULL
);

-- ---------- Usuários ----------
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT,                    -- NULL para contas Google
  google_account  BOOLEAN NOT NULL DEFAULT FALSE,
  avatar          TEXT,                    -- URL ou data URL da foto
  points          INTEGER NOT NULL DEFAULT 0,
  welcome_seen    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE medicines
    ADD CONSTRAINT medicines_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- Pedidos ----------
CREATE TABLE IF NOT EXISTS orders (
  id              BIGSERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  medicine_name   TEXT NOT NULL,
  pharmacy_name   TEXT NOT NULL,
  price           NUMERIC(10,2) NOT NULL,
  points_used     INTEGER NOT NULL DEFAULT 0,
  discount        NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid_amount     NUMERIC(10,2) NOT NULL,
  payment_method  TEXT NOT NULL,
  points_earned   INTEGER NOT NULL,
  pickup_code     TEXT NOT NULL,
  completed       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id, created_at DESC);

-- ---------- Lembretes ----------
CREATE TABLE IF NOT EXISTS reminders (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  medicine   TEXT NOT NULL,
  time       TEXT NOT NULL,                -- "HH:MM"
  day        SMALLINT NOT NULL,
  month      SMALLINT NOT NULL,            -- 0-11 (igual ao JavaScript)
  year       SMALLINT NOT NULL,
  fired      BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS reminders_user_idx ON reminders(user_id);
