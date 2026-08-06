import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type AppDb = ReturnType<typeof drizzle>;

type D1LikeStatement = {
  bind(...values: unknown[]): D1LikeStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }>;
  raw<T = unknown[]>(): Promise<T[]>;
};

type D1Like = {
  prepare(query: string): D1LikeStatement;
  batch<T = unknown>(statements: D1LikeStatement[]): Promise<T[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
};

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT,
    email TEXT,
    password_hash TEXT,
    stripe_customer_id TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS customers_email_idx ON customers(email)`,
  `CREATE INDEX IF NOT EXISTS customers_device_idx ON customers(device_id)`,
  `CREATE TABLE IF NOT EXISTS pricing_plans (
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
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
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
  )`,
  `CREATE INDEX IF NOT EXISTS transactions_email_idx ON transactions(customer_email)`,
  `CREATE INDEX IF NOT EXISTS transactions_session_idx ON transactions(provider_session_id)`,
  `CREATE TABLE IF NOT EXISTS entitlements (
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
  )`,
  `CREATE INDEX IF NOT EXISTS entitlements_device_idx ON entitlements(device_id)`,
  `CREATE INDEX IF NOT EXISTS entitlements_email_idx ON entitlements(email)`,
  `CREATE INDEX IF NOT EXISTS entitlements_status_idx ON entitlements(status)`,
  `CREATE TABLE IF NOT EXISTS usage_events (
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
  )`,
  `CREATE INDEX IF NOT EXISTS usage_device_idx ON usage_events(device_id)`,
  `CREATE TABLE IF NOT EXISTS claim_cases (
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
  )`,
  `CREATE TABLE IF NOT EXISTS admin_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_case_id INTEGER REFERENCES claim_cases(id),
    transaction_id INTEGER REFERENCES transactions(id),
    entitlement_id INTEGER REFERENCES entitlements(id),
    customer_id INTEGER REFERENCES customers(id),
    admin_user_id INTEGER NOT NULL REFERENCES admin_users(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_user_id INTEGER REFERENCES admin_users(id),
    action_type TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    reason TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL DEFAULT 'stripe',
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    payload_summary TEXT,
    processed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
];

async function createNodeSqliteD1(filePath: string): Promise<D1Like> {
  const { mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  const { DatabaseSync } = await import("node:sqlite");
  mkdirSync(dirname(filePath), { recursive: true });
  const sqlite = new DatabaseSync(filePath);

  const wrap = (sql: string, bound: unknown[] = []): D1LikeStatement => {
    const statement: D1LikeStatement = {
      bind(...values: unknown[]) {
        return wrap(sql, values);
      },
      async first<T = Record<string, unknown>>(colName?: string) {
        const row = sqlite.prepare(sql).get(...(bound as never[])) as Record<string, unknown> | undefined;
        if (!row) return null;
        if (colName) return (row[colName] as T) ?? null;
        return row as T;
      },
      async run() {
        const result = sqlite.prepare(sql).run(...(bound as never[]));
        return {
          success: true,
          meta: {
            changes: Number(result.changes || 0),
            last_row_id: Number(result.lastInsertRowid || 0),
          },
        };
      },
      async all<T = Record<string, unknown>>() {
        const results = sqlite.prepare(sql).all(...(bound as never[])) as T[];
        return { results, success: true };
      },
      async raw<T = unknown[]>() {
        const statement = sqlite.prepare(sql);
        const rows = statement.all(...(bound as never[])) as Record<string, unknown>[];
        const columns =
          typeof statement.columns === "function"
            ? statement.columns().map((column) => column.name)
            : rows[0]
              ? Object.keys(rows[0])
              : [];
        return rows.map((row) => columns.map((name) => row[name])) as T[];
      },
    };
    return statement;
  };

  return {
    prepare(query: string) {
      return wrap(query);
    },
    async batch<T = unknown>(statements: D1LikeStatement[]) {
      const out: T[] = [];
      sqlite.exec("BEGIN");
      try {
        for (const statement of statements) {
          out.push((await statement.run()) as T);
        }
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
      return out;
    },
    async exec(query: string) {
      sqlite.exec(query);
      return { count: 0, duration: 0 };
    },
  };
}

async function resolveD1Binding(): Promise<D1Like | null> {
  try {
    const workers = await import("cloudflare:workers");
    const db = workers.env?.DB as D1Like | undefined;
    return db || null;
  } catch {
    return null;
  }
}

function resolveSqlitePath() {
  const configured = process.env.ADMIN_SQLITE_PATH || "./data/admin.sqlite";
  // Keep path resolution local to Node; Workers never reach this fallback.
  return configured.startsWith("/") ? configured : `${process.cwd()}/${configured}`;
}

let cachedClient: D1Like | null = null;
let cachedDb: AppDb | null = null;

export async function getDbClient() {
  if (cachedClient) return cachedClient;
  const d1 = await resolveD1Binding();
  cachedClient = d1 || (await createNodeSqliteD1(resolveSqlitePath()));
  return cachedClient;
}

export async function getDb() {
  if (cachedDb) return cachedDb;
  const client = await getDbClient();
  cachedDb = drizzle(client as unknown as D1Database, { schema });
  return cachedDb;
}

export async function ensureSchema(client?: D1Like | D1Database) {
  const db = (client || (await getDbClient())) as D1Like;
  const statements = SCHEMA_STATEMENTS.map((sql) => db.prepare(sql));
  await db.batch(statements);
  // Existing Droplet DBs created before password accounts need this column.
  try {
    await db.prepare("ALTER TABLE customers ADD COLUMN password_hash TEXT").run();
  } catch {
    /* column already exists */
  }
}
