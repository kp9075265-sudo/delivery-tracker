 "use client";

import { FormEvent, useState } from "react";

type TrackingEvent = {
  tracking_id: number;
  current_location: string | null;
  status: string | null;
  update_time: string | null;
};

type TrackingResult = {
  order: {
    order_id: number;
    order_date: string | null;
    order_status: string | null;
    total_amount: number | string | null;
    customer_name: string | null;
  };
  shipment: {
    shipment_id: number;
    shipment_status: string | null;
    warehouse_name: string | null;
    warehouse_city: string | null;
    agent_name: string | null;
    agent_phone: string | null;
  } | null;
  items: Array<{
    product_id: number;
    product_name: string;
    quantity: number;
    price: number | string;
    category_name: string | null;
  }>;
  tracking: TrackingEvent[];
  payment: { payment_method: string | null; payment_status: string | null } | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusClass(value: string | null | undefined) {
  const status = (value || "").toLowerCase();
  if (status.includes("deliver")) return "status delivered";
  if (status.includes("pending") || status.includes("process")) return "status pending";
  return "status";
}

export default function Home() {
  const [orderId, setOrderId] = useState("");
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function trackOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);

    const cleanId = orderId.trim();
    if (!cleanId || !/^\d+$/.test(cleanId)) {
      setError("Enter a valid numeric order ID.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/track/${encodeURIComponent(cleanId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not find this order.");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <nav className="topbar">
        <a className="brand" href="#"><span className="brand-icon">T</span> trackly<span className="brand-dot">.</span></a>
        <span className="nav-label">DELIVERY TRACKING</span>
      </nav>

      <section className="hero">
        <div className="eyebrow"><span className="live-dot" /> DELIVERY TRACKING, MADE SIMPLE</div>
        <h1>Your delivery.<br /><span>Every step of the way.</span></h1>
        <p className="hero-copy">Track your order and see its latest status, shipment details, and product information in one place.</p>

        <form className="track-form" onSubmit={trackOrder}>
          <label htmlFor="orderId">ORDER ID</label>
          <div className="input-row">
            <input
              id="orderId"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="Enter your order ID"
              inputMode="numeric"
              aria-describedby="form-help"
            />
            <button type="submit" disabled={loading}>{loading ? "Searching…" : "Track order"} <span aria-hidden="true">→</span></button>
          </div>
          <small id="form-help">Use the order ID stored in your database.</small>
        </form>
        {error && <div className="error-box" role="alert">{error}</div>}
      </section>

      {result && (
        <section className="results" aria-live="polite">
          <div className="result-heading">
            <div>
              <p className="section-kicker">TRACKING RESULT</p>
              <h2>Order #{result.order.order_id}</h2>
              <p className="muted">Placed {formatDate(result.order.order_date)}</p>
            </div>
            <span className={statusClass(result.shipment?.shipment_status || result.order.order_status)}>
              {result.shipment?.shipment_status || result.order.order_status || "Status unavailable"}
            </span>
          </div>

          <div className="summary-grid">
            <article className="info-card">
              <span className="card-label">CUSTOMER</span>
              <strong>{result.order.customer_name || "Customer details unavailable"}</strong>
            </article>
            <article className="info-card">
              <span className="card-label">ORDER TOTAL</span>
              <strong>{result.order.total_amount == null ? "Not available" : `₹${Number(result.order.total_amount).toFixed(2)}`}</strong>
            </article>
            <article className="info-card">
              <span className="card-label">PAYMENT</span>
              <strong>{result.payment?.payment_status || "Not available"}</strong>
              <span className="muted">{result.payment?.payment_method || ""}</span>
            </article>
          </div>

          <div className="content-grid">
            <article className="panel">
              <div className="panel-heading"><div><p className="section-kicker">YOUR PACKAGE</p><h3>Shipment details</h3></div><span className="package-icon">▣</span></div>
              {result.shipment ? (
                <div className="detail-list">
                  <div><span>Shipment ID</span><strong>#{result.shipment.shipment_id}</strong></div>
                  <div><span>Warehouse</span><strong>{result.shipment.warehouse_name || "Not assigned"}</strong></div>
                  <div><span>Dispatch city</span><strong>{result.shipment.warehouse_city || "Not available"}</strong></div>
                  <div><span>Delivery agent</span><strong>{result.shipment.agent_name || "Not assigned"}</strong></div>
                  <div><span>Agent phone</span><strong>{result.shipment.agent_phone || "Not available"}</strong></div>
                </div>
              ) : <p className="empty">No shipment has been created for this order yet.</p>}
            </article>

            <article className="panel">
              <div className="panel-heading"><div><p className="section-kicker">LIVE UPDATES</p><h3>Tracking history</h3></div><span className="package-icon">⌁</span></div>
              {result.tracking.length ? (
                <ol className="timeline">
                  {result.tracking.map((event) => (
                    <li key={event.tracking_id}>
                      <span className="timeline-dot" />
                      <div><strong>{event.status || "Update"}</strong><p>{event.current_location || "Location not provided"}</p><small>{formatDate(event.update_time)}</small></div>
                    </li>
                  ))}
                </ol>
              ) : <p className="empty">No tracking updates are available yet.</p>}
            </article>
          </div>

          <article className="panel products-panel">
            <div className="panel-heading"><div><p className="section-kicker">ORDER CONTENTS</p><h3>Products in this order</h3></div><span className="product-count">{result.items.length} item type(s)</span></div>
            {result.items.length ? (
              <div className="table-wrap"><table><thead><tr><th>PRODUCT</th><th>CATEGORY</th><th>QUANTITY</th><th>UNIT PRICE</th><th>SUBTOTAL</th></tr></thead>
                <tbody>{result.items.map((item) => <tr key={item.product_id}><td><strong>{item.product_name}</strong><small>Product #{item.product_id}</small></td><td>{item.category_name || "Uncategorized"}</td><td>{item.quantity}</td><td>₹{Number(item.price).toFixed(2)}</td><td>₹{(Number(item.price) * Number(item.quantity)).toFixed(2)}</td></tr>)}</tbody>
              </table></div>
            ) : <p className="empty">No product items are recorded for this order.</p>}
          </article>
        </section>
      )}

      <footer><span>trackly<span className="brand-dot">.</span></span><span>Delivery information connected to your database.</span></footer>
    </main>
  );
}
