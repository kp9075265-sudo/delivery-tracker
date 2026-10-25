"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AdminNavigation } from "@/components/admin-navigation";

type OrderRow = {
  order_id: number;
  order_date: string | null;
  display_status: string | null;
  status_group: string;
  customer_name: string | null;
  total_amount: number | string | null;
};

function dateLabel(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function AdminOrders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadOrders(searchTerm = search, statusFilter = status) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ search: searchTerm, status: statusFilter });
      const response = await fetch(`/api/admin/orders?${params.toString()}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load orders.");
      setOrders(body.orders);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load orders.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders("", "all");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadOrders(search.trim(), status);
  }

  return (
    <main className="app-shell">
      <AdminNavigation />
      <div className="dashboard">
        <header className="page-heading"><div><p className="section-kicker">ADMINISTRATION</p><h1>Manage orders</h1><p className="page-subtitle">Search and manage existing customer orders.</p></div><Link className="primary-button" href="/admin/orders/new">Create an order</Link></header>
        <section className="panel">
          <form className="filters admin-filters" onSubmit={submit}>
            <div><label htmlFor="admin-order-search">Search orders</label><input id="admin-order-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order ID or customer name" /></div>
            <div><label htmlFor="admin-status">Filter by status</label><select id="admin-status" value={status} onChange={(event) => { setStatus(event.target.value); void loadOrders(search.trim(), event.target.value); }}>
              <option value="all">All statuses</option><option value="pending">Pending / placed</option><option value="processing">Processing</option><option value="in_transit">In transit</option><option value="delivered">Delivered</option><option value="other">Other</option>
            </select></div>
            <button className="primary-button search-button" type="submit" disabled={loading}>{loading ? "Loading…" : "Search"}</button>
          </form>
          {error && <div className="error-box" role="alert">{error}</div>}
          {loading && <p className="loading-message" role="status">Loading orders…</p>}
          {!loading && !error && orders.length === 0 && <p className="empty">No matching orders found.</p>}
          {orders.length > 0 && <div className="table-wrap"><table>
            <thead><tr><th scope="col">ORDER</th><th scope="col">CUSTOMER</th><th scope="col">DATE</th><th scope="col">STATUS</th><th scope="col">TOTAL</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{orders.map((order) => <tr key={order.order_id}>
              <td><strong>#{order.order_id}</strong></td><td>{order.customer_name || "Customer"}</td><td>{dateLabel(order.order_date)}</td>
              <td><span className={`status ${order.status_group.replace("_", "-")}`}>{order.display_status || "Unknown"}</span></td>
              <td>{order.total_amount == null ? "Not available" : `₹${Number(order.total_amount).toFixed(2)}`}</td>
              <td><Link className="text-button" href={`/admin/orders/${order.order_id}`}>Manage</Link></td>
            </tr>)}</tbody>
          </table></div>}
        </section>
      </div>
      <footer><span>trackly<span className="brand-dot">.</span></span><span>Administrator order management</span></footer>
    </main>
  );
}
