import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type AppDb = ReturnType<typeof getDb>;

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB`.",
    );
  }
  return drizzle(env.DB, { schema });
}

export async function ensureSchema(db: D1Database) {
  // Idempotent bootstrap for environments that do not auto-apply drizzle SQL yet.
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT,
        email TEXT,
        stripe_customer_id TEXT UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`CREATE INDEX IF NOT EXISTS customers_email_idx ON customers(email)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS customers_device_idx ON customers(device_id)`),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS pricing_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'usd',
        duration_days INTEGER NOT NULL DEFAULT 30,
        free_generation_limit INTEGER NOT NULL DEFAULT 3,
        product_key TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER REFERENCES customers(id),
        pricing_plan_id INTEGER REFERENCES pricing_plans(id),
        provider TEXT NOT NULL DEFAULT 'stripe',
        provider_payment_id TEXT,
        provider_session_id TEXT,
        customer_email TEXT,
        device_id TEXT,
        amount_cents INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'usd',
        status TEXT NOT NULL,
        refunded_amount_cents INTEGER NOT NULL DEFAULT 0,
        access_starts_at TEXT,
        access_ends_at TEXT,
        raw_summary TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`CREATE INDEX IF NOT EXISTS transactions_email_idx ON transactions(customer_email)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS transactions_session_idx ON transactions(provider_session_id)`),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS entitlements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER REFERENCES customers(id),
        device_id TEXT,
        email TEXT,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        transaction_id INTEGER REFERENCES transactions(id),
        reason TEXT,
        created_by_admin_id INTEGER REFERENCES admin_users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`CREATE INDEX IF NOT EXISTS entitlements_device_idx ON entitlements(device_id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS entitlements_status_idx ON entitlements(status)`),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS usage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER REFERENCES customers(id),
        device_id TEXT,
        session_key TEXT,
        event_type TEXT NOT NULL,
        rows_processed INTEGER NOT NULL DEFAULT 0,
        pdfs_generated INTEGER NOT NULL DEFAULT 0,
        template_filename_hash TEXT,
        template_filename_sanitized TEXT,
        csv_filename_hash TEXT,
        csv_filename_sanitized TEXT,
        zip_filename_sanitized TEXT,
        success INTEGER NOT NULL DEFAULT 1,
        error_code TEXT,
        user_agent TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`CREATE INDEX IF NOT EXISTS usage_device_idx ON usage_events(device_id)`),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS claim_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER REFERENCES customers(id),
        transaction_id INTEGER REFERENCES transactions(id),
        customer_email TEXT,
        device_id TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        subject TEXT NOT NULL,
        created_by_admin_id INTEGER REFERENCES admin_users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS admin_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        claim_case_id INTEGER REFERENCES claim_cases(id),
        transaction_id INTEGER REFERENCES transactions(id),
        entitlement_id INTEGER REFERENCES entitlements(id),
        customer_id INTEGER REFERENCES customers(id),
        admin_user_id INTEGER NOT NULL REFERENCES admin_users(id),
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_user_id INTEGER REFERENCES admin_users(id),
        action_type TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT,
        reason TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL DEFAULT 'stripe',
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        payload_summary TEXT,
        processed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
  ]);
}
