"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { OrderDetails, type TrackingResult } from "@/components/order-details";
import { AnimatedStat } from "@/components/animated-stat";
import { NotificationBell } from "@/components/notification-bell";

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

function statusClass(group: StatusGroup | null | undefined) {
  return `status${group ? ` ${group.replace("_", "-")}` : ""}`;
}

export function CustomerDashboard() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dashboardError, setDashboardError] = useState("");
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);

  const loadDashboard = useCallback(async (searchTerm: string, statusFilter: string, startDate: string, endDate: string) => {
    setDashboardLoading(true);
    setDashboardError("");
    try {
      const params = new URLSearchParams({
        search: searchTerm,
        status: statusFilter,
        dateFrom: startDate,
        dateTo: endDate
      });
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
    void loadDashboard("", "all", "", "");
  }, [loadDashboard]);

  async function searchOrders(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadDashboard(search.trim(), status, dateFrom, dateTo);
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
    await loadDashboard(search.trim(), value, dateFrom, dateTo);
  }

  const statusCounts = dashboard ? [
    { group: "delivered", label: "Delivered", value: Number(dashboard.summary.delivered_orders) },
    { group: "pending", label: "Pending / processing", value: Number(dashboard.summary.pending_orders) },
    { group: "in-transit", label: "In transit", value: Number(dashboard.summary.in_transit_orders) },
    { group: "other", label: "Other / unrecognized", value: Number(dashboard.summary.other_orders) }
  ] : [];
  const totalOrders = Number(dashboard?.summary.total_orders ?? 0);
  const deliveredOrders = Number(dashboard?.summary.delivered_orders ?? 0);
  const deliverySuccessRate = totalOrders > 0
    ? Math.round((deliveredOrders / totalOrders) * 1000) / 10
    : null;

  return (
    <main className="app-shell">
      <nav className="topbar" aria-label="Main navigation">
        <a className="brand" href="/" aria-label="Trackly dashboard">
          <span className="brand-icon" aria-hidden="true">T</span>
          <span>trackly<span className="brand-dot">.</span></span>
        </a>
        <div className="nav-actions">
          <span className="nav-label">DELIVERY OPERATIONS</span>
          <NotificationBell />
          <Link className="nav-link customer-login-link" href="/login">Customer sign in</Link>
          <Link className="primary-button nav-create" href="/admin">Admin</Link>
        </div>
      </nav>

      <div className="dashboard">
        <header className="page-heading">
          <div>
            <p className="section-kicker">OVERVIEW</p>
            <h1>Delivery dashboard</h1>
            <p className="page-subtitle">A live view of orders and their latest delivery status.</p>
          </div>
          <button className="secondary-button" type="button" onClick={() => void loadDashboard(search.trim(), status, dateFrom, dateTo)} disabled={dashboardLoading}>
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
            <article className={`summary-card ${card.tone} motion-enter`} key={card.label}>
              <span className="card-label">{card.label}</span>
              <strong><AnimatedStat value={card.value} loading={dashboardLoading && !dashboard} /></strong>
              <span className="summary-note">Live database count</span>
            </article>
          ))}
        </section>

        <section className="analytics-grid" aria-label="Delivery analytics" aria-busy={dashboardLoading}>
          <article className="panel success-panel motion-enter">
            <p className="section-kicker">DELIVERY PERFORMANCE</p>
            <h2>Delivery success</h2>
            <strong className="success-rate">
              {dashboardLoading && !dashboard ? "…" : deliverySuccessRate == null ? "—" : `${deliverySuccessRate}%`}
            </strong>
            <p className="muted">
              {totalOrders > 0
                ? `${deliveredOrders.toLocaleString()} delivered out of ${totalOrders.toLocaleString()} total orders.`
                : "No orders are available to calculate a delivery rate."}
            </p>
          </article>
          <article className="panel distribution-panel motion-enter">
            <div className="panel-heading">
              <div><p className="section-kicker">LIVE DATABASE COUNTS</p><h2>Order status distribution</h2></div>
            </div>
            {dashboard && totalOrders > 0 ? (
              <div className="distribution-chart" role="img" aria-label={`Order status distribution across ${totalOrders} orders`}>
                {statusCounts.map((item) => {
                  const percentage = (item.value / totalOrders) * 100;
                  return (
                    <div className="chart-row" key={item.group}>
                      <div className="chart-label"><span>{item.label}</span><strong>{item.value.toLocaleString()}</strong></div>
                      <div className="chart-track" aria-hidden="true">
                        <span className={`chart-bar ${item.group}`} style={{ width: `${percentage}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="empty">{dashboardLoading ? "Loading status distribution…" : "No order data is available yet."}</p>
            )}
          </article>
        </section>

        <section className="panel orders-panel" aria-labelledby="orders-heading">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">ORDER MANAGEMENT</p>
              <h2 id="orders-heading">Recent orders</h2>
            </div>
            <span className="product-count">
              {dashboard ? `Showing ${dashboard.orders.length} of up to ${dashboard.limit} matching orders` : "Latest orders"}
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
                placeholder="Order ID"
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
            <div className="date-field">
              <label htmlFor="date-from">From order date</label>
              <input id="date-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </div>
            <div className="date-field">
              <label htmlFor="date-to">To order date</label>
              <input id="date-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </div>
            <button className="primary-button search-button" type="submit" disabled={dashboardLoading}>
              {dashboardLoading ? "Searching…" : "Search"}
            </button>
          </form>

          {dashboardLoading && <p className="loading-message" role="status">Loading orders from the database…</p>}
          {!dashboardLoading && !dashboardError && dashboard?.orders.length === 0 && (
            <p className="empty">No orders match this search. Try another ID or status.</p>
          )}
          {dashboard?.orders.length ? (
            <div className="table-wrap" aria-busy={dashboardLoading}>
              <table>
                <thead>
                  <tr><th scope="col">ORDER</th><th scope="col">DATE</th><th scope="col">STATUS</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody>
                  {dashboard.orders.map((order) => (
                    <tr key={String(order.order_id)}>
                      <td><strong>#{order.order_id}</strong></td>
                      <td>{formatDate(order.order_date)}</td>
                      <td>
                        <span className={statusClass(order.status_group)}>{order.display_status || statusLabels[order.status_group]}</span>
                      </td>
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
