import { auth } from "@/auth";
import { getPool } from "@/lib/db";

export type AppUser = {
  userId: number;
  email: string;
  role: "admin" | "customer";
  customerId: number | null;
};

export async function getCurrentAppUser(): Promise<AppUser | null> {
  const session = await auth();
  const sessionUserId = Number(session?.user?.id);
  if (!Number.isSafeInteger(sessionUserId) || sessionUserId <= 0) {
    return null;
  }

  const result = await getPool().query(
    `SELECT user_id, email, role, customer_id
     FROM app_users
     WHERE user_id = $1
     LIMIT 1`,
    [sessionUserId]
  );
  const user = result.rows[0];
  if (!user || (user.role !== "admin" && user.role !== "customer")) {
    return null;
  }

  return {
    userId: user.user_id,
    email: user.email,
    role: user.role,
    customerId: user.customer_id
  };
}
