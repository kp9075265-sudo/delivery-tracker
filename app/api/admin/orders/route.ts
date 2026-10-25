import { NextResponse } from "next/server";
import { isApiError, requireApiAdmin } from "@/lib/api-auth";
import { DatabaseConfigurationError, getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusFilters = new Set(["all", "pending", "processing", "in_transit", "delivered", "other"]);

export async function GET(request: Request) {
  const user = await requireApiAdmin();
  if (isApiError(user)) return user;

  const params = new URL(request.url).searchParams;
  const search = (params.get("search") ?? "").trim().slice(0, 100);
  const status = params.get("status") ?? "all";
  if (!statusFilters.has(status)) {
    return NextResponse.json({ error: "Choose a valid status filter." }, { status: 400 });
  }

  try {
    const result = await getPool().query(
      `WITH latest_shipments AS (
         SELECT DISTINCT ON (order_id) order_id, shipment_status
         FROM shipments ORDER BY order_id, shipment_id DESC
       ),
       order_rows AS (
         SELECT o.order_id, o.order_date, o.order_status, o.total_amount, o.customer_id,
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
       SELECT order_id, order_date, display_status, status_group, customer_name, total_amount
       FROM classified
       WHERE ($1 = '' OR order_id::text ILIKE '%' || $1 || '%' OR customer_name ILIKE '%' || $1 || '%')
         AND ($2 = 'all' OR status_group = $2)
       ORDER BY order_date DESC NULLS LAST, order_id DESC
       LIMIT 100`,
      [search, status]
    );
    return NextResponse.json({ orders: result.rows, limit: 100 });
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Admin order search failed.");
    return NextResponse.json({ error: "Could not load orders." }, { status: 500 });
  }
}
