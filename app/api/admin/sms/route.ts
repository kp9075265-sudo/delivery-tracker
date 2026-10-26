import { NextResponse } from "next/server";
import { isApiError, requireApiAdmin, requireSameOrigin } from "@/lib/api-auth";
import { getPool } from "@/lib/db";
import { dispatchSmsSafely } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function migrationRequired(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error &&
    ["42P01", "42703"].includes(String(error.code));
}

function migrationResponse() {
  return NextResponse.json({
    error: "SMS history is not installed yet. Review and apply db/migrations/003_sms_consent_and_outbox.sql before using SMS management."
  }, { status: 503 });
}

export async function GET() {
  const admin = await requireApiAdmin();
  if (isApiError(admin)) return admin;

  try {
    const pool = getPool();
    const [records, customers] = await Promise.all([
      pool.query(
        `SELECT sms_id, customer_id, order_id, event_type, message, status, provider_status,
                provider_message_id, attempts, last_error, created_at, sent_at, delivered_at,
                CASE WHEN length(recipient_phone) > 4
                     THEN repeat('•', GREATEST(length(recipient_phone) - 4, 0)) || right(recipient_phone, 4)
                     ELSE '••••'
                END AS masked_phone
         FROM sms_notifications
         ORDER BY created_at DESC, sms_id DESC
         LIMIT 50`
      ),
      pool.query(
        `SELECT customer_id, concat_ws(' ', first_name, last_name) AS name,
                sms_consent, sms_consent_updated_at,
                CASE WHEN length(phone) > 4
                     THEN repeat('•', GREATEST(length(phone) - 4, 0)) || right(phone, 4)
                     ELSE '••••'
                END AS masked_phone
         FROM customers
         ORDER BY last_name, first_name, customer_id
         LIMIT 500`
      )
    ]);
    return NextResponse.json({
      enabled: process.env.SMS_NOTIFICATIONS_ENABLED === "true",
      records: records.rows,
      customers: customers.rows
    });
  } catch (error) {
    if (migrationRequired(error)) return migrationResponse();
    console.error("Admin SMS history request failed.");
    return NextResponse.json({ error: "Could not load SMS history." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!requireSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  }
  const admin = await requireApiAdmin();
  if (isApiError(admin)) return admin;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Choose a supported SMS management action." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const pool = getPool();

  if (input.action === "consent") {
    const customerId = Number(input.customerId);
    const consent = input.consent;
    const source = typeof input.source === "string" ? input.source.trim() : "";
    if (!Number.isSafeInteger(customerId) || customerId <= 0 ||
      typeof consent !== "boolean" ||
      (consent && (input.confirmed !== true || source.length < 3 || source.length > 100))) {
      return NextResponse.json({
        error: "Choose a customer. To enable SMS, confirm that the customer explicitly opted in and record how consent was obtained."
      }, { status: 400 });
    }

    try {
      const result = await pool.query(
        `UPDATE customers
         SET sms_consent = $2,
             sms_consent_updated_at = now(),
             sms_consent_source = CASE WHEN $2 THEN $3 ELSE NULL END
         WHERE customer_id = $1
         RETURNING customer_id`,
        [customerId, consent, consent ? source : null]
      );
      if (!result.rowCount) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
      return NextResponse.json({ success: true });
    } catch (error) {
      if (migrationRequired(error)) return migrationResponse();
      console.error("Customer SMS consent update failed.");
      return NextResponse.json({ error: "Could not update SMS consent." }, { status: 500 });
    }
  }

  if (input.action === "retry") {
    const smsId = Number(input.smsId);
    if (!Number.isSafeInteger(smsId) || smsId <= 0) {
      return NextResponse.json({ error: "A valid SMS history ID is required." }, { status: 400 });
    }
    if (process.env.SMS_NOTIFICATIONS_ENABLED !== "true") {
      return NextResponse.json({ error: "SMS sending is disabled. Configure and test the provider before enabling it." }, { status: 409 });
    }
    try {
      const status = await pool.query(
        "SELECT status, attempts FROM sms_notifications WHERE sms_id = $1",
        [smsId]
      );
      if (!status.rowCount) return NextResponse.json({ error: "SMS record not found." }, { status: 404 });
      if (status.rows[0].status !== "failed" || Number(status.rows[0].attempts) >= 3) {
        return NextResponse.json({ error: "Only failed SMS records with fewer than three attempts can be retried." }, { status: 409 });
      }
      const result = await dispatchSmsSafely(pool, smsId);
      return NextResponse.json({ success: true, status: result.status });
    } catch (error) {
      if (migrationRequired(error)) return migrationResponse();
      console.error("SMS retry request failed.");
      return NextResponse.json({ error: "Could not retry this SMS." }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Choose a supported SMS management action." }, { status: 400 });
}
