import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ orderId: string }> };

export async function GET(_request: Request, context: Context) {
  const { orderId } = await context.params;

  if (!/^\d+$/.test(orderId)) {
    return NextResponse.json({ error: "Order ID must be a number." }, { status: 400 });
  }

  try {
    const orderResult = await pool.query(
      `SELECT o.order_id, o.order_date, o.order_status, o.total_amount,
              CONCAT_WS(' ', c.first_name, c.last_name) AS customer_name
       FROM orders o
       LEFT JOIN customers c ON c.customer_id = o.customer_id
       WHERE o.order_id = $1
       LIMIT 1`,
      [Number(orderId)]
    );

    if (orderResult.rowCount === 0) {
      return NextResponse.json({ error: "No order found with that ID. Check the ID and try again." }, { status: 404 });
    }

    const order = orderResult.rows[0];

    const shipmentResult = await pool.query(
      `SELECT s.shipment_id, s.shipment_status,
              w.warehouse_name, w.city AS warehouse_city,
              da.name AS agent_name, da.phone AS agent_phone
       FROM shipments s
       LEFT JOIN warehouses w ON w.warehouse_id = s.warehouse_id
       LEFT JOIN delivery_agents da ON da.agent_id = s.agent_id
       WHERE s.order_id = $1
       ORDER BY s.shipment_id DESC
       LIMIT 1`,
      [Number(orderId)]
    );

    const shipment = shipmentResult.rows[0] ?? null;
    let tracking = [];
    if (shipment) {
      const trackingResult = await pool.query(
        `SELECT tracking_id, current_location, status, update_time
         FROM tracking_updates
         WHERE shipment_id = $1
         ORDER BY update_time DESC NULLS LAST, tracking_id DESC`,
        [shipment.shipment_id]
      );
      tracking = trackingResult.rows;
    }

    const itemsResult = await pool.query(
      `SELECT p.product_id, p.product_name, oi.quantity, oi.price,
              cat.category_name
       FROM order_items oi
       JOIN products p ON p.product_id = oi.product_id
       LEFT JOIN categories cat ON cat.category_id = p.category_id
       WHERE oi.order_id = $1
       ORDER BY p.product_name`,
      [Number(orderId)]
    );

    const paymentResult = await pool.query(
      `SELECT payment_method, payment_status
       FROM payments
       WHERE order_id = $1
       ORDER BY payment_date DESC NULLS LAST, payment_id DESC
       LIMIT 1`,
      [Number(orderId)]
    );

    return NextResponse.json({
      order,
      shipment,
      items: itemsResult.rows,
      tracking,
      payment: paymentResult.rows[0] ?? null
    });
  } catch (error) {
    console.error("Tracking API error:", error);
    return NextResponse.json(
      { error: "Database query failed. Check DATABASE_URL and confirm that your table and column names match the project schema." },
      { status: 500 }
    );
  }
}
