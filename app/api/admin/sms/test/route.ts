import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isApiError, requireApiAdmin, requireSameOrigin } from "@/lib/api-auth";
import { getPool } from "@/lib/db";
import { dispatchSmsSafely, enqueueTestSms } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!requireSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  }
  const admin = await requireApiAdmin();
  if (isApiError(admin)) return admin;
  if (process.env.SMS_NOTIFICATIONS_ENABLED !== "true") {
    return NextResponse.json({ error: "SMS sending is disabled. Set SMS_NOTIFICATIONS_ENABLED=true to send a test." }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Select your opted-in customer record and enter its registered test number." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const customerId = Number(input.customerId);
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  const requestKey = typeof input.requestKey === "string" ? input.requestKey : "";
  if (!Number.isSafeInteger(customerId) || customerId <= 0 ||
    !/^\+[1-9]\d{7,14}$/.test(phone) ||
    !/^[0-9a-f-]{36}$/i.test(requestKey)) {
    return NextResponse.json({ error: "Provide a valid customer, E.164 phone number, and test request ID." }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  let smsId: number | undefined;
  try {
    await client.query("BEGIN");
    smsId = await enqueueTestSms(client, customerId, phone, `manual-test:${requestKey}`) ?? undefined;
    if (!smsId) {
      const existing = await client.query(
        `SELECT sms_id, status FROM sms_notifications WHERE event_key = $1`,
        [`manual-test:${requestKey}`]
      );
      await client.query("COMMIT");
      if (!existing.rowCount) {
        return NextResponse.json({ error: "The test message could not be queued." }, { status: 500 });
      }
      return NextResponse.json({
        success: existing.rows[0].status === "sent" || existing.rows[0].status === "delivered",
        duplicate: true,
        status: existing.rows[0].status,
        message: "This test request was already recorded and was not sent again."
      });
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "";
    if (message.includes("consent") || message.includes("registered") || message.includes("E.164")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Admin SMS test could not be queued.");
    return NextResponse.json({
      error: "Could not queue the SMS test. Confirm migration 003 is installed and check the server logs."
    }, { status: 503 });
  } finally {
    client.release();
  }

  const result = await dispatchSmsSafely(pool, smsId);
  return NextResponse.json({
    success: result.status === "sent",
    status: result.status,
    message: result.status === "sent" ? "Twilio accepted the test message." : result.message
  }, { status: result.status === "sent" ? 200 : 502 });
}
