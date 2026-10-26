import { AdminNavigation } from "@/components/admin-navigation";
import { AdminSms } from "@/components/admin-sms";

export const dynamic = "force-dynamic";

export default function AdminSmsPage() {
  return (
    <main className="app-shell">
      <AdminNavigation />
      <AdminSms />
      <footer><span>trackly<span className="brand-dot">.</span></span><span>SMS history is protected in the admin console.</span></footer>
    </main>
  );
}
