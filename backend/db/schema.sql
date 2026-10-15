-- =============================================================
-- Trifarmas — esquema do banco (PostgreSQL)
-- Executado automaticamente ao iniciar o servidor.
-- Todas as instruções são idempotentes: criam o que falta e
-- atualizam bancos já existentes sem apagar dados.
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
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS presentation          TEXT    NOT NULL DEFAULT '';
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS active_ingredient     TEXT    NOT NULL DEFAULT '';
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS requires_prescription BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS popularity            INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS medicine_prices (
  medicine_id  TEXT NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  pharmacy_id  TEXT NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  price        NUMERIC(10,2) NOT NULL,
  PRIMARY KEY (medicine_id, pharmacy_id)
);

-- Recompensas: trocadas por pontos, viram cupons de desconto.
CREATE TABLE IF NOT EXISTS rewards (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  cost         INTEGER NOT NULL
);
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS amount    NUMERIC(10,2) NOT NULL DEFAULT 0;  -- valor do desconto em R$
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS min_order NUMERIC(10,2) NOT NULL DEFAULT 0;  -- compra mínima para usar

-- ---------- Usuários ----------
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT,                    -- NULL para contas criadas só pelo Google
  google_account  BOOLEAN NOT NULL DEFAULT FALSE,
  avatar          TEXT,                    -- foto exibida (URL ou data URL)
  points          INTEGER NOT NULL DEFAULT 0,
  welcome_seen    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_picture TEXT;                          -- última foto vinda do Google
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_custom  BOOLEAN NOT NULL DEFAULT FALSE; -- TRUE = usuário escolheu a foto manualmente

DO $$ BEGIN
  ALTER TABLE medicines
    ADD CONSTRAINT medicines_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- Pedidos ----------
CREATE TABLE IF NOT EXISTS orders (
  id              BIGSERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  medicine_name   TEXT,                    -- legado: pedidos de um item só (antes do carrinho)
  pharmacy_name   TEXT NOT NULL,
  price           NUMERIC(10,2),           -- legado
  points_used     INTEGER NOT NULL DEFAULT 0,
  discount        NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid_amount     NUMERIC(10,2) NOT NULL,
  payment_method  TEXT NOT NULL,
  points_earned   INTEGER NOT NULL,
  pickup_code     TEXT NOT NULL,
  completed       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE orders ALTER COLUMN medicine_name DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN price DROP NOT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pharmacy_id              TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal                 NUMERIC(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_name              TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS requires_prescription    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS prescription_choice      TEXT;         -- 'upload' | 'in_person'
ALTER TABLE orders ADD COLUMN IF NOT EXISTS prescription_resolved_at TIMESTAMPTZ;
-- Entrega por motoboy (simulada). Pedidos antigos continuam como retirada.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment              TEXT NOT NULL DEFAULT 'pickup';  -- 'pickup' | 'delivery'
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee             NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address         TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_km              NUMERIC(5,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_minutes         SMALLINT;      -- prazo prometido ao cliente
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_name             TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_vehicle          TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_plate            TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_rating           NUMERIC(2,1);
CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id                     BIGSERIAL PRIMARY KEY,
  order_id               BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  medicine_id            TEXT,
  name                   TEXT NOT NULL,
  presentation           TEXT NOT NULL DEFAULT '',
  quantity               SMALLINT NOT NULL,
  unit_price             NUMERIC(10,2) NOT NULL,
  requires_prescription  BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);

-- Receita anexada ao pedido (arquivo guardado como data URL).
CREATE TABLE IF NOT EXISTS prescriptions (
  order_id    BIGINT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,
  mime        TEXT NOT NULL,
  data        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Pontos ----------
CREATE TABLE IF NOT EXISTS user_coupons (
  id             BIGSERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  amount         NUMERIC(10,2) NOT NULL,
  min_order      NUMERIC(10,2) NOT NULL DEFAULT 0,
  used_order_id  BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  used_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_coupons_user_idx ON user_coupons(user_id);

CREATE TABLE IF NOT EXISTS points_history (
  id           BIGSERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta        INTEGER NOT NULL,
  description  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS points_history_user_idx ON points_history(user_id, created_at DESC);

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

-- Fotos enviadas manualmente antes da coluna avatar_custom existir continuam valendo.
UPDATE users SET avatar_custom = TRUE
 WHERE avatar LIKE 'data:%' AND avatar_custom = FALSE AND google_picture IS NULL;

-- O app não permite mais adicionar remédios fora do catálogo: remove os que foram criados antes.
DELETE FROM medicines WHERE owner_id IS NOT NULL;
