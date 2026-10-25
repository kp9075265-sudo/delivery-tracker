import { NextResponse } from "next/server";
import { isApiError, requireApiAdmin } from "@/lib/api-auth";
import { DatabaseConfigurationError, getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const orders = `
  WITH latest_shipments AS (
    SELECT DISTINCT ON (order_id) order_id, shipment_status
    FROM shipments
    ORDER BY order_id, shipment_id DESC
  ),
  order_rows AS (
    SELECT o.order_id, o.order_date, o.order_status, o.total_amount,
           CONCAT_WS(' ', c.first_name, c.last_name) AS customer_name,
           COALESCE(NULLIF(BTRIM(ls.shipment_status), ''), o.order_status) AS display_status
    FROM orders o
    LEFT JOIN customers c ON c.customer_id = o.customer_id
    LEFT JOIN latest_shipments ls ON ls.order_id = o.order_id
  ),
  classified AS (
    SELECT order_rows.*,
           CASE
             WHEN LOWER(COALESCE(display_status, '')) LIKE '%deliver%'
               AND LOWER(COALESCE(display_status, '')) NOT LIKE '%undeliver%'
               AND LOWER(COALESCE(display_status, '')) NOT LIKE '%not deliver%' THEN 'delivered'
             WHEN LOWER(COALESCE(display_status, '')) LIKE '%transit%'
               OR LOWER(COALESCE(display_status, '')) LIKE '%shipping%'
               OR LOWER(COALESCE(display_status, '')) LIKE '%shipped%'
               OR LOWER(COALESCE(display_status, '')) LIKE '%dispatched%'
               OR LOWER(COALESCE(display_status, '')) LIKE '%out for delivery%' THEN 'in_transit'
             WHEN LOWER(COALESCE(display_status, '')) LIKE '%process%' THEN 'processing'
             WHEN LOWER(COALESCE(display_status, '')) LIKE '%pending%'
               OR LOWER(COALESCE(display_status, '')) LIKE '%placed%' THEN 'pending'
             ELSE 'other'
           END AS status_group
    FROM order_rows
  )
`;

export async function GET() {
  const user = await requireApiAdmin();
  if (isApiError(user)) return user;

  try {
    const pool = getPool();
    const [summary, recentOrders, recentActivity, customers] = await Promise.all([
      pool.query(
        `${orders}
         SELECT COUNT(*) AS total_orders,
                COUNT(*) FILTER (WHERE status_group = 'pending') AS pending_orders,
                COUNT(*) FILTER (WHERE status_group = 'processing') AS processing_orders,
                COUNT(*) FILTER (WHERE status_group = 'in_transit') AS in_transit_orders,
                COUNT(*) FILTER (WHERE status_group = 'delivered') AS delivered_orders,
                COUNT(*) FILTER (WHERE status_group = 'other') AS other_orders
         FROM classified`
      ),
      pool.query(
        `${orders}
         SELECT order_id, order_date, display_status, status_group, customer_name, total_amount
         FROM classified
         ORDER BY order_date DESC NULLS LAST, order_id DESC
         LIMIT 8`
      ),
      pool.query(
        `SELECT activity_id, activity_type, status, current_location, activity_time,
                order_id, customer_name
         FROM (
           SELECT tu.tracking_id AS activity_id, 'tracking' AS activity_type,
                  tu.status, tu.current_location, tu.update_time AS activity_time,
                  o.order_id, CONCAT_WS(' ', c.first_name, c.last_name) AS customer_name
           FROM tracking_updates tu
           JOIN shipments s ON s.shipment_id = tu.shipment_id
           JOIN orders o ON o.order_id = s.order_id
           LEFT JOIN customers c ON c.customer_id = o.customer_id
           UNION ALL
           SELECT n.notification_id AS activity_id, 'notification' AS activity_type,
                  n.message AS status, NULL::varchar AS current_location, n.sent_at AS activity_time,
                  o.order_id, CONCAT_WS(' ', c.first_name, c.last_name) AS customer_name
           FROM notifications n
           JOIN orders o ON o.order_id = n.order_id
           LEFT JOIN customers c ON c.customer_id = o.customer_id
         ) activities
         ORDER BY activity_time DESC NULLS LAST, activity_id DESC
         LIMIT 8`
      ),
      pool.query(`SELECT COUNT(*) AS total_customers FROM customers`)
    ]);

    return NextResponse.json({
      summary: summary.rows[0],
      recentOrders: recentOrders.rows,
      recentActivity: recentActivity.rows,
      totalCustomers: customers.rows[0].total_customers
    });
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Admin dashboard query failed.");
    return NextResponse.json({ error: "Could not load the administrator dashboard." }, { status: 500 });
  }
}
