import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { validateTwilioStatusCallback } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const signature = request.headers.get("x-twilio-signature");
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") params[key] = value;
  }
  if (!validateTwilioStatusCallback(signature, params)) {
    return NextResponse.json({ error: "Webhook signature is invalid." }, { status: 403 });
  }

  const messageId = params.MessageSid;
  const providerStatus = params.MessageStatus?.toLowerCase();
  if (!messageId || !providerStatus) {
    return NextResponse.json({ error: "Required message status fields are missing." }, { status: 400 });
  }

  const delivered = providerStatus === "delivered";
  const failed = providerStatus === "failed" || providerStatus === "undelivered";
  const result = await getPool().query(
    `UPDATE sms_notifications
     SET status = CASE
           WHEN $2::boolean THEN 'delivered'
           WHEN $3::boolean AND status <> 'delivered' THEN 'failed'
           ELSE status
         END,
         provider_status = $4,
         delivered_at = CASE WHEN $2::boolean THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
         last_error = CASE WHEN $3::boolean THEN 'Provider reported the SMS was not delivered' ELSE last_error END,
         updated_at = now()
     WHERE provider_message_id = $1
     RETURNING sms_id`,
    [messageId, delivered, failed, providerStatus]
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Message record is not available yet; provider may retry the callback." }, { status: 503 });
  }
  return NextResponse.json({ success: true });
}
