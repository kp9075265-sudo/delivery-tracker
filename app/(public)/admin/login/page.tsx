import { redirect } from "next/navigation";
import { AdminPasswordForm } from "@/components/admin-password-form";
import { hasAdminSession } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams
}: {
  searchParams: Promise<{ setup?: string }>;
}) {
  if (await hasAdminSession().catch(() => false)) redirect("/admin");
  const { setup } = await searchParams;

  return (
    <main className="login-shell">
      <section className="login-card">
        <a className="brand" href="/" aria-label="Trackly home">
          <span className="brand-icon" aria-hidden="true">T</span>
          <span>trackly<span className="brand-dot">.</span></span>
        </a>
        <p className="section-kicker">ADMINISTRATOR ACCESS</p>
        <h1>Admin sign in</h1>
        <p className="page-subtitle">Enter the administrator password configured by the site owner.</p>
        {setup === "required" && <p className="error-box" role="alert">Set a strong ADMIN_PASSWORD in your server environment before signing in.</p>}
        <AdminPasswordForm />
      </section>
    </main>
  );
}
