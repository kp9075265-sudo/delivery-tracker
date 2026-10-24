"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { OrderDetails, type TrackingResult } from "@/components/order-details";

type StatusGroup = "pending" | "in_transit" | "delivered" | "other";

type DashboardData = {
  summary: {
    total_orders: number | string;
    delivered_orders: number | string;
    pending_orders: number | string;
    in_transit_orders: number | string;
    other_orders: number | string;
  };
  orders: Array<{
    order_id: number | string;
    order_date: string | null;
    display_status: string | null;
    status_group: StatusGroup;
    customer_name: string | null;
    total_amount: number | string | null;
  }>;
  limit: number;
};

const statusLabels: Record<StatusGroup, string> = {
  pending: "Pending / processing",
  in_transit: "In transit",
  delivered: "Delivered",
  other: "Other status"
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatAmount(value: number | string | null) {
  if (value == null || !Number.isFinite(Number(value))) return "Not available";
  return `₹${Number(value).toFixed(2)}`;
}

function statusClass(group: StatusGroup | null | undefined) {
  return `status${group ? ` ${group.replace("_", "-")}` : ""}`;
}

export default function Home() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [dashboardError, setDashboardError] = useState("");
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);

  const loadDashboard = useCallback(async (searchTerm: string, statusFilter: string) => {
    setDashboardLoading(true);
    setDashboardError("");
    try {
      const params = new URLSearchParams({ search: searchTerm, status: statusFilter });
      const response = await fetch(`/api/orders?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load the orders dashboard.");
      setDashboard(data);
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : "Something went wrong. Try again.");
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard("", "all");
  }, [loadDashboard]);

  async function searchOrders(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadDashboard(search.trim(), status);
  }

  async function trackOrder(orderId: number | string) {
    setDetailError("");
    setResult(null);
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/track/${encodeURIComponent(String(orderId))}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not find this order.");
      setResult(data);
      document.getElementById("order-details")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Something went wrong. Try again.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function changeStatus(value: string) {
    setStatus(value);
    await loadDashboard(search.trim(), value);
  }

  return (
    <main className="app-shell">
      <nav className="topbar" aria-label="Main navigation">
        <a className="brand" href="/" aria-label="Trackly dashboard">
          <span className="brand-icon" aria-hidden="true">T</span>
          <span>trackly<span className="brand-dot">.</span></span>
        </a>
        <span className="nav-label">DELIVERY OPERATIONS</span>
      </nav>

      <div className="dashboard">
        <header className="page-heading">
          <div>
            <p className="section-kicker">OVERVIEW</p>
            <h1>Delivery dashboard</h1>
            <p className="page-subtitle">A live view of orders and their latest delivery status.</p>
          </div>
          <button className="secondary-button" type="button" onClick={() => void loadDashboard(search.trim(), status)} disabled={dashboardLoading}>
            {dashboardLoading ? "Refreshing…" : "Refresh data"}
          </button>
        </header>

        {dashboardError && <div className="error-box" role="alert">{dashboardError}</div>}

        <section className="summary-grid" aria-label="Order summary" aria-busy={dashboardLoading}>
          {[
            { label: "Total orders", value: dashboard?.summary.total_orders, tone: "neutral" },
            { label: "Delivered", value: dashboard?.summary.delivered_orders, tone: "delivered" },
            { label: "Pending / processing", value: dashboard?.summary.pending_orders, tone: "pending" },
            { label: "In transit", value: dashboard?.summary.in_transit_orders, tone: "transit" }
          ].map((card) => (
            <article className={`summary-card ${card.tone}`} key={card.label}>
              <span className="card-label">{card.label}</span>
              <strong>{dashboardLoading && !dashboard ? "…" : Number(card.value ?? 0).toLocaleString()}</strong>
              <span className="summary-note">Live database count</span>
            </article>
          ))}
        </section>

        <section className="panel orders-panel" aria-labelledby="orders-heading">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">ORDER MANAGEMENT</p>
              <h2 id="orders-heading">Recent orders</h2>
            </div>
            <span className="product-count">
              {dashboard ? `Showing up to ${dashboard.limit} matching orders` : "Latest orders"}
            </span>
          </div>

          <form className="filters" onSubmit={searchOrders}>
            <div className="search-field">
              <label htmlFor="order-search">Search orders</label>
              <input
                id="order-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Order ID or customer name"
                autoComplete="off"
              />
            </div>
            <div className="status-field">
              <label htmlFor="status-filter">Filter by status</label>
              <select id="status-filter" value={status} onChange={(event) => void changeStatus(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="pending">Pending / processing</option>
                <option value="in_transit">In transit</option>
                <option value="delivered">Delivered</option>
                <option value="other">Other / unrecognized</option>
              </select>
            </div>
            <button className="primary-button search-button" type="submit" disabled={dashboardLoading}>
              {dashboardLoading ? "Searching…" : "Search"}
            </button>
          </form>

          {dashboardLoading && <p className="loading-message" role="status">Loading orders from the database…</p>}
          {!dashboardLoading && !dashboardError && dashboard?.orders.length === 0 && (
            <p className="empty">No orders match this search. Try another ID, customer name, or status.</p>
          )}
          {dashboard?.orders.length ? (
            <div className="table-wrap" aria-busy={dashboardLoading}>
              <table>
                <thead>
                  <tr><th scope="col">ORDER</th><th scope="col">CUSTOMER</th><th scope="col">DATE</th><th scope="col">STATUS</th><th scope="col">TOTAL</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody>
                  {dashboard.orders.map((order) => (
                    <tr key={String(order.order_id)}>
                      <td><strong>#{order.order_id}</strong></td>
                      <td>{order.customer_name || "Customer details unavailable"}</td>
                      <td>{formatDate(order.order_date)}</td>
                      <td>
                        <span className={statusClass(order.status_group)}>{order.display_status || statusLabels[order.status_group]}</span>
                      </td>
                      <td>{formatAmount(order.total_amount)}</td>
                      <td>
                        <button className="text-button" type="button" onClick={() => void trackOrder(order.order_id)} disabled={detailLoading}>
                          {detailLoading ? "Loading…" : "View details"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        {detailError && <div className="error-box detail-error" role="alert">{detailError}</div>}

        {result && <OrderDetails result={result} showFullPageLink />}
      </div>

      <footer><span>trackly<span className="brand-dot">.</span></span><span>Order and shipment data comes from your PostgreSQL database.</span></footer>
    </main>
  );
}
