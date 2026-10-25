import { NextResponse } from "next/server";
import { DatabaseConfigurationError, getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedStatuses = new Set(["all", "pending", "in_transit", "delivered", "other"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const search = (url.searchParams.get("search") ?? "").trim().slice(0, 100);
  const status = url.searchParams.get("status") ?? "all";
  const dateFrom = url.searchParams.get("dateFrom") ?? "";
  const dateTo = url.searchParams.get("dateTo") ?? "";

  if (!allowedStatuses.has(status)) {
    return NextResponse.json({ error: "Choose a valid order status filter." }, { status: 400 });
  }

  const isValidDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };

  if ((dateFrom && !isValidDate(dateFrom)) || (dateTo && !isValidDate(dateTo))) {
    return NextResponse.json({ error: "Enter valid start and end dates." }, { status: 400 });
  }

  if (dateFrom && dateTo && dateFrom > dateTo) {
    return NextResponse.json({ error: "The start date must be on or before the end date." }, { status: 400 });
  }

  const baseQuery = `
    WITH latest_shipments AS (
      SELECT DISTINCT ON (order_id) order_id, shipment_status
      FROM shipments
      ORDER BY order_id, shipment_id DESC
    ),
    order_rows AS (
      SELECT o.order_id, o.order_date, o.order_status,
             COALESCE(NULLIF(BTRIM(ls.shipment_status), ''), o.order_status) AS display_status
      FROM orders o
      LEFT JOIN latest_shipments ls ON ls.order_id = o.order_id
    ),
    classified_orders AS (
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
               WHEN LOWER(COALESCE(display_status, '')) LIKE '%pending%'
                 OR LOWER(COALESCE(display_status, '')) LIKE '%process%'
                 OR LOWER(COALESCE(display_status, '')) LIKE '%placed%' THEN 'pending'
               ELSE 'other'
             END AS status_group
      FROM order_rows
    )
  `;

  try {
    const pool = getPool();
    const [summaryResult, ordersResult] = await Promise.all([
      pool.query(
        `${baseQuery}
         SELECT COUNT(*) AS total_orders,
                COUNT(*) FILTER (WHERE status_group = 'delivered') AS delivered_orders,
                COUNT(*) FILTER (WHERE status_group = 'pending') AS pending_orders,
                COUNT(*) FILTER (WHERE status_group = 'in_transit') AS in_transit_orders,
                COUNT(*) FILTER (WHERE status_group = 'other') AS other_orders
         FROM classified_orders`
      ),
      pool.query(
        `${baseQuery}
         SELECT order_id, order_date, display_status, status_group
         FROM classified_orders
         WHERE ($1 = '' OR order_id::text ILIKE '%' || $1 || '%')
           AND ($2 = 'all' OR status_group = $2)
           AND ($3::date IS NULL OR order_date::date >= $3::date)
           AND ($4::date IS NULL OR order_date::date <= $4::date)
         ORDER BY order_date DESC NULLS LAST, order_id DESC
         LIMIT 50`,
        [search, status, dateFrom || null, dateTo || null]
      )
    ]);

    return NextResponse.json({
      summary: summaryResult.rows[0],
      orders: ordersResult.rows,
      limit: 50
    });
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    console.error("Orders dashboard query failed.");
    return NextResponse.json(
      { error: "Could not load orders. Check the database connection and documented table names." },
      { status: 500 }
    );
  }
}
