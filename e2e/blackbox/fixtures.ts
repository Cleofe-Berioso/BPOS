import { test as base } from "@playwright/test";
import { ensureAuthState, USERS } from "./helpers";

type Role = keyof typeof USERS;

const authReady = new Map<Role, Promise<string>>();

async function getAuthState(
  browser: import("@playwright/test").Browser,
  role: Role
): Promise<string> {
  let pending = authReady.get(role);
  if (!pending) {
    pending = ensureAuthState(browser, role).catch((error) => {
      authReady.delete(role);
      throw error;
    });
    authReady.set(role, pending);
  }
  return pending;
}

export function createRoleTest(role: Role) {
  return base.extend({
    storageState: async ({ browser }, provide) => {
      await provide(await getAuthState(browser, role));
    },
  });
}
