import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { AppDb } from "../db";
import { customers, entitlements } from "../db/schema";
import { hashPassword, verifyPassword } from "./admin-auth";

export async function findActiveEntitlementByEmail(db: AppDb, email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const now = new Date().toISOString();
  const [row] = await db
    .select()
    .from(entitlements)
    .where(
      and(
        eq(entitlements.email, normalized),
        eq(entitlements.status, "active"),
        gt(entitlements.endsAt, now),
      ),
    )
    .orderBy(desc(entitlements.endsAt))
    .limit(1);
  return row || null;
}

export async function findCustomerByEmail(db: AppDb, email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const [row] = await db.select().from(customers).where(eq(customers.email, normalized)).limit(1);
  return row || null;
}

export async function setCustomerPassword(db: AppDb, customerId: number, password: string) {
  const passwordHash = await hashPassword(password);
  await db
    .update(customers)
    .set({ passwordHash, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(customers.id, customerId));
  return passwordHash;
}

export async function bindCustomerDevice(db: AppDb, customerId: number, email: string, deviceId: string) {
  await db
    .update(customers)
    .set({ deviceId, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(customers.id, customerId));

  await db
    .update(entitlements)
    .set({ deviceId, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(and(eq(entitlements.email, email.trim().toLowerCase()), eq(entitlements.status, "active")));
}

export async function authenticateCustomer(db: AppDb, email: string, password: string) {
  const customer = await findCustomerByEmail(db, email);
  if (!customer?.passwordHash) return null;
  if (!(await verifyPassword(password, customer.passwordHash))) return null;
  return customer;
}
