import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { Pool } from "pg";

const scryptAsync = promisify(scrypt);

function readHidden(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Run this command in an interactive terminal so the password can be entered privately.");
  }

  return new Promise((resolve, reject) => {
    let value = "";
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    function finish(error) {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    }

    function onData(chunk) {
      const key = chunk.toString();
      if (key === "\u0003") {
        finish(new Error("Cancelled."));
      } else if (key === "\r" || key === "\n") {
        finish();
      } else if (key === "\u007f" || key === "\b") {
        value = value.slice(0, -1);
      } else if (!/[\u0000-\u001f\u007f]/.test(key)) {
        value += key;
      }
    }

    process.stdin.on("data", onData);
  });
}

async function main() {
  const [role, rawEmail, rawCustomerId, extra] = process.argv.slice(2);
  if (extra !== undefined || !["admin", "customer"].includes(role) || !rawEmail) {
    throw new Error("Usage: npm run provision:user -- <admin|customer> <email> [customerId]");
  }
  if ((role === "customer" && !rawCustomerId) || (role === "admin" && rawCustomerId)) {
    throw new Error("Customers need a customerId; administrators must not be linked to a customer.");
  }

  const email = rawEmail.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  const customerId = rawCustomerId === undefined ? null : Number(rawCustomerId);
  if (customerId !== null && (!Number.isSafeInteger(customerId) || customerId <= 0)) {
    throw new Error("customerId must be a positive integer.");
  }

  const password = await readHidden("Password (12–128 characters; input hidden): ");
  if (password.length < 12 || password.length > 128) {
    throw new Error("Password must be between 12 and 128 characters.");
  }
  const confirmation = await readHidden("Confirm password (input hidden): ");
  if (password !== confirmation) {
    throw new Error("Passwords do not match.");
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Configure it in .env.local.");
  }
  const url = new URL(process.env.DATABASE_URL);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
  }
  url.searchParams.set(
    "sslmode",
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname) ? "disable" : "verify-full"
  );

  const pool = new Pool({ connectionString: url.toString(), max: 1, connectionTimeoutMillis: 10000 });
  try {
    if (customerId !== null) {
      const customer = await pool.query(
        `SELECT customer_id FROM customers WHERE customer_id = $1`,
        [customerId]
      );
      if (customer.rowCount === 0) throw new Error("No customer record has that ID.");
    }

    const salt = randomBytes(16);
    const derived = await scryptAsync(password, salt, 64);
    const passwordHash = `scrypt$${salt.toString("hex")}$${Buffer.from(derived).toString("hex")}`;
    await pool.query(
      `INSERT INTO app_users (email, password_hash, role, customer_id)
       VALUES ($1, $2, $3, $4)`,
      [email, passwordHash, role, customerId]
    );
    console.log(`Created ${role} account. No password was displayed.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Could not provision the account.");
  process.exitCode = 1;
});
