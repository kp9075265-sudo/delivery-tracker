import Link from "next/link";

export type TrackingResult = {
  order: {
    order_id: number;
    order_date: string | null;
    order_status: string | null;
    total_amount: number | string | null;
    customer_name: string | null;
    delivery_address: string | null;
  };
  shipment: {
    shipment_id: number;
    shipment_status: string | null;
    warehouse_name: string | null;
    warehouse_city: string | null;
    agent_name: string | null;
  } | null;
  items: Array<{
    product_id: number;
    product_name: string;
    quantity: number;
    price: number | string;
    category_name: string | null;
  }>;
  tracking: Array<{
    tracking_id: number;
    current_location: string | null;
    status: string | null;
    update_time: string | null;
  }>;
  payment: { payment_method: string | null; payment_status: string | null } | null;
  publicTracking?: boolean;
};

type StatusGroup = "pending" | "in_transit" | "delivered" | "other";

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatAmount(value: number | string | null) {
  if (value == null || !Number.isFinite(Number(value))) return "Not available";
  return `₹${Number(value).toFixed(2)}`;
}

function classifyStatus(value: string | null | undefined): StatusGroup {
  const status = (value || "").toLowerCase();
  if (status.includes("deliver") && !status.includes("undeliver") && !status.includes("not deliver")) return "delivered";
  if (["transit", "shipping", "shipped", "dispatched", "out for delivery"].some((word) => status.includes(word))) return "in_transit";
  if (status.includes("pending") || status.includes("process")) return "pending";
  return "other";
}

function statusClass(group: StatusGroup) {
  return `status ${group.replace("_", "-")}`;
}

export function OrderDetails({ result, showFullPageLink = false }: { result: TrackingResult; showFullPageLink?: boolean }) {
  const status = result.shipment?.shipment_status || result.order.order_status;
  const group = classifyStatus(status);

  return (
    <section className="details-section" id="order-details" aria-live="polite" aria-labelledby="detail-title">
      <div className="result-heading">
        <div>
          <p className="section-kicker">ORDER DETAILS</p>
          <h2 id="detail-title">Order #{result.order.order_id}</h2>
          <p className="muted">Placed {formatDate(result.order.order_date)}</p>
        </div>
        <div className="detail-actions">
          <span className={statusClass(group)}>{status || "Status unavailable"}</span>
          {showFullPageLink && <Link className="text-button" href={`/orders/${result.order.order_id}`}>Open details page</Link>}
        </div>
      </div>

      {!result.publicTracking && <div className="summary-grid detail-summary">
        <article className="info-card"><span className="card-label">CUSTOMER</span><strong>{result.order.customer_name || "Customer details unavailable"}</strong></article>
        <article className="info-card"><span className="card-label">ORDER TOTAL</span><strong>{formatAmount(result.order.total_amount)}</strong></article>
        <article className="info-card"><span className="card-label">PAYMENT</span><strong>{result.payment?.payment_status || "Not available"}</strong><span className="muted">{result.payment?.payment_method || ""}</span></article>
        <article className="info-card"><span className="card-label">DELIVERY ADDRESS</span><strong>{result.order.delivery_address || "No address saved for this order"}</strong></article>
      </div>}

      <div className="content-grid">
        <article className="panel">
          <div className="panel-heading"><div><p className="section-kicker">YOUR PACKAGE</p><h3>Shipment details</h3></div><span className="package-icon" aria-hidden="true">▣</span></div>
          {result.shipment ? (
            <div className="detail-list">
              <div><span>Shipment ID</span><strong>#{result.shipment.shipment_id}</strong></div>
              {!result.publicTracking && <>
                <div><span>Warehouse</span><strong>{result.shipment.warehouse_name || "Not assigned"}</strong></div>
                <div><span>Dispatch city</span><strong>{result.shipment.warehouse_city || "Not available"}</strong></div>
                <div><span>Delivery agent</span><strong>{result.shipment.agent_name || "Not assigned"}</strong></div>
              </>}
            </div>
          ) : <p className="empty">No shipment has been created for this order yet.</p>}
        </article>

        <article className="panel">
          <div className="panel-heading"><div><p className="section-kicker">TRACKING UPDATES</p><h3>Delivery timeline</h3></div><span className="package-icon" aria-hidden="true">⌁</span></div>
          {result.tracking.length ? (
            <ol className="timeline">
              {result.tracking.map((event, index) => (
                <li className={index === 0 ? "timeline-current" : "timeline-complete"} key={event.tracking_id}>
                  <span className="timeline-dot" aria-hidden="true" />
                  <div><strong>{event.status || "Update"}</strong><p>{event.current_location || "Location not provided"}</p><small>{formatDate(event.update_time)}</small></div>
                </li>
              ))}
            </ol>
          ) : <p className="empty">No tracking updates are available yet.</p>}
        </article>
      </div>

      {!result.publicTracking && <article className="panel products-panel">
        <div className="panel-heading"><div><p className="section-kicker">ORDER CONTENTS</p><h3>Products in this order</h3></div><span className="product-count">{result.items.length} item type(s)</span></div>
        {result.items.length ? (
          <div className="table-wrap"><table><thead><tr><th scope="col">PRODUCT</th><th scope="col">CATEGORY</th><th scope="col">QUANTITY</th><th scope="col">UNIT PRICE</th><th scope="col">SUBTOTAL</th></tr></thead>
            <tbody>{result.items.map((item) => <tr key={item.product_id}><td><strong>{item.product_name}</strong><small>Product #{item.product_id}</small></td><td>{item.category_name || "Uncategorized"}</td><td>{item.quantity}</td><td>{formatAmount(item.price)}</td><td>{formatAmount(Number(item.price) * Number(item.quantity))}</td></tr>)}</tbody>
          </table></div>
        ) : <p className="empty">No product items are recorded for this order.</p>}
      </article>}
    </section>
  );
}
