import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Admin console operators (not end customers). */
export const adminUsers = sqliteTable(
  "admin_users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["owner", "support", "finance", "readonly"] }).notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("admin_users_email_uidx").on(table.email)],
);

/** End customers identified by email account and/or device. */
export const customers = sqliteTable(
  "customers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    deviceId: text("device_id"),
    email: text("email"),
    passwordHash: text("password_hash"),
    stripeCustomerId: text("stripe_customer_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("customers_email_idx").on(table.email),
    index("customers_device_idx").on(table.deviceId),
    uniqueIndex("customers_stripe_uidx").on(table.stripeCustomerId),
  ],
);

export const pricingPlans = sqliteTable("pricing_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  durationDays: integer("duration_days").notNull().default(30),
  freeGenerationLimit: integer("free_generation_limit").notNull().default(3),
  productKey: text("product_key").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id").references(() => customers.id),
    pricingPlanId: integer("pricing_plan_id").references(() => pricingPlans.id),
    provider: text("provider").notNull().default("stripe"),
    providerPaymentId: text("provider_payment_id"),
    providerSessionId: text("provider_session_id"),
    customerEmail: text("customer_email"),
    deviceId: text("device_id"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    status: text("status", {
      enum: ["pending", "paid", "failed", "refunded", "partially_refunded", "disputed"],
    }).notNull(),
    refundedAmountCents: integer("refunded_amount_cents").notNull().default(0),
    accessStartsAt: text("access_starts_at"),
    accessEndsAt: text("access_ends_at"),
    rawSummary: text("raw_summary"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("transactions_email_idx").on(table.customerEmail),
    index("transactions_session_idx").on(table.providerSessionId),
    index("transactions_payment_idx").on(table.providerPaymentId),
    index("transactions_status_idx").on(table.status),
  ],
);

export const entitlements = sqliteTable(
  "entitlements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id").references(() => customers.id),
    deviceId: text("device_id"),
    email: text("email"),
    source: text("source", { enum: ["stripe", "manual", "promo"] }).notNull(),
    status: text("status", { enum: ["active", "expired", "revoked"] }).notNull(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    transactionId: integer("transaction_id").references(() => transactions.id),
    reason: text("reason"),
    createdByAdminId: integer("created_by_admin_id").references(() => adminUsers.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("entitlements_device_idx").on(table.deviceId),
    index("entitlements_email_idx").on(table.email),
    index("entitlements_status_idx").on(table.status),
  ],
);

/** Generation metadata only — never PDF/CSV contents. */
export const usageEvents = sqliteTable(
  "usage_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id").references(() => customers.id),
    deviceId: text("device_id"),
    sessionKey: text("session_key"),
    eventType: text("event_type", {
      enum: ["free_preview", "paid_batch", "failed_generation"],
    }).notNull(),
    rowsProcessed: integer("rows_processed").notNull().default(0),
    pdfsGenerated: integer("pdfs_generated").notNull().default(0),
    templateFilenameHash: text("template_filename_hash"),
    templateFilenameSanitized: text("template_filename_sanitized"),
    csvFilenameHash: text("csv_filename_hash"),
    csvFilenameSanitized: text("csv_filename_sanitized"),
    zipFilenameSanitized: text("zip_filename_sanitized"),
    success: integer("success", { mode: "boolean" }).notNull().default(true),
    errorCode: text("error_code"),
    userAgent: text("user_agent"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("usage_device_idx").on(table.deviceId),
    index("usage_created_idx").on(table.createdAt),
  ],
);

export const claimCases = sqliteTable(
  "claim_cases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id").references(() => customers.id),
    transactionId: integer("transaction_id").references(() => transactions.id),
    customerEmail: text("customer_email"),
    deviceId: text("device_id"),
    status: text("status", {
      enum: ["open", "investigating", "resolved", "refunded", "rejected"],
    })
      .notNull()
      .default("open"),
    subject: text("subject").notNull(),
    createdByAdminId: integer("created_by_admin_id").references(() => adminUsers.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("claims_email_idx").on(table.customerEmail),
    index("claims_status_idx").on(table.status),
  ],
);

export const adminNotes = sqliteTable("admin_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  claimCaseId: integer("claim_case_id").references(() => claimCases.id),
  transactionId: integer("transaction_id").references(() => transactions.id),
  entitlementId: integer("entitlement_id").references(() => entitlements.id),
  customerId: integer("customer_id").references(() => customers.id),
  adminUserId: integer("admin_user_id")
    .notNull()
    .references(() => adminUsers.id),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const adminAuditLogs = sqliteTable(
  "admin_audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    adminUserId: integer("admin_user_id").references(() => adminUsers.id),
    actionType: text("action_type").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    reason: text("reason"),
    metadataJson: text("metadata_json"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("audit_created_idx").on(table.createdAt)],
);

export const webhookEvents = sqliteTable(
  "webhook_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider").notNull().default("stripe"),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadSummary: text("payload_summary"),
    processed: integer("processed", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("webhook_event_uidx").on(table.eventId)],
);

export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
