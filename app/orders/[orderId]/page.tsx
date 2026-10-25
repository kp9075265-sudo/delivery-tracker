"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { OrderDetails, type TrackingResult } from "@/components/order-details";

export default function OrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadOrder() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/track/${encodeURIComponent(orderId)}`, {
          signal: controller.signal
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load this order.");
        setResult(data);
      } catch (requestError) {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Something went wrong. Try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadOrder();
    return () => controller.abort();
  }, [orderId]);

  return (
    <main className="app-shell">
      <nav className="topbar" aria-label="Main navigation">
        <Link className="brand" href="/" aria-label="Trackly dashboard">
          <span className="brand-icon" aria-hidden="true">T</span>
          <span>trackly<span className="brand-dot">.</span></span>
        </Link>
        <div className="nav-actions">
          <span className="nav-label">ORDER DETAILS</span>
          <Link className="primary-button nav-create" href="/admin">Admin</Link>
        </div>
      </nav>
      <div className="dashboard">
        <header className="page-heading">
          <div>
            <p className="section-kicker">DELIVERY TRACKING</p>
            <h1>Order #{orderId}</h1>
            <p className="page-subtitle">Shipment and tracking information from your database.</p>
          </div>
          <Link className="secondary-button back-link" href="/">Back to dashboard</Link>
        </header>

        {loading && <p className="loading-message" role="status">Loading order details…</p>}
        {error && <div className="error-box" role="alert">{error}</div>}
        {result && <OrderDetails result={result} />}
      </div>
      <footer><span>trackly<span className="brand-dot">.</span></span><span>Order and shipment data comes from your PostgreSQL database.</span></footer>
    </main>
  );
}
