import { notFound } from "next/navigation";
import { AdminRecords } from "@/components/admin-records";
import { getAdminTable } from "@/lib/admin-records";
import { AdminNavigation } from "@/components/admin-navigation";

export const dynamic = "force-dynamic";

export default async function AdminDataPage({ params }: { params: Promise<{ table: string }> }) {
  const { table } = await params;
  if (!getAdminTable(table)) notFound();

  return (
    <main className="app-shell">
      <AdminNavigation />
      <AdminRecords table={table} />
      <footer><span>trackly<span className="brand-dot">.</span></span><span>Administrator database management</span></footer>
    </main>
  );
}
