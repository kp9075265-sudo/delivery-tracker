import Link from "next/link";
import { AdminLogoutButton } from "@/components/admin-logout-button";

export function AdminNavigation() {
  const sections = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/data/customers", label: "Customers" },
    { href: "/admin/data/products", label: "Products" },
    { href: "/admin/data/categories", label: "Categories" },
    { href: "/admin/orders", label: "Orders" },
    { href: "/admin/data/order_items", label: "Order items" },
    { href: "/admin/data/addresses", label: "Addresses" },
    { href: "/admin/data/payments", label: "Payments" },
    { href: "/admin/data/shipments", label: "Shipments" },
    { href: "/admin/data/delivery_agents", label: "Delivery agents" },
    { href: "/admin/data/tracking_updates", label: "Tracking updates" },
    { href: "/admin/data/warehouses", label: "Warehouses" },
    { href: "/admin/data/notifications", label: "Notifications" },
    { href: "/admin/sms", label: "SMS history" }
  ];

  return (
    <div className="admin-frame">
      <nav className="topbar" aria-label="Administrator navigation">
        <Link className="brand" href="/admin" aria-label="Delivery administration dashboard">
          <span className="brand-icon" aria-hidden="true">T</span>
          <span>trackly<span className="brand-dot">.</span></span>
        </Link>
        <div className="nav-actions">
          <span className="nav-label">ADMIN CONSOLE</span>
          <Link className="primary-button nav-create" href="/admin/orders/new">New order</Link>
          <AdminLogoutButton />
        </div>
      </nav>
      <aside className="admin-sidebar" aria-label="Database management sections">
        <p className="admin-sidebar-label">WORKSPACE</p>
        {sections.map((section) => (
          <Link className="admin-sidebar-link" href={section.href} key={section.href}>{section.label}</Link>
        ))}
      </aside>
    </div>
  );
}
