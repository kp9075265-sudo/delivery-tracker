import { redirect } from "next/navigation";
import { hasAdminSession } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let authorized = false;
  try {
    authorized = await hasAdminSession();
  } catch {
    redirect("/admin/login?setup=required");
  }
  if (!authorized) redirect("/admin/login");

  return children;
}
