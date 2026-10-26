"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminNavigation } from "@/components/admin-navigation";
import { AnimatedStat } from "@/components/animated-stat";

type AdminDashboardData = {
  summary: Record<string, number | string>;
  totalCustomers: number | string;
  recentOrders: Array<{
    order_id: number;
    order_date: string | null;
    display_status: string | null;
    status_group: string;
    customer_name: string | null;
    total_amount: number | string | null;
  }>;
  recentActivity: Array<{
    activity_id: number;
    activity_type: string;
    status: string | null;
    current_location: string | null;
    activity_time: string | null;
    order_id: number;
    customer_name: string | null;
  }>;
  dailyOrders?: Array<{ date: string; total: number | string; delivered: number | string }>;
};

function formatDate(value: string | null) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function amount(value: number | string | null) {
  return value == null || !Number.isFinite(Number(value)) ? "Not available" : `₹${Number(value).toFixed(2)}`;
}

export function AdminDashboard() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/admin/dashboard", { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load the dashboard.");
        setData(body);
      } catch (requestError) {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Could not load the dashboard.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  const total = Number(data?.summary.total_orders ?? 0);
  const chartItems = [
    ["Pending", Number(data?.summary.pending_orders ?? 0), "pending"],
    ["Processing", Number(data?.summary.processing_orders ?? 0), "processing"],
    ["In transit", Number(data?.summary.in_transit_orders ?? 0), "transit"],
    ["Delivered", Number(data?.summary.delivered_orders ?? 0), "delivered"],
    ["Other", Number(data?.summary.other_orders ?? 0), "other"]
  ] as const;

  return (
    <main className="app-shell">
      <AdminNavigation />
      <div className="dashboard">
        <header className="page-heading">
          <div><p className="section-kicker">ADMINISTRATION</p><h1>Operations overview</h1><p className="page-subtitle">Live order and customer data from PostgreSQL.</p></div>
          <Link className="primary-button" href="/admin/orders/new">Create an order</Link>
        </header>
        {error && <div className="error-box" role="alert">{error}</div>}
        <section className="summary-grid admin-summary" aria-label="Admin statistics" aria-busy={loading}>
          {[
            ["Total orders", "total_orders"],
            ["Pending", "pending_orders"],
            ["Processing", "processing_orders"],
            ["In transit", "in_transit_orders"],
            ["Delivered", "delivered_orders"]
          ].map(([label, key]) => (
            <article className="summary-card motion-enter" key={key}>
              <span className="card-label">{label}</span>
              <strong><AnimatedStat value={data?.summary[key]} loading={loading && !data} /></strong>
              <span className="summary-note">Live database count</span>
            </article>
          ))}
          <article className="summary-card motion-enter"><span className="card-label">Total customers</span><strong><AnimatedStat value={data?.totalCustomers} loading={loading && !data} /></strong><span className="summary-note">Customer records</span></article>
        </section>

        <section className="admin-analytics">
          <article className="panel motion-enter">
            <div className="panel-heading"><div><p className="section-kicker">ALL ORDERS</p><h2>Status distribution</h2></div></div>
            {total > 0 ? <div className="distribution-chart">
              {chartItems.map(([label, value, tone]) => (
                <div className="chart-row" key={label}>
                  <div className="chart-label"><span>{label}</span><strong>{value.toLocaleString()}</strong></div>
                  <div className="chart-track"><span className={`chart-bar ${tone}`} style={{ width: `${Math.min(100, (value / total) * 100)}%` }} /></div>
                </div>
              ))}
            </div> : <p className="empty">{loading ? "Loading order statistics…" : "No orders available."}</p>}
          </article>
          <article className="panel motion-enter">
            <div className="panel-heading"><div><p className="section-kicker">LATEST TRACKING</p><h2>Recent order activity</h2></div></div>
            {data?.recentActivity.length ? <ol className="activity-list">
              {data.recentActivity.map((activity) => (
                <li key={`${activity.activity_type}-${activity.activity_id}`}>
                  <div><strong>{activity.status || "Tracking update"} · Order #{activity.order_id}</strong>
                    <p>{activity.customer_name || "Customer"}{activity.current_location ? ` · ${activity.current_location}` : ""}</p>
                  <small>{formatDate(activity.activity_time)}</small>
                  </div>
                </li>
              ))}
            </ol> : <p className="empty">{loading ? "Loading activity…" : "No tracking activity yet."}</p>}
          </article>
        </section>

        <section className="panel motion-enter admin-daily-panel">
          <div className="panel-heading"><div><p className="section-kicker">LAST 7 DAYS</p><h2>Daily order activity</h2></div></div>
          {data?.dailyOrders?.length ? (
            <div className="daily-chart" role="img" aria-label="Daily orders and delivered orders for the last seven days">
              {data.dailyOrders.map((day) => {
                const total = Number(day.total);
                const delivered = Number(day.delivered);
                const max = Math.max(...data.dailyOrders!.map((entry) => Number(entry.total)), 1);
                return (
                  <div className="daily-chart-column" key={day.date} title={`${total} orders, ${delivered} delivered`}>
                    <div className="daily-chart-bars">
                      <span className="daily-chart-total" style={{ height: `${Math.max(total > 0 ? 6 : 0, (total / max) * 100)}%` }} />
                      <span className="daily-chart-delivered" style={{ height: `${Math.max(delivered > 0 ? 6 : 0, (delivered / max) * 100)}%` }} />
                    </div>
                    <strong>{new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" })}</strong>
                    <small>{total}</small>
                  </div>
                );
              })}
            </div>
          ) : <p className="empty">{loading ? "Loading daily activity…" : "No recent order activity."}</p>}
          <p className="chart-legend"><span className="legend-total" /> Total orders <span className="legend-delivered" /> Delivered orders</p>
        </section>

        <section className="panel orders-panel">
          <div className="panel-heading"><div><p className="section-kicker">LATEST RECORDS</p><h2>Recent orders</h2></div><Link className="text-button" href="/admin/orders">Manage all orders</Link></div>
          {data?.recentOrders.length ? <div className="table-wrap"><table>
            <thead><tr><th scope="col">ORDER</th><th scope="col">CUSTOMER</th><th scope="col">DATE</th><th scope="col">STATUS</th><th scope="col">TOTAL</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{data.recentOrders.map((order) => <tr key={order.order_id}>
              <td><strong>#{order.order_id}</strong></td><td>{order.customer_name || "Customer"}</td><td>{formatDate(order.order_date)}</td>
              <td><span className={`status ${order.status_group.replace("_", "-")}`}>{order.display_status || "Unknown"}</span></td>
              <td>{amount(order.total_amount)}</td><td><Link className="text-button" href={`/admin/orders/${order.order_id}`}>Manage</Link></td>
            </tr>)}</tbody>
          </table></div> : <p className="empty">{loading ? "Loading orders…" : "No orders available."}</p>}
        </section>
      </div>
      <footer><span>trackly<span className="brand-dot">.</span></span><span>Administrator activity uses the existing PostgreSQL records.</span></footer>
    </main>
  );
}
