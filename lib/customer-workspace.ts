import { eq, sql } from "drizzle-orm";
import type { AppDb } from "../db";
import { customers } from "../db/schema";
import {
  CUSTOMER_SESSION_COOKIE,
  readCustomerSessionToken,
} from "./customer-auth";
import { parseCookies } from "./admin-auth";
import { findActiveEntitlementByEmail, findCustomerByEmail } from "./customer-access";
import {
  deleteCustomerWorkspace,
  listCustomerBatches,
  listWorkspaceCustomerIds,
  loadCustomerWorkspace,
  readCustomerBatch,
  saveCustomerBatch,
  saveCustomerWorkspace as saveCustomerWorkspaceFiles,
  workspaceSummary,
  type WorkspacePayload,
} from "./customer-workspace-store";

export type { BatchRecord, WorkspaceMeta, WorkspacePayload } from "./customer-workspace-store";
export {
  deleteCustomerWorkspace,
  listCustomerBatches,
  listWorkspaceCustomerIds,
  loadCustomerWorkspace,
  readCustomerBatch,
  saveCustomerBatch,
  workspaceSummary,
};

export async function requireCustomerFromRequest(request: Request) {
  const cookies = parseCookies(request.headers.get("cookie"));
  let token = cookies[CUSTOMER_SESSION_COOKIE];
  try {
    const maybe = (request as { cookies?: { get?: (name: string) => { value: string } | undefined } }).cookies?.get?.(
      CUSTOMER_SESSION_COOKIE,
    )?.value;
    if (maybe) token = maybe;
  } catch {
    /* ignore */
  }
  return readCustomerSessionToken(token);
}

export async function requirePaidCustomer(db: AppDb, request: Request) {
  const session = await requireCustomerFromRequest(request);
  if (!session) return { error: "Sign in to access your saved files.", status: 401 as const };
  const customer = await findCustomerByEmail(db, session.email);
  if (!customer || customer.id !== session.customerId) {
    return { error: "Sign in to access your saved files.", status: 401 as const };
  }
  const entitlement = await findActiveEntitlementByEmail(db, session.email);
  if (!entitlement) {
    return { error: "Active paid access is required to sync files across devices.", status: 402 as const };
  }
  return { customer, session, entitlement };
}

export async function saveCustomerWorkspace(db: AppDb, customerId: number, payload: WorkspacePayload) {
  const meta = await saveCustomerWorkspaceFiles(customerId, payload);
  await db
    .update(customers)
    .set({ updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(customers.id, customerId));
  return meta;
}
