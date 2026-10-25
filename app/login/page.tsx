import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentAppUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentAppUser();
  if (user) redirect(user.role === "admin" ? "/admin" : "/");

  return (
    <main className="login-shell">
      <section className="login-card">
        <a className="brand" href="/" aria-label="Trackly home">
          <span className="brand-icon" aria-hidden="true">T</span>
          <span>trackly<span className="brand-dot">.</span></span>
        </a>
        <p className="section-kicker">SECURE DELIVERY PORTAL</p>
        <h1>Sign in</h1>
        <p className="page-subtitle">Use the account provisioned for you by the project administrator.</p>
        <LoginForm />
      </section>
    </main>
  );
}
