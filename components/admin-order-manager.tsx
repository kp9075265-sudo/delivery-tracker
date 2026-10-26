"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AdminNavigation } from "@/components/admin-navigation";

type OrderDetail = {
  order: {
    order_id: number;
    customer_name: string | null;
    customer_email: string | null;
    order_date: string | null;
    order_status: string | null;
    total_amount: number | string | null;
    street: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    country: string | null;
  };
  shipment: {
    shipment_id: number;
    shipment_status: string | null;
    agent_id: number | null;
    warehouse_id: number | null;
    agent_name: string | null;
    warehouse_name: string | null;
  } | null;
  items: Array<{ order_item_id: number; product_name: string; quantity: number; price: number | string }>;
  payments: Array<{ payment_id: number; payment_method: string | null; payment_status: string | null; payment_date: string | null }>;
  tracking: Array<{ tracking_id: number; status: string | null; current_location: string | null; update_time: string | null }>;
};

type Options = {
  warehouses: Array<{ warehouse_id: number; warehouse_name: string; city: string | null }>;
  agents: Array<{ agent_id: number; name: string; availability: boolean | null }>;
};

const shipmentStatuses = ["In Transit", "Out for Delivery", "Delivered"];

function dateLabel(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function AdminOrderManager({ orderId }: { orderId: string }) {
  const [data, setData] = useState<OrderDetail | null>(null);
  const [options, setOptions] = useState<Options>({ warehouses: [], agents: [] });
  const [shipmentStatus, setShipmentStatus] = useState("");
  const [agentId, setAgentId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadOrder() {
    setLoading(true);
    setError("");
    try {
      const [orderResponse, optionsResponse] = await Promise.all([
        fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`),
        fetch("/api/admin/order-options")
      ]);
      const orderBody = await orderResponse.json();
      const optionsBody = await optionsResponse.json();
      if (!orderResponse.ok) throw new Error(orderBody.error || "Could not load this order.");
      if (!optionsResponse.ok) throw new Error(optionsBody.error || "Could not load assignment options.");
      setData(orderBody);
      setOptions(optionsBody);
      setShipmentStatus(orderBody.shipment?.shipment_status || "");
      setAgentId(orderBody.shipment?.agent_id ? String(orderBody.shipment.agent_id) : "");
      setWarehouseId(orderBody.shipment?.warehouse_id ? String(orderBody.shipment.warehouse_id) : "");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load this order.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrder();
  }, [orderId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload: Record<string, string> = {};
      if (shipmentStatus && shipmentStatus !== data?.shipment?.shipment_status) payload.shipmentStatus = shipmentStatus;
      if (agentId && agentId !== String(data?.shipment?.agent_id ?? "")) payload.agentId = agentId;
      if (warehouseId && warehouseId !== String(data?.shipment?.warehouse_id ?? "")) payload.warehouseId = warehouseId;
      if (Object.keys(payload).length === 0) throw new Error("Choose a change before saving.");
      if (payload.shipmentStatus) payload.currentLocation = location.trim();

      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not update the shipment.");
      setMessage(body.changed
        ? `Order and shipment changes saved.${body.smsWarning ? ` SMS failed: ${body.smsWarning} See SMS history for details.` : ""}`
        : "No changes were needed.");
      await loadOrder();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="app-shell">
      <AdminNavigation />
      <div className="dashboard">
        <header className="page-heading"><div><p className="section-kicker">ORDER MANAGEMENT</p><h1>Order #{orderId}</h1><p className="page-subtitle">Review order records and update its shipment.</p></div><Link className="secondary-button back-link" href="/admin/orders">Back to orders</Link></header>
        {loading && <p className="loading-message" role="status">Loading order details…</p>}
        {error && <div className="error-box" role="alert">{error}</div>}
        {message && <div className="success-box" role="status">{message}</div>}
        {data && <>
          <div className="admin-detail-grid">
            <section className="panel">
              <div className="panel-heading"><div><p className="section-kicker">CUSTOMER & ORDER</p><h2>Order information</h2></div></div>
              <div className="detail-list">
                <div><span>Customer</span><strong>{data.order.customer_name || "Not available"}</strong></div>
                <div><span>Email</span><strong>{data.order.customer_email || "Not available"}</strong></div>
                <div><span>Order date</span><strong>{dateLabel(data.order.order_date)}</strong></div>
                <div><span>Order status</span><strong>{data.order.order_status || "Not available"}</strong></div>
                <div><span>Total</span><strong>{data.order.total_amount == null ? "Not available" : `₹${Number(data.order.total_amount).toFixed(2)}`}</strong></div>
                <div><span>Delivery address</span><strong>{[data.order.street,data.order.city,data.order.state,data.order.pincode,data.order.country].filter(Boolean).join(", ") || "No saved address"}</strong></div>
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading"><div><p className="section-kicker">SHIPMENT</p><h2>Update delivery</h2></div></div>
              <form className="admin-update-form" onSubmit={save}>
                <div><label htmlFor="shipment-status">Shipment status</label><select id="shipment-status" value={shipmentStatus} onChange={(event) => setShipmentStatus(event.target.value)}>
                  <option value="">No status change</option>{shipmentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </select></div>
                <div><label htmlFor="agent-assignment">Delivery agent</label><select id="agent-assignment" value={agentId} onChange={(event) => setAgentId(event.target.value)}>
                  <option value="">No agent selected</option>{options.agents.map((agent) => <option key={agent.agent_id} value={agent.agent_id} disabled={agent.availability === false}>{agent.name} {agent.availability === false ? "(unavailable)" : ""}</option>)}
                </select></div>
                <div><label htmlFor="warehouse-assignment">Warehouse</label><select id="warehouse-assignment" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
                  <option value="">No warehouse selected</option>{options.warehouses.map((warehouse) => <option key={warehouse.warehouse_id} value={warehouse.warehouse_id}>{warehouse.warehouse_name}{warehouse.city ? ` · ${warehouse.city}` : ""}</option>)}
                </select></div>
                <div><label htmlFor="tracking-location">Tracking location (optional)</label><input id="tracking-location" value={location} onChange={(event) => setLocation(event.target.value)} maxLength={255} placeholder="Location for the status update" /></div>
                <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save shipment update"}</button>
              </form>
            </section>
          </div>
          <div className="admin-detail-grid">
            <section className="panel"><div className="panel-heading"><div><p className="section-kicker">ORDER CONTENTS</p><h2>Products</h2></div></div>
              {data.items.length ? <div className="table-wrap"><table><thead><tr><th scope="col">PRODUCT</th><th scope="col">QUANTITY</th><th scope="col">UNIT PRICE</th><th scope="col">SUBTOTAL</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.order_item_id}><td>{item.product_name}</td><td>{item.quantity}</td><td>₹{Number(item.price).toFixed(2)}</td><td>₹{(Number(item.price) * item.quantity).toFixed(2)}</td></tr>)}</tbody></table></div> : <p className="empty">No items saved for this order.</p>}
            </section>
            <section className="panel"><div className="panel-heading"><div><p className="section-kicker">PAYMENTS</p><h2>Payment history</h2></div></div>
              {data.payments.length ? <ul className="plain-list">{data.payments.map((payment) => <li key={payment.payment_id}><strong>{payment.payment_method || "Method unavailable"} · {payment.payment_status || "Status unavailable"}</strong><small>{dateLabel(payment.payment_date)}</small></li>)}</ul> : <p className="empty">No payment record is linked to this order.</p>}
            </section>
          </div>
          <section className="panel"><div className="panel-heading"><div><p className="section-kicker">AUDIT TRAIL</p><h2>Tracking history</h2></div></div>
            {data.tracking.length ? <ol className="timeline">{data.tracking.map((event) => <li key={event.tracking_id}><span className="timeline-dot" aria-hidden="true" /><div><strong>{event.status || "Update"}</strong><p>{event.current_location || "Location not provided"}</p><small>{dateLabel(event.update_time)}</small></div></li>)}</ol> : <p className="empty">No tracking updates for this order yet.</p>}
          </section>
        </>}
      </div>
      <footer><span>trackly<span className="brand-dot">.</span></span><span>Status changes and tracking updates are stored together.</span></footer>
    </main>
  );
}
