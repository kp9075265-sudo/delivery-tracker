import { NextResponse } from "next/server";
import { isAppUser, requireApiUser, requireSameOrigin } from "@/lib/api-auth";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireApiUser();
  if (!isAppUser(user)) return user;
  if (user.role !== "customer" || user.customerId === null) {
    return NextResponse.json({ error: "Customer notification access is required." }, { status: 403 });
  }

  const pool = getPool();
  const [countResult, notificationsResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS unread_count
       FROM notifications
       WHERE customer_id = $1 AND read_at IS NULL`,
      [user.customerId]
    ),
    pool.query(
      `SELECT notification_id, message, sent_at, read_at, order_id
       FROM notifications
       WHERE customer_id = $1
       ORDER BY sent_at DESC NULLS LAST, notification_id DESC
       LIMIT 30`,
      [user.customerId]
    )
  ]);

  return NextResponse.json({
    unreadCount: Number(countResult.rows[0].unread_count),
    notifications: notificationsResult.rows
  });
}

export async function PATCH(request: Request) {
  if (!requireSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  }

  const user = await requireApiUser();
  if (!isAppUser(user)) return user;
  if (user.role !== "customer" || user.customerId === null) {
    return NextResponse.json({ error: "Customer notification access is required." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const notificationId = typeof body === "object" && body !== null && "notificationId" in body
    ? Number(body.notificationId)
    : NaN;
  if (!Number.isSafeInteger(notificationId) || notificationId <= 0) {
    return NextResponse.json({ error: "A valid notification ID is required." }, { status: 400 });
  }

  const result = await getPool().query(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, now())
     WHERE notification_id = $1 AND customer_id = $2
     RETURNING notification_id`,
    [notificationId, user.customerId]
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Notification was not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export async function POST(request: Request) {
  if (!requireSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  }

  const user = await requireApiUser();
  if (!isAppUser(user)) return user;
  if (user.role !== "customer" || user.customerId === null) {
    return NextResponse.json({ error: "Customer notification access is required." }, { status: 403 });
  }

  const result = await getPool().query(
    `UPDATE notifications
     SET read_at = now()
     WHERE customer_id = $1 AND read_at IS NULL`,
    [user.customerId]
  );
  return NextResponse.json({ success: true, updated: result.rowCount });
}
