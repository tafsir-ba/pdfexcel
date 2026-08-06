import { and, desc, eq, gte, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { ensureSchema, getDb, type AppDb } from "../db";
import {
  adminAuditLogs,
  adminNotes,
  adminUsers,
  appSettings,
  claimCases,
  customers,
  entitlements,
  pricingPlans,
  transactions,
  usageEvents,
  webhookEvents,
} from "../db/schema";
import {
  can,
  createSessionToken,
  hashPassword,
  parseCookies,
  readSessionToken,
  SESSION_COOKIE,
  type AdminRole,
  type AdminSession,
  verifyPassword,
} from "./admin-auth";

export async function withAdminDb<T>(fn: (db: AppDb) => Promise<T>) {
  await ensureSchema(env.DB);
  const db = getDb();
  await bootstrapAdmin(db);
  await bootstrapPricing(db);
  await seedDemoIfRequested(db);
  return fn(db);
}

async function bootstrapAdmin(db: AppDb) {
  const existing = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);
  if (existing.length) return;
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !password) return;
  await db.insert(adminUsers).values({
    email,
    passwordHash: await hashPassword(password),
    role: "owner",
    active: true,
  });
}

async function bootstrapPricing(db: AppDb) {
  const existing = await db.select({ id: pricingPlans.id }).from(pricingPlans).limit(1);
  if (existing.length) return;
  await db.insert(pricingPlans).values({
    name: "PDF Mail Merge 30-day access",
    amountCents: 1900,
    currency: "usd",
    durationDays: 30,
    freeGenerationLimit: 3,
    productKey: "formbatch_30_day_access",
    active: true,
    archived: false,
  });
  await db.insert(appSettings).values({
    key: "retention_days",
    value: "730",
  });
}

export async function requireAdmin(
  request: Request,
  permission?: string,
): Promise<{ session: AdminSession; db: AppDb } | Response> {
  return withAdminDb(async (db) => {
    const cookies = parseCookies(request.headers.get("cookie"));
    const session = await readSessionToken(cookies[SESSION_COOKIE]);
    if (!session) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    const [admin] = await db
      .select()
      .from(adminUsers)
      .where(and(eq(adminUsers.id, session.adminId), eq(adminUsers.active, true)))
      .limit(1);
    if (!admin) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    const role = admin.role as AdminRole;
    if (permission && !can(role, permission)) {
      return Response.json({ error: "Forbidden." }, { status: 403 });
    }
    return {
      session: { adminId: admin.id, email: admin.email, role, exp: session.exp },
      db,
    };
  });
}

export async function writeAudit(
  db: AppDb,
  input: {
    adminUserId?: number | null;
    actionType: string;
    targetType: string;
    targetId?: string | number | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(adminAuditLogs).values({
    adminUserId: input.adminUserId ?? null,
    actionType: input.actionType,
    targetType: input.targetType,
    targetId: input.targetId == null ? null : String(input.targetId),
    reason: input.reason ?? null,
    metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
  });
}

export async function loginAdmin(email: string, password: string) {
  return withAdminDb(async (db) => {
    const normalized = email.trim().toLowerCase();
    const [admin] = await db
      .select()
      .from(adminUsers)
      .where(and(eq(adminUsers.email, normalized), eq(adminUsers.active, true)))
      .limit(1);
    if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
      return null;
    }
    const token = await createSessionToken({
      adminId: admin.id,
      email: admin.email,
      role: admin.role as AdminRole,
    });
    await writeAudit(db, {
      adminUserId: admin.id,
      actionType: "admin.login",
      targetType: "admin_user",
      targetId: admin.id,
    });
    return { token, admin };
  });
}

export async function upsertCustomer(
  db: AppDb,
  input: { deviceId?: string | null; email?: string | null; stripeCustomerId?: string | null },
) {
  const email = input.email?.trim().toLowerCase() || null;
  const deviceId = input.deviceId?.trim() || null;
  const stripeCustomerId = input.stripeCustomerId?.trim() || null;

  if (stripeCustomerId) {
    const [byStripe] = await db
      .select()
      .from(customers)
      .where(eq(customers.stripeCustomerId, stripeCustomerId))
      .limit(1);
    if (byStripe) {
      await db
        .update(customers)
        .set({
          email: email || byStripe.email,
          deviceId: deviceId || byStripe.deviceId,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(customers.id, byStripe.id));
      return byStripe.id;
    }
  }

  if (email) {
    const [byEmail] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
    if (byEmail) {
      await db
        .update(customers)
        .set({
          deviceId: deviceId || byEmail.deviceId,
          stripeCustomerId: stripeCustomerId || byEmail.stripeCustomerId,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(customers.id, byEmail.id));
      return byEmail.id;
    }
  }

  if (deviceId) {
    const [byDevice] = await db
      .select()
      .from(customers)
      .where(eq(customers.deviceId, deviceId))
      .limit(1);
    if (byDevice) {
      await db
        .update(customers)
        .set({
          email: email || byDevice.email,
          stripeCustomerId: stripeCustomerId || byDevice.stripeCustomerId,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(customers.id, byDevice.id));
      return byDevice.id;
    }
  }

  const inserted = await db
    .insert(customers)
    .values({ deviceId, email, stripeCustomerId })
    .returning({ id: customers.id });
  return inserted[0].id;
}

async function seedDemoIfRequested(db: AppDb) {
  if (process.env.ADMIN_SEED_DEMO !== "1") return;
  const existingTx = await db.select({ id: transactions.id }).from(transactions).limit(1);
  if (existingTx.length) return;

  const customerId = await upsertCustomer(db, {
    deviceId: "demo-device-001",
    email: "demo.customer@example.com",
  });
  const startsAt = new Date().toISOString();
  const endsAt = new Date(Date.now() + 30 * 86400000).toISOString();
  const [tx] = await db
    .insert(transactions)
    .values({
      customerId,
      provider: "stripe",
      providerSessionId: "cs_demo_seed",
      providerPaymentId: "pi_demo_seed",
      customerEmail: "demo.customer@example.com",
      deviceId: "demo-device-001",
      amountCents: 1900,
      currency: "usd",
      status: "paid",
      accessStartsAt: startsAt,
      accessEndsAt: endsAt,
      rawSummary: JSON.stringify({ seed: true }),
    })
    .returning({ id: transactions.id });
  await db.insert(entitlements).values({
    customerId,
    deviceId: "demo-device-001",
    email: "demo.customer@example.com",
    source: "stripe",
    status: "active",
    startsAt,
    endsAt,
    transactionId: tx.id,
    reason: "demo_seed",
  });
  await db.insert(usageEvents).values({
    customerId,
    deviceId: "demo-device-001",
    eventType: "free_preview",
    rowsProcessed: 3,
    pdfsGenerated: 3,
    templateFilenameSanitized: "invoice-template.pdf",
    csvFilenameSanitized: "recipients.csv",
    zipFilenameSanitized: "pdf-mail-merge-preview.zip",
    success: true,
  });
  await db.insert(claimCases).values({
    customerId,
    transactionId: tx.id,
    customerEmail: "demo.customer@example.com",
    deviceId: "demo-device-001",
    status: "open",
    subject: "Demo claim — generation metadata review",
  });
}

export async function recordPaidCheckout(
  db: AppDb,
  input: {
    sessionId: string;
    paymentIntentId?: string | null;
    deviceId: string;
    email?: string | null;
    stripeCustomerId?: string | null;
    amountCents: number;
    currency: string;
    createdMs: number;
    durationDays: number;
    productKey: string;
  },
) {
  const customerId = await upsertCustomer(db, {
    deviceId: input.deviceId,
    email: input.email,
    stripeCustomerId: input.stripeCustomerId,
  });

  const [plan] = await db
    .select()
    .from(pricingPlans)
    .where(and(eq(pricingPlans.productKey, input.productKey), eq(pricingPlans.active, true)))
    .limit(1);

  const startsAt = new Date(input.createdMs).toISOString();
  const endsAt = new Date(input.createdMs + input.durationDays * 24 * 60 * 60 * 1000).toISOString();

  const [existing] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.providerSessionId, input.sessionId))
    .limit(1);

  let transactionId = existing?.id;
  if (existing) {
    await db
      .update(transactions)
      .set({
        status: "paid",
        customerEmail: input.email || existing.customerEmail,
        providerPaymentId: input.paymentIntentId || existing.providerPaymentId,
        accessStartsAt: startsAt,
        accessEndsAt: endsAt,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(transactions.id, existing.id));
  } else {
    const inserted = await db
      .insert(transactions)
      .values({
        customerId,
        pricingPlanId: plan?.id ?? null,
        provider: "stripe",
        providerSessionId: input.sessionId,
        providerPaymentId: input.paymentIntentId || null,
        customerEmail: input.email || null,
        deviceId: input.deviceId,
        amountCents: input.amountCents,
        currency: input.currency,
        status: "paid",
        accessStartsAt: startsAt,
        accessEndsAt: endsAt,
        rawSummary: JSON.stringify({ productKey: input.productKey }),
      })
      .returning({ id: transactions.id });
    transactionId = inserted[0].id;
  }

  await db
    .update(entitlements)
    .set({ status: "revoked", updatedAt: sql`CURRENT_TIMESTAMP`, reason: "superseded_by_new_purchase" })
    .where(and(eq(entitlements.deviceId, input.deviceId), eq(entitlements.status, "active")));

  await db.insert(entitlements).values({
    customerId,
    deviceId: input.deviceId,
    email: input.email || null,
    source: "stripe",
    status: "active",
    startsAt,
    endsAt,
    transactionId: transactionId!,
    reason: "stripe_checkout",
  });

  return { transactionId: transactionId!, endsAt, startsAt };
}

export {
  adminAuditLogs,
  adminNotes,
  adminUsers,
  appSettings,
  claimCases,
  customers,
  entitlements,
  pricingPlans,
  transactions,
  usageEvents,
  webhookEvents,
  and,
  desc,
  eq,
  gte,
  sql,
};
