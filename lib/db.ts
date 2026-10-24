import { Pool } from "pg";

const globalForPg = globalThis as unknown as { pgPool?: Pool };

export class DatabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigurationError";
  }
}

function createPool() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new DatabaseConfigurationError(
      "DATABASE_URL is missing. Add your Neon connection string to .env.local for local development or to Vercel Environment Variables."
    );
  }

  let connectionUrl: URL;
  try {
    connectionUrl = new URL(databaseUrl);
  } catch {
    throw new DatabaseConfigurationError(
      "DATABASE_URL is not a valid PostgreSQL connection URL. Copy the connection string from your Neon dashboard."
    );
  }

  if (connectionUrl.protocol !== "postgres:" && connectionUrl.protocol !== "postgresql:") {
    throw new DatabaseConfigurationError(
      "DATABASE_URL must use the postgres:// or postgresql:// protocol."
    );
  }

  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(connectionUrl.hostname);
  connectionUrl.searchParams.set("sslmode", isLocal ? "disable" : "verify-full");

  const pool = new Pool({
    connectionString: connectionUrl.toString(),
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  pool.on("error", () => {
    console.error("Unexpected idle PostgreSQL connection error.");
  });

  return pool;
}

export function getPool() {
  if (!globalForPg.pgPool) {
    globalForPg.pgPool = createPool();
  }

  return globalForPg.pgPool;
}
