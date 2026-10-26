"use client";

import { FormEvent, useEffect, useState } from "react";

type SmsRecord = {
  sms_id: number;
  customer_id: number;
  order_id: number | null;
  event_type: string;
  message: string;
  status: "pending" | "sending" | "sent" | "delivered" | "failed";
  provider_status: string | null;
  provider_message_id: string | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  masked_phone: string;
};

type SmsCustomer = {
  customer_id: number;
  name: string;
  sms_consent: boolean;
  sms_consent_updated_at: string | null;
  masked_phone: string;
};

type SmsData = { enabled: boolean; records: SmsRecord[]; customers: SmsCustomer[] };

function dateLabel(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function AdminSms() {
  const [data, setData] = useState<SmsData | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [testCustomerId, setTestCustomerId] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState<number | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/sms", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load SMS management.");
      setData(body);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load SMS management.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const selectedCustomer = data?.customers.find((customer) => String(customer.customer_id) === customerId);

  async function sendTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const customer = data?.customers.find((item) => String(item.customer_id) === testCustomerId);
    if (!customer?.sms_consent) {
      setError("Choose a customer who has explicitly opted in to order-related SMS.");
      return;
    }
    if (!window.confirm("This sends a real SMS to the registered number for the selected customer. Continue only if this is your number and you control it.")) return;

    setTesting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/sms/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: Number(testCustomerId),
          phone: testPhone.trim(),
          requestKey: crypto.randomUUID()
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || body.error || "Could not send the SMS test.");
      setNotice(body.message || "Twilio accepted the test message.");
      setTestPhone("");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not send the SMS test.");
      await load();
    } finally {
      setTesting(false);
    }
  }

  async function updateConsent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customerId) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "consent",
          customerId: Number(customerId),
          consent,
          confirmed,
          source
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not update SMS consent.");
      setNotice(consent ? "SMS consent was recorded." : "SMS consent was revoked.");
      setConfirmed(false);
      setSource("");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update SMS consent.");
    } finally {
      setSaving(false);
    }
  }

  async function retry(smsId: number) {
    if (!window.confirm("Retry this SMS? Check the provider console first if the previous attempt may have been accepted; retrying an ambiguous timeout could send a duplicate.")) return;
    setRetrying(smsId);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry", smsId })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not retry SMS.");
      setNotice(`SMS retry finished with status: ${body.status}.`);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not retry SMS.");
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className="dashboard admin-sms-page">
      <header className="page-heading">
        <div><p className="section-kicker">CUSTOMER COMMUNICATION</p><h1>SMS notifications</h1><p className="page-subtitle">Review customer consent and delivery-provider history.</p></div>
        <span className={`sms-enabled-badge${data?.enabled ? " enabled" : ""}`}>{data?.enabled ? "Automatic SMS enabled" : "SMS sending disabled"}</span>
      </header>
      {error && <div className="error-box" role="alert">{error}</div>}
      {notice && <div className="success-box" role="status">{notice}</div>}
      {!data?.enabled && <div className="sms-safety-note">Messages are not sent while SMS_NOTIFICATIONS_ENABLED is unset or false. Configure the provider and verify a test destination before enabling this switch.</div>}

      <section className="panel motion-enter">
        <div className="panel-heading"><div><p className="section-kicker">MANUAL TEST</p><h2>Send a test SMS</h2></div></div>
        <form className="sms-consent-form" onSubmit={sendTest}>
          <div className="record-form-field">
            <label htmlFor="sms-test-customer">Your opted-in customer record</label>
            <select id="sms-test-customer" required value={testCustomerId} onChange={(event) => setTestCustomerId(event.target.value)}>
              <option value="">Choose your customer record</option>
              {(data?.customers ?? []).filter((customer) => customer.sms_consent).map((customer) => (
                <option key={customer.customer_id} value={customer.customer_id}>
                  {customer.name || "Customer"} (#{customer.customer_id}) · {customer.masked_phone}
                </option>
              ))}
            </select>
          </div>
          <div className="record-form-field">
            <label htmlFor="sms-test-phone">Your registered phone in E.164 format</label>
            <input id="sms-test-phone" type="tel" required maxLength={16} pattern="\\+[1-9][0-9]{7,14}" value={testPhone} onChange={(event) => setTestPhone(event.target.value)} placeholder="+91…" />
          </div>
          <p className="sms-safety-note">The server sends only to the selected customer's registered number, and only if consent is active. Your entered E.164 number must match that database value exactly. This button sends a real SMS.</p>
          <button className="primary-button" type="submit" disabled={!data?.enabled || testing || !testCustomerId}>
            {testing ? "Sending…" : "Send test SMS"}
          </button>
        </form>
      </section>

      <section className="panel motion-enter">
        <div className="panel-heading"><div><p className="section-kicker">OPT-IN CONTROL</p><h2>Customer SMS consent</h2></div></div>
        <form className="sms-consent-form" onSubmit={updateConsent}>
          <div className="record-form-field">
            <label htmlFor="sms-customer">Customer</label>
            <select id="sms-customer" required value={customerId} onChange={(event) => {
              setCustomerId(event.target.value);
              const selected = data?.customers.find((customer) => String(customer.customer_id) === event.target.value);
              setConsent(selected?.sms_consent ?? false);
              setConfirmed(false);
              setSource("");
            }}>
              <option value="">Choose a customer</option>
              {(data?.customers ?? []).map((customer) => (
                <option key={customer.customer_id} value={customer.customer_id}>
                  {customer.name || "Customer"} (#{customer.customer_id}) · {customer.masked_phone}
                </option>
              ))}
            </select>
          </div>
          {selectedCustomer && (
            <>
              <p className="sms-consent-state">Current consent: <strong>{selectedCustomer.sms_consent ? "Opted in" : "Not opted in"}</strong> · Registered phone: {selectedCustomer.masked_phone}</p>
              <div className="record-form-field">
                <label htmlFor="sms-consent-state">Set consent</label>
                <select id="sms-consent-state" value={String(consent)} onChange={(event) => { setConsent(event.target.value === "true"); setConfirmed(false); }}>
                  <option value="false">Not opted in / revoke consent</option>
                  <option value="true">Customer explicitly opted in</option>
                </select>
              </div>
              {consent && (
                <>
                  <div className="record-form-field">
                    <label htmlFor="sms-consent-source">Consent record source</label>
                    <input id="sms-consent-source" required maxLength={100} value={source} onChange={(event) => setSource(event.target.value)} placeholder="How and when consent was recorded" />
                  </div>
                  <label className="sms-confirm-label">
                    <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                    I verified this customer explicitly agreed to receive order-related SMS at the registered number.
                  </label>
                </>
              )}
              <button className="primary-button" type="submit" disabled={saving || (consent && !confirmed)}>{saving ? "Saving…" : "Save consent"}</button>
            </>
          )}
        </form>
      </section>

      <section className="panel motion-enter">
        <div className="panel-heading"><div><p className="section-kicker">PROVIDER OUTBOX</p><h2>Recent SMS history</h2></div><button className="secondary-button" type="button" disabled={loading} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh"}</button></div>
        {loading && <p className="loading-message" role="status">Loading SMS history…</p>}
        {!loading && !error && data?.records.length === 0 && <p className="empty">No SMS events are recorded yet.</p>}
        {data?.records.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">EVENT</th><th scope="col">CUSTOMER</th><th scope="col">ORDER</th><th scope="col">STATUS</th><th scope="col">PROVIDER</th><th scope="col">CREATED</th><th scope="col">ACTIONS</th></tr></thead>
              <tbody>{data.records.map((record) => (
                <tr key={record.sms_id}>
                  <td><strong>{record.event_type.replaceAll("_", " ")}</strong><small>{record.message}</small></td>
                  <td>#{record.customer_id}<small>{record.masked_phone}</small></td>
                  <td>{record.order_id ? `#${record.order_id}` : "—"}</td>
                  <td><span className={`status sms-status-${record.status}`}>{record.status}</span>{record.last_error && <small>{record.last_error}</small>}</td>
                  <td>{record.provider_status || (record.provider_message_id ? "Accepted" : "—")}</td>
                  <td>{dateLabel(record.created_at)}</td>
                  <td>{record.status === "failed" && record.attempts < 3
                    ? <button className="text-button" type="button" disabled={!data.enabled || retrying === record.sms_id} onClick={() => void retry(record.sms_id)}>{retrying === record.sms_id ? "Retrying…" : "Retry failed SMS"}</button>
                    : <span className="muted">—</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : null}
        <p className="sms-history-note">“Sent” means the provider accepted the message; it does not confirm carrier delivery. A delivery status is shown only when a signed Twilio status callback is configured.</p>
      </section>
    </div>
  );
}
