import type { PoolConfig } from "pg";

/**
 * Prefer Supabase transaction-mode pooler (6543) over session-mode (5432).
 * Session mode caps ~15 clients and causes EMAXCONNSESSION on Vercel.
 */
export function preferSupabaseTransactionPooler(dbUrl: string): string {
  try {
    const url = new URL(dbUrl);
    const isPoolerHost =
      url.hostname.includes("pooler.supabase.com") || url.hostname.includes("pooler.supabase.co");
    if (!isPoolerHost) return dbUrl;

    if (url.port === "5432" || url.port === "") {
      url.port = "6543";
    }

    url.searchParams.set("pgbouncer", "true");
    url.searchParams.delete("sslmode");
    return url.toString();
  } catch {
    return dbUrl;
  }
}

/**
 * Pool config for PrismaPg.
 * On Vercel/serverless, keep max=1 so each isolate uses one client.
 * Prefer transaction-mode pooler to avoid EMAXCONNSESSION.
 */
export function buildPrismaPgPoolConfig(dbUrl: string): PoolConfig {
  const isSupabase = dbUrl.includes("supabase.com") || dbUrl.includes("supabase.co");
  const isServerless = process.env.VERCEL === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME != null;
  const connectionString = isSupabase ? preferSupabaseTransactionPooler(dbUrl) : dbUrl;

  if (!isSupabase) {
    return {
      connectionString,
      max: isServerless ? 3 : undefined,
      idleTimeoutMillis: isServerless ? 5_000 : undefined,
      connectionTimeoutMillis: 15_000,
    };
  }

  return {
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: isServerless ? 3 : 5,
    idleTimeoutMillis: isServerless ? 5_000 : 20_000,
    connectionTimeoutMillis: 15_000,
    allowExitOnIdle: isServerless,
    maxUses: isServerless ? 100 : undefined,
  };
}
