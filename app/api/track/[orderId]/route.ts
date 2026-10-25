import { NextResponse } from "next/server";
import { DatabaseConfigurationError, getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ orderId: string }> };

export async function GET(_request: Request, context: Context) {
  const { orderId } = await context.params;

  if (!/^\d+$/.test(orderId) || !Number.isSafeInteger(Number(orderId))) {
    return NextResponse.json({ error: "Order ID must be a number." }, { status: 400 });
  }

  try {
    const pool = getPool();
    const orderResult = await pool.query(
      `SELECT o.order_id, o.order_date, o.order_status
       FROM orders o
       WHERE o.order_id = $1
       LIMIT 1`,
      [Number(orderId)]
    );

    if (orderResult.rowCount === 0) {
      return NextResponse.json({ error: "No order found with that ID. Check the ID and try again." }, { status: 404 });
    }

    const shipmentResult = await pool.query(
      `SELECT s.shipment_id, s.shipment_status
       FROM shipments s
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

    return NextResponse.json({
      order: orderResult.rows[0],
      shipment,
      items: [],
      tracking,
      payment: null,
      publicTracking: true
    });
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    console.error("Tracking API database query failed.");
    return NextResponse.json(
      { error: "Could not load this order. Check the database connection and confirm the tables match the documented schema." },
      { status: 500 }
    );
  }
}
