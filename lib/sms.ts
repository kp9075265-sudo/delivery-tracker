import twilio from "twilio";
import type { Pool, PoolClient } from "pg";

type SmsEventType = "order_placed" | "order_dispatched" | "order_in_transit" | "out_for_delivery" | "order_delivered" | "test";

const eventMessages: Record<SmsEventType, (orderId: number) => string> = {
  order_placed: (orderId) => `Your order #${orderId} has been placed successfully. Thank you!`,
  order_dispatched: (orderId) => `Your order #${orderId} has been dispatched. Track your shipment on our website.`,
  order_in_transit: (orderId) => `Your order #${orderId} is in transit. Track your shipment on our website.`,
  out_for_delivery: (orderId) => `Your order #${orderId} is out for delivery. Please be available to receive it.`,
  order_delivered: (orderId) => `Your order #${orderId} has been delivered successfully. Thank you!`,
  test: () => "Delivery Tracking SMS test."
};

const trialTemplates: Record<SmsEventType, string> = {
  order_placed: "sms_order_confirmation",
  order_dispatched: "sms_delivery_updates",
  order_in_transit: "sms_delivery_updates",
  out_for_delivery: "sms_delivery_updates",
  order_delivered: "sms_delivery_updates",
  test: "sms_delivery_updates"
};

function isSmsEnabled() {
  return process.env.SMS_NOTIFICATIONS_ENABLED === "true";
}

function twilioConfiguration() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  const statusCallbackUrl = process.env.TWILIO_STATUS_CALLBACK_URL;
  if (!accountSid || !authToken || !from) {
    throw new Error("Twilio is not configured. Set the SMS provider environment variables before enabling SMS.");
  }
  if (!/^AC[a-f0-9]{32}$/i.test(accountSid)) {
    throw new Error("TWILIO_ACCOUNT_SID is not a valid Account SID format.");
  }
  if (!/^\+[1-9]\d{7,14}$/.test(from)) {
    throw new Error("TWILIO_PHONE_NUMBER must be a sender number in E.164 format.");
  }
  if (statusCallbackUrl) {
    const callback = new URL(statusCallbackUrl);
    if (callback.protocol !== "https:") throw new Error("TWILIO_STATUS_CALLBACK_URL must use HTTPS.");
  }
  return { accountSid, authToken, from, statusCallbackUrl };
}

function safeProviderMessage(message: string, recipientPhone: string, config?: ReturnType<typeof twilioConfiguration>) {
  const secrets = [config?.accountSid, config?.authToken, config?.from, recipientPhone]
    .filter((secret): secret is string => Boolean(secret))
    .sort((a, b) => b.length - a.length);
  let safeMessage = message;
  for (const secret of secrets) {
    safeMessage = safeMessage.replaceAll(secret, "[redacted]");
  }
  return safeMessage
    .replace(/\+[1-9]\d{7,14}/g, "[redacted phone]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, 300) || "No provider error message was supplied.";
}

function providerErrorDetails(error: unknown, recipientPhone: string, config?: ReturnType<typeof twilioConfiguration>) {
  if (error instanceof twilio.RestException) {
    const code = typeof error.code === "number" ? String(error.code) : null;
    const httpStatus = Number.isInteger(error.status) ? error.status : null;
    const message = safeProviderMessage(error.message, recipientPhone, config);
    return {
      code,
      httpStatus,
      message,
      historyMessage: `Twilio error ${code ?? "unknown"} (HTTP ${httpStatus ?? "unknown"}): ${message}`
    };
  }

  const message = safeProviderMessage(
    error instanceof Error ? error.message : "Unknown provider request error.",
    recipientPhone,
    config
  );
  return {
    code: null,
    httpStatus: null,
    message,
    historyMessage: `Twilio request error: ${message}`
  };
}

export async function enqueueOrderSms(
  client: PoolClient,
  customerId: number,
  orderId: number,
  eventType: SmsEventType,
  eventKey: string
) {
  if (!isSmsEnabled()) return null;

  const customer = await client.query(
    `SELECT phone, sms_consent
     FROM customers
     WHERE customer_id = $1
     FOR KEY SHARE`,
    [customerId]
  );
  const row = customer.rows[0];
  if (!row?.sms_consent || !row.phone) return null;

  const result = await client.query(
    `INSERT INTO sms_notifications
       (customer_id, order_id, event_type, event_key, recipient_phone, message)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (event_key) DO NOTHING
     RETURNING sms_id`,
    [customerId, orderId, eventType, eventKey, row.phone, eventMessages[eventType](orderId)]
  );
  return result.rows[0]?.sms_id as number | undefined ?? null;
}

export async function enqueueTestSms(client: PoolClient, customerId: number, expectedPhone: string, eventKey: string) {
  if (!isSmsEnabled()) throw new Error("SMS sending is disabled.");
  if (!/^\+[1-9]\d{7,14}$/.test(expectedPhone)) {
    throw new Error("Enter the customer's registered number in E.164 format.");
  }
  const customer = await client.query(
    `SELECT phone, sms_consent
     FROM customers
     WHERE customer_id = $1
     FOR KEY SHARE`,
    [customerId]
  );
  const row = customer.rows[0];
  if (!row?.sms_consent) throw new Error("Explicit customer SMS consent is required.");
  if (row.phone !== expectedPhone) throw new Error("Test number must exactly match the selected customer's registered phone.");

  const result = await client.query(
    `INSERT INTO sms_notifications
       (customer_id, order_id, event_type, event_key, recipient_phone, message)
     VALUES ($1, NULL, 'test', $2, $3, $4)
     ON CONFLICT (event_key) DO NOTHING
     RETURNING sms_id`,
    [customerId, eventKey, row.phone, eventMessages.test(0)]
  );
  return result.rows[0]?.sms_id as number | undefined ?? null;
}

export async function dispatchSms(pool: Pool, smsId: number) {
  if (!isSmsEnabled()) return { status: "disabled" as const };

  const client = await pool.connect();
  let message: {
    recipient_phone: string;
    message: string;
    event_type: SmsEventType;
    customer_phone: string;
    sms_consent: boolean;
  } | undefined;
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT sms.sms_id, sms.status, sms.attempts, sms.recipient_phone, sms.message, sms.event_type,
              customer.phone AS customer_phone, customer.sms_consent
       FROM sms_notifications sms
       JOIN customers customer ON customer.customer_id = sms.customer_id
       WHERE sms.sms_id = $1
       FOR UPDATE OF sms, customer`,
      [smsId]
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return { status: "not_found" as const };
    }
    const row = result.rows[0];
    if (row.status === "sent" || row.status === "delivered") {
      await client.query("COMMIT");
      return { status: row.status as "sent" | "delivered" };
    }
    if (row.status === "sending") {
      await client.query("COMMIT");
      return { status: "sending" as const };
    }
    if (row.status !== "pending" && row.status !== "failed") {
      await client.query("ROLLBACK");
      return { status: "not_retryable" as const };
    }
    if (row.attempts >= 3) {
      await client.query(
        `UPDATE sms_notifications SET status = 'failed', last_error = 'Retry limit reached', updated_at = now()
         WHERE sms_id = $1`,
        [smsId]
      );
      await client.query("COMMIT");
      return { status: "failed" as const };
    }
    if (!row.sms_consent || !row.customer_phone || row.customer_phone !== row.recipient_phone) {
      await client.query(
        `UPDATE sms_notifications
         SET status = 'failed', last_error = 'Customer consent or registered phone changed before sending', updated_at = now()
         WHERE sms_id = $1`,
        [smsId]
      );
      await client.query("COMMIT");
      return { status: "failed" as const };
    }
    if (!/^\+[1-9]\d{7,14}$/.test(row.recipient_phone)) {
      await client.query(
        `UPDATE sms_notifications
         SET status = 'failed', last_error = 'Customer phone must use international E.164 format', updated_at = now()
         WHERE sms_id = $1`,
        [smsId]
      );
      await client.query("COMMIT");
      return { status: "failed" as const };
    }
    message = row;
    await client.query(
      `UPDATE sms_notifications
       SET status = 'sending', attempts = attempts + 1, last_attempt_at = now(),
           last_error = NULL, updated_at = now()
       WHERE sms_id = $1`,
      [smsId]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  if (!message) return { status: "failed" as const };

  let config: ReturnType<typeof twilioConfiguration> | undefined;
  try {
    config = twilioConfiguration();
    const client = twilio(config.accountSid, config.authToken);
    const sent = await client.messages.create({
      to: message.recipient_phone,
      from: config.from,
      body: process.env.TWILIO_TRIAL_MODE === "true"
        ? trialTemplates[message.event_type as SmsEventType]
        : message.message,
      ...(config.statusCallbackUrl ? { statusCallback: config.statusCallbackUrl } : {})
    });
    await pool.query(
      `UPDATE sms_notifications
       SET status = 'sent', provider_message_id = $2, provider_status = $3,
           sent_at = now(), last_error = NULL, updated_at = now()
       WHERE sms_id = $1 AND status = 'sending'`,
      [smsId, sent.sid, sent.status]
    );
    return { status: "sent" as const, providerStatus: sent.status, messageSid: sent.sid };
  } catch (error) {
    const details = providerErrorDetails(error, message.recipient_phone, config);
    console.error("Twilio SMS request failed.", JSON.stringify({
      smsId,
      twilioErrorCode: details.code,
      httpStatus: details.httpStatus,
      message: details.message
    }));
    await pool.query(
      `UPDATE sms_notifications
       SET status = 'failed', provider_status = $2, last_error = $3, updated_at = now()
       WHERE sms_id = $1 AND status = 'sending'`,
      [
        smsId,
        `error_${details.code ?? "unknown"}_${details.httpStatus ?? "unknown"}`.slice(0, 40),
        details.historyMessage
      ]
    );
    return { status: "failed" as const, message: details.historyMessage };
  }
}

export async function dispatchSmsSafely(pool: Pool, smsId: number) {
  try {
    return await dispatchSms(pool, smsId);
  } catch {
    console.error("Post-commit SMS dispatch failed.");
    return { status: "failed" as const, message: "SMS request or history update failed. Check the SMS history and server logs." };
  }
}

export function validateTwilioStatusCallback(signature: string | null, params: Record<string, string>) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const callbackUrl = process.env.TWILIO_STATUS_CALLBACK_URL;
  if (!authToken || !callbackUrl || !signature) return false;
  return twilio.validateRequest(authToken, signature, callbackUrl, params);
}
