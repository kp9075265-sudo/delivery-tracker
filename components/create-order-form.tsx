"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AdminNavigation } from "@/components/admin-navigation";

type Options = {
  customers: Array<{ customer_id: number; name: string }>;
  products: Array<{ product_id: number; product_name: string; price: string | number | null; stock_quantity: number | null }>;
  paymentMethods: string[];
  addresses: Array<{ address_id: number; street: string | null; city: string | null; state: string | null; pincode: string | null; country: string | null }>;
};

type LineItem = { productId: string; quantity: string };

export function CreateOrderForm() {
  const [options, setOptions] = useState<Options>({ customers: [], products: [], paymentMethods: [], addresses: [] });
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ productId: "", quantity: "1" }]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function loadOptions() {
      setLoadingOptions(true);
      try {
        const query = customerId ? `?customerId=${encodeURIComponent(customerId)}` : "";
        const response = await fetch(`/api/admin/order-options${query}`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load order options.");
        setOptions(body);
        if (!paymentMethod && body.paymentMethods.length) setPaymentMethod(body.paymentMethods[0]);
      } catch (requestError) {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Could not load order options.");
      } finally {
        if (!controller.signal.aborted) setLoadingOptions(false);
      }
    }
    void loadOptions();
    return () => controller.abort();
  }, [customerId, paymentMethod]);

  function updateItem(index: number, key: keyof LineItem, value: string) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const formData = new FormData(form);
      const response = await fetch("/api/admin/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          addressId: formData.get("addressId"),
          paymentMethod,
          items: items.map((item) => ({ productId: item.productId, quantity: item.quantity }))
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not create the order.");
      setSuccess(`Order #${body.orderId} created. Server-calculated total: ₹${Number(body.totalAmount).toFixed(2)}.${body.smsWarning ? ` SMS failed: ${body.smsWarning} See SMS history for details.` : ""}`);
      setItems([{ productId: "", quantity: "1" }]);
      form.reset();
      setCustomerId("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create the order.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <AdminNavigation />
      <div className="dashboard">
        <header className="page-heading"><div><p className="section-kicker">ADMINISTRATION</p><h1>Create order</h1><p className="page-subtitle">Choose existing records; prices and the total are verified by the server.</p></div><Link className="secondary-button back-link" href="/admin/orders">Back to orders</Link></header>
        {loadingOptions && <p className="loading-message" role="status">Loading customers, products, and payment options…</p>}
        {error && <div className="error-box" role="alert">{error}</div>}
        {success && <div className="success-box" role="status">{success} <Link href="/admin/orders">Go to order management</Link></div>}
        <form className="panel order-form" onSubmit={submit}>
          <div className="form-grid">
            <div><label htmlFor="new-customer">Customer</label><select id="new-customer" required value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">Choose customer</option>{options.customers.map((customer) => <option value={customer.customer_id} key={customer.customer_id}>{customer.name || `Customer #${customer.customer_id}`} (#{customer.customer_id})</option>)}
            </select></div>
            <div><label htmlFor="new-address">Delivery address</label><select id="new-address" name="addressId" required disabled={!customerId || options.addresses.length === 0}>
              <option value="">{!customerId ? "Choose a customer first" : "Choose address"}</option>{options.addresses.map((address) => <option value={address.address_id} key={address.address_id}>{[address.street,address.city,address.state,address.pincode,address.country].filter(Boolean).join(", ") || `Address #${address.address_id}`}</option>)}
            </select>{customerId && options.addresses.length === 0 && <small className="field-help">This customer has no saved address.</small>}</div>
            <div><label htmlFor="payment-method">Payment method</label><select id="payment-method" required value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
              <option value="">Choose method</option>{options.paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}
            </select><small className="field-help">The payment is recorded as Pending. Do not enter card details.</small></div>
          </div>
          <div className="line-items-heading"><h2>Products</h2><button className="secondary-button" type="button" onClick={() => setItems((current) => [...current, { productId: "", quantity: "1" }])} disabled={items.length >= 50}>Add product</button></div>
          <div className="line-items">{items.map((item, index) => (
            <div className="line-item-row" key={index}>
              <div><label htmlFor={`product-${index}`}>Product</label><select id={`product-${index}`} required value={item.productId} onChange={(event) => updateItem(index, "productId", event.target.value)}>
                <option value="">Choose product</option>{options.products.map((product) => <option value={product.product_id} key={product.product_id}>{product.product_name} · {product.price == null ? "price unavailable" : `₹${Number(product.price).toFixed(2)}`}</option>)}
              </select></div>
              <div><label htmlFor={`quantity-${index}`}>Quantity</label><input id={`quantity-${index}`} type="number" min="1" max="1000" required value={item.quantity} onChange={(event) => updateItem(index, "quantity", event.target.value)} /></div>
              <button className="remove-item-button" type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={items.length <= 1} aria-label={`Remove product row ${index + 1}`}>Remove</button>
            </div>
          ))}</div>
          <div className="form-actions"><button className="primary-button" type="submit" disabled={submitting || loadingOptions || options.products.length === 0 || options.paymentMethods.length === 0}>{submitting ? "Creating order…" : "Create order"}</button></div>
        </form>
      </div>
      <footer><span>trackly<span className="brand-dot">.</span></span><span>Order totals are calculated on the server from current product prices.</span></footer>
    </main>
  );
}
