import { AdminOrderManager } from "@/components/admin-order-manager";

type Props = { params: Promise<{ orderId: string }> };

export default async function AdminOrderPage({ params }: Props) {
  const { orderId } = await params;
  return <AdminOrderManager orderId={orderId} />;
}
