-- gen_random_uuid() is built into PostgreSQL 13+; no contrib extension is required.

CREATE TABLE plans (
    id text PRIMARY KEY CHECK (id IN ('trial', 'basic', 'medium', 'premium')),
    max_products integer NOT NULL CHECK (max_products = -1 OR max_products > 0),
    max_employees integer NOT NULL CHECK (max_employees = -1 OR max_employees >= 0),
    max_stores integer NOT NULL CHECK (max_stores = -1 OR max_stores > 0),
    debts boolean NOT NULL,
    financials boolean NOT NULL,
    employees boolean NOT NULL,
    multi_store boolean NOT NULL
);
INSERT INTO plans VALUES
    ('trial', 250, 0, 1, false, false, false, false),
    ('basic', 1000, 0, 1, false, false, false, false),
    ('medium', 10000, 15, 1, true, true, true, false),
    ('premium', -1, -1, -1, true, true, true, true);

CREATE TABLE organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
    plan_id text NOT NULL REFERENCES plans(id),
    subscription_expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE stores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
    address text NOT NULL DEFAULT '' CHECK (length(address) <= 500),
    code varchar(12) NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{8}$'),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id)
);
CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    store_id uuid,
    role text NOT NULL CHECK (role IN ('owner', 'employee')),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
    phone text NOT NULL UNIQUE CHECK (phone ~ '^\+216[234579][0-9]{7}$'),
    password_hash text,
    access_code_hash text,
    permissions jsonb NOT NULL DEFAULT '{"products":true,"stock":true,"sales":true,"orders":true,"debts":false}'::jsonb CHECK (jsonb_typeof(permissions) = 'object'),
    daily_wage_milliemes bigint NOT NULL DEFAULT 0 CHECK (daily_wage_milliemes BETWEEN 0 AND 1000000000),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id),
    FOREIGN KEY (organization_id, store_id) REFERENCES stores(organization_id, id),
    CHECK ((role = 'owner' AND store_id IS NULL AND password_hash IS NOT NULL AND access_code_hash IS NULL)
        OR (role = 'employee' AND store_id IS NOT NULL AND access_code_hash IS NOT NULL AND password_hash IS NULL))
);
CREATE TABLE sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash char(64) NOT NULL UNIQUE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES organizations(id),
    store_id uuid NOT NULL,
    expires_at timestamptz NOT NULL,
    idle_expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, store_id) REFERENCES stores(organization_id, id)
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE auth_rate_limits (
    key text PRIMARY KEY,
    attempts integer NOT NULL CHECK (attempts > 0),
    window_started_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    store_id uuid NOT NULL,
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    barcode text CHECK (length(barcode) BETWEEN 1 AND 64),
    category text NOT NULL DEFAULT '' CHECK (length(category) <= 100),
    cost_milliemes bigint NOT NULL CHECK (cost_milliemes BETWEEN 0 AND 1000000000000),
    stock integer NOT NULL DEFAULT 0 CHECK (stock BETWEEN 0 AND 1000000000),
    min_stock integer NOT NULL DEFAULT 5 CHECK (min_stock BETWEEN 0 AND 1000000000),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, store_id, id),
    FOREIGN KEY (organization_id, store_id) REFERENCES stores(organization_id, id)
);
CREATE UNIQUE INDEX products_barcode_idx ON products(organization_id, store_id, barcode) WHERE barcode IS NOT NULL AND active;
CREATE INDEX products_name_idx ON products(organization_id, store_id, lower(name));
CREATE INDEX products_store_idx ON products(organization_id, store_id, active, created_at DESC);
CREATE INDEX products_low_stock_idx ON products(organization_id, store_id, stock) WHERE active;

CREATE TABLE orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    store_id uuid NOT NULL,
    number bigint NOT NULL CHECK (number > 0),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','preparing','ready','delivered','cancelled')),
    customer_name text NOT NULL CHECK (length(customer_name) BETWEEN 1 AND 160),
    customer_phone text NOT NULL DEFAULT '' CHECK (length(customer_phone) <= 32),
    address text NOT NULL DEFAULT '' CHECK (length(address) <= 500),
    note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
    delivery_fee_milliemes bigint NOT NULL DEFAULT 0 CHECK (delivery_fee_milliemes BETWEEN 0 AND 1000000000000),
    subtotal_milliemes bigint NOT NULL DEFAULT 0 CHECK (subtotal_milliemes BETWEEN 0 AND 100000000000000),
    actor_id uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, store_id, id),
    UNIQUE (organization_id, store_id, number),
    FOREIGN KEY (organization_id, store_id) REFERENCES stores(organization_id, id)
);
CREATE INDEX orders_store_idx ON orders(organization_id, store_id, created_at DESC);
CREATE INDEX orders_status_idx ON orders(organization_id, store_id, status);
CREATE TABLE order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    store_id uuid NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100000),
    unit_price_milliemes bigint CHECK (unit_price_milliemes BETWEEN 1 AND 1000000000000),
    UNIQUE (order_id, product_id),
    FOREIGN KEY (organization_id, store_id, order_id) REFERENCES orders(organization_id, store_id, id),
    FOREIGN KEY (organization_id, store_id, product_id) REFERENCES products(organization_id, store_id, id)
);
CREATE TABLE sales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    store_id uuid NOT NULL,
    number bigint NOT NULL CHECK (number > 0),
    customer_name text NOT NULL DEFAULT '' CHECK (length(customer_name) <= 160),
    payment_method text NOT NULL CHECK (payment_method IN ('cash','card','transfer')),
    subtotal_milliemes bigint NOT NULL CHECK (subtotal_milliemes BETWEEN 0 AND 100000000000000),
    cost_milliemes bigint NOT NULL CHECK (cost_milliemes BETWEEN 0 AND 100000000000000),
    delivery_fee_milliemes bigint NOT NULL DEFAULT 0 CHECK (delivery_fee_milliemes BETWEEN 0 AND 1000000000000),
    total_milliemes bigint NOT NULL CHECK (total_milliemes BETWEEN 0 AND 100000000000000 AND total_milliemes = subtotal_milliemes + delivery_fee_milliemes),
    order_id uuid,
    actor_id uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, store_id, id),
    UNIQUE (organization_id, store_id, number),
    UNIQUE (order_id),
    FOREIGN KEY (organization_id, store_id) REFERENCES stores(organization_id, id),
    FOREIGN KEY (organization_id, store_id, order_id) REFERENCES orders(organization_id, store_id, id)
);
ALTER TABLE orders ADD COLUMN sale_id uuid;
ALTER TABLE orders ADD FOREIGN KEY (organization_id, store_id, sale_id) REFERENCES sales(organization_id, store_id, id);
CREATE INDEX sales_store_idx ON sales(organization_id, store_id, created_at DESC);
CREATE TABLE sale_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    store_id uuid NOT NULL,
    sale_id uuid NOT NULL,
    product_id uuid NOT NULL,
    product_name text NOT NULL,
    quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100000),
    unit_price_milliemes bigint NOT NULL CHECK (unit_price_milliemes BETWEEN 1 AND 1000000000000),
    unit_cost_milliemes bigint NOT NULL CHECK (unit_cost_milliemes BETWEEN 0 AND 1000000000000),
    FOREIGN KEY (organization_id, store_id, sale_id) REFERENCES sales(organization_id, store_id, id),
    FOREIGN KEY (organization_id, store_id, product_id) REFERENCES products(organization_id, store_id, id)
);
CREATE INDEX sale_items_sale_idx ON sale_items(sale_id);
CREATE TABLE stock_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    store_id uuid NOT NULL,
    product_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('opening','receipt','sale','damage')),
    quantity_delta integer NOT NULL CHECK (quantity_delta <> 0),
    unit_cost_milliemes bigint NOT NULL CHECK (unit_cost_milliemes BETWEEN 0 AND 1000000000000),
    reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 100),
    supplier text NOT NULL DEFAULT '' CHECK (length(supplier) <= 160),
    invoice_ref text NOT NULL DEFAULT '' CHECK (length(invoice_ref) <= 160),
    reference_id uuid,
    actor_id uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, store_id, product_id) REFERENCES products(organization_id, store_id, id)
);
CREATE INDEX stock_movements_store_idx ON stock_movements(organization_id, store_id, created_at DESC);
CREATE INDEX stock_movements_product_idx ON stock_movements(product_id, created_at DESC);

CREATE TABLE debts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    store_id uuid NOT NULL,
    customer_name text NOT NULL CHECK (length(customer_name) BETWEEN 1 AND 160),
    customer_phone text NOT NULL DEFAULT '' CHECK (length(customer_phone) <= 32),
    note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
    total_milliemes bigint NOT NULL CHECK (total_milliemes BETWEEN 1 AND 1000000000000),
    amount_paid_milliemes bigint NOT NULL DEFAULT 0 CHECK (amount_paid_milliemes BETWEEN 0 AND total_milliemes),
    due_date date,
    archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, store_id, id),
    FOREIGN KEY (organization_id, store_id) REFERENCES stores(organization_id, id)
);
CREATE INDEX debts_store_idx ON debts(organization_id, store_id, archived, due_date);
CREATE TABLE debt_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    store_id uuid NOT NULL,
    debt_id uuid NOT NULL,
    amount_milliemes bigint NOT NULL CHECK (amount_milliemes BETWEEN 1 AND 1000000000000),
    actor_id uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, store_id, debt_id) REFERENCES debts(organization_id, store_id, id)
);
CREATE INDEX debt_payments_debt_idx ON debt_payments(debt_id, created_at DESC);
CREATE TABLE store_counters (
    organization_id uuid NOT NULL,
    store_id uuid NOT NULL,
    next_sale bigint NOT NULL DEFAULT 1 CHECK (next_sale > 0),
    next_order bigint NOT NULL DEFAULT 1 CHECK (next_order > 0),
    PRIMARY KEY (organization_id, store_id),
    FOREIGN KEY (organization_id, store_id) REFERENCES stores(organization_id, id)
);
CREATE TABLE idempotency_keys (
    organization_id uuid NOT NULL,
    store_id uuid NOT NULL,
    user_id uuid NOT NULL REFERENCES users(id),
    key uuid NOT NULL,
    request_hash char(64) NOT NULL,
    response jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, store_id, user_id, key),
    FOREIGN KEY (organization_id, store_id) REFERENCES stores(organization_id, id)
);
CREATE TABLE audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    store_id uuid,
    actor_id uuid REFERENCES users(id),
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, store_id) REFERENCES stores(organization_id, id)
);
CREATE INDEX audit_events_org_idx ON audit_events(organization_id, created_at DESC);
CREATE TABLE billing_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    store_id uuid NOT NULL,
    requested_by uuid NOT NULL REFERENCES users(id),
    plan_id text NOT NULL REFERENCES plans(id) CHECK (plan_id <> 'trial'),
    message text NOT NULL DEFAULT '' CHECK (length(message) <= 2000),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','contacted','closed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, store_id) REFERENCES stores(organization_id, id)
);
CREATE TABLE billing_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    plan_id text NOT NULL REFERENCES plans(id),
    payment_reference text NOT NULL UNIQUE CHECK (length(payment_reference) BETWEEN 3 AND 200),
    days integer NOT NULL CHECK (days BETWEEN 1 AND 366),
    previous_expires_at timestamptz NOT NULL,
    new_expires_at timestamptz NOT NULL,
    operator text NOT NULL CHECK (length(operator) BETWEEN 3 AND 160),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- The runtime role is non-owner. Missing session context denies business rows.
-- Authentication tables are deliberately accessible only through the API's auth code.
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['organizations','stores','products','orders','order_items','sales','sale_items','stock_movements','debts','debt_payments','store_counters','idempotency_keys','audit_events','billing_requests','billing_events'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        IF t = 'organizations' THEN
            EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid) WITH CHECK (id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid)', t);
        ELSIF t IN ('stores','audit_events','billing_requests','billing_events') THEN
            EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid)', t);
        ELSE
            EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid AND store_id = NULLIF(current_setting(''app.store_id'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid AND store_id = NULLIF(current_setting(''app.store_id'', true), '''')::uuid)', t);
        END IF;
    END LOOP;
END $$;

-- Append-only history: no UPDATE/DELETE policies for the forced-RLS runtime role.
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['sales','sale_items','stock_movements','debt_payments','audit_events','idempotency_keys'] LOOP
        EXECUTE format('DROP POLICY tenant_isolation ON %I', t);
        EXECUTE format('CREATE POLICY tenant_read ON %I FOR SELECT USING (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid AND store_id = NULLIF(current_setting(''app.store_id'', true), '''')::uuid)', t);
        EXECUTE format('CREATE POLICY tenant_insert ON %I FOR INSERT WITH CHECK (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid AND store_id = NULLIF(current_setting(''app.store_id'', true), '''')::uuid)', t);
    END LOOP;
END $$;
-- These two tables have no store-scoped read policy requirement.
DROP POLICY tenant_read ON audit_events;
DROP POLICY tenant_insert ON audit_events;
CREATE POLICY tenant_read ON audit_events FOR SELECT USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY tenant_insert ON audit_events FOR INSERT WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
DROP POLICY tenant_isolation ON billing_events;
CREATE POLICY operator_read ON billing_events FOR SELECT USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY operator_insert ON billing_events FOR INSERT WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
