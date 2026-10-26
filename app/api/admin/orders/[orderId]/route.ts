import { NextResponse } from "next/server";
import { createOrderNotification } from "@/lib/admin-notifications";
import { isApiError, requireApiAdmin, requireSameOrigin } from "@/lib/api-auth";
import { DatabaseConfigurationError, getPool } from "@/lib/db";
import { dispatchSmsSafely, enqueueOrderSms } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ orderId: string }> };
const allowedShipmentStatuses = new Set(["Delivered", "In Transit", "Out for Delivery"]);

function positiveInteger(value: unknown): number | null {
  if (typeof value === "string" && !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

async function getOrderId(context: Context) {
  const { orderId } = await context.params;
  if (!/^\d+$/.test(orderId) || !Number.isSafeInteger(Number(orderId))) return null;
  return Number(orderId);
}

export async function GET(_request: Request, context: Context) {
  const user = await requireApiAdmin();
  if (isApiError(user)) return user;
  const orderId = await getOrderId(context);
  if (!orderId) return NextResponse.json({ error: "Order ID must be a valid number." }, { status: 400 });

  try {
    const pool = getPool();
    const orderResult = await pool.query(
      `SELECT o.order_id, o.customer_id, o.order_date, o.order_status, o.total_amount,
              CONCAT_WS(' ', c.first_name, c.last_name) AS customer_name,
              c.email AS customer_email,
              a.address_id, a.street, a.city, a.state, a.pincode, a.country
       FROM orders o
       LEFT JOIN customers c ON c.customer_id = o.customer_id
       LEFT JOIN addresses a ON a.address_id = o.address_id
       WHERE o.order_id = $1
       LIMIT 1`,
      [orderId]
    );
    if (orderResult.rowCount === 0) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const [shipment, items, payments, tracking] = await Promise.all([
      pool.query(
        `SELECT s.shipment_id, s.shipment_status, s.agent_id, s.warehouse_id,
                da.name AS agent_name, w.warehouse_name
         FROM shipments s
         LEFT JOIN delivery_agents da ON da.agent_id = s.agent_id
         LEFT JOIN warehouses w ON w.warehouse_id = s.warehouse_id
         WHERE s.order_id = $1
         ORDER BY s.shipment_id DESC LIMIT 1`,
        [orderId]
      ),
      pool.query(
        `SELECT oi.order_item_id, oi.product_id, p.product_name, oi.quantity, oi.price
         FROM order_items oi JOIN products p ON p.product_id = oi.product_id
         WHERE oi.order_id = $1 ORDER BY oi.order_item_id`,
        [orderId]
      ),
      pool.query(
        `SELECT payment_id, payment_method, payment_status, payment_date
         FROM payments WHERE order_id = $1
         ORDER BY payment_date DESC NULLS LAST, payment_id DESC`,
        [orderId]
      ),
      pool.query(
        `SELECT tu.tracking_id, tu.status, tu.current_location, tu.update_time
         FROM tracking_updates tu
         JOIN shipments s ON s.shipment_id = tu.shipment_id
         WHERE s.order_id = $1
         ORDER BY tu.update_time DESC NULLS LAST, tu.tracking_id DESC`,
        [orderId]
      )
    ]);

    return NextResponse.json({
      order: orderResult.rows[0],
      shipment: shipment.rows[0] ?? null,
      items: items.rows,
      payments: payments.rows,
      tracking: tracking.rows
    });
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Admin order detail query failed.");
    return NextResponse.json({ error: "Could not load order details." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: Context) {
  if (!requireSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  }
  const user = await requireApiAdmin();
  if (isApiError(user)) return user;
  const orderId = await getOrderId(context);
  if (!orderId) return NextResponse.json({ error: "Order ID must be a valid number." }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "An order update is required." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const hasStatus = Object.prototype.hasOwnProperty.call(input, "shipmentStatus");
  const hasAgent = Object.prototype.hasOwnProperty.call(input, "agentId");
  const hasWarehouse = Object.prototype.hasOwnProperty.call(input, "warehouseId");
  if (!hasStatus && !hasAgent && !hasWarehouse) {
    return NextResponse.json({ error: "Choose a shipment status, delivery agent, or warehouse to update." }, { status: 400 });
  }

  const shipmentStatus = hasStatus && typeof input.shipmentStatus === "string"
    ? input.shipmentStatus
    : null;
  if (hasStatus && (!shipmentStatus || !allowedShipmentStatuses.has(shipmentStatus))) {
    return NextResponse.json({ error: "Choose one of the supported shipment statuses." }, { status: 400 });
  }

  const agentId = hasAgent ? positiveInteger(input.agentId) : null;
  const warehouseId = hasWarehouse ? positiveInteger(input.warehouseId) : null;
  if ((hasAgent && !agentId) || (hasWarehouse && !warehouseId)) {
    return NextResponse.json({ error: "Choose a valid delivery agent and warehouse." }, { status: 400 });
  }

  const location = typeof input.currentLocation === "string" ? input.currentLocation.trim() : "";
  if (Object.prototype.hasOwnProperty.call(input, "currentLocation") && typeof input.currentLocation !== "string") {
    return NextResponse.json({ error: "Tracking location must be text." }, { status: 400 });
  }
  if (location.length > 255) {
    return NextResponse.json({ error: "Location must be 255 characters or fewer." }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orderResult = await client.query(
      `SELECT o.order_id, o.customer_id, o.order_status
       FROM orders o WHERE o.order_id = $1
       FOR UPDATE OF o`,
      [orderId]
    );
    if (orderResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    const order = orderResult.rows[0];

    if (agentId) {
      const agentResult = await client.query(
        `SELECT agent_id, availability FROM delivery_agents WHERE agent_id = $1 FOR KEY SHARE`,
        [agentId]
      );
      if (agentResult.rowCount === 0 || agentResult.rows[0].availability === false) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Choose an existing delivery agent who is not marked unavailable." }, { status: 400 });
      }
    }
    if (warehouseId) {
      const warehouseResult = await client.query(
        `SELECT warehouse_id FROM warehouses WHERE warehouse_id = $1 FOR KEY SHARE`,
        [warehouseId]
      );
      if (warehouseResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Choose an existing warehouse." }, { status: 400 });
      }
    }

    const shipmentResult = await client.query(
      `SELECT shipment_id, shipment_status, agent_id, warehouse_id
       FROM shipments WHERE order_id = $1
       ORDER BY shipment_id DESC LIMIT 1 FOR UPDATE`,
      [orderId]
    );
    const shipment = shipmentResult.rows[0] ?? null;
    const statusChanged = hasStatus && shipment?.shipment_status !== shipmentStatus;
    const agentChanged = hasAgent && shipment?.agent_id !== agentId;
    const warehouseChanged = hasWarehouse && shipment?.warehouse_id !== warehouseId;

    if (!statusChanged && !agentChanged && !warehouseChanged) {
      await client.query("ROLLBACK");
      return NextResponse.json({ success: true, changed: false });
    }

    let shipmentId: number;
    if (shipment) {
      shipmentId = shipment.shipment_id;
      await client.query(
        `UPDATE shipments SET
           shipment_status = CASE WHEN $2::boolean THEN $3 ELSE shipment_status END,
           agent_id = CASE WHEN $4::boolean THEN $5 ELSE agent_id END,
           warehouse_id = CASE WHEN $6::boolean THEN $7 ELSE warehouse_id END
         WHERE shipment_id = $1`,
        [shipmentId, statusChanged, shipmentStatus, agentChanged, agentId, warehouseChanged, warehouseId]
      );
    } else {
      const inserted = await client.query(
        `INSERT INTO shipments (order_id, shipment_status, agent_id, warehouse_id)
         VALUES ($1, $2, $3, $4)
         RETURNING shipment_id`,
        [orderId, shipmentStatus, agentId, warehouseId]
      );
      shipmentId = inserted.rows[0].shipment_id;
    }

    let smsId: number | null = null;
    if (statusChanged && shipmentStatus) {
      const orderStatus = shipmentStatus === "Delivered" ? "Delivered" : "Shipped";
      await client.query(`UPDATE orders SET order_status = $2 WHERE order_id = $1`, [orderId, orderStatus]);
      const tracking = await client.query(
        `INSERT INTO tracking_updates (shipment_id, current_location, status, update_time)
         VALUES ($1, NULLIF($2, ''), $3, now())
         RETURNING tracking_id`,
        [shipmentId, location, shipmentStatus]
      );
      if (order.customer_id !== null) {
        await createOrderNotification(
          client,
          order.customer_id,
          orderId,
          `tracking:${tracking.rows[0].tracking_id}`,
          `Order #${orderId} status updated: ${shipmentStatus}.`
        );
        const smsEvent = ({
          "Shipped": "order_dispatched",
          "In Transit": "order_in_transit",
          "Out for Delivery": "out_for_delivery",
          "Delivered": "order_delivered"
        } as const)[shipmentStatus as "Shipped" | "In Transit" | "Out for Delivery" | "Delivered"];
        if (smsEvent) {
          smsId = await enqueueOrderSms(
            client,
            order.customer_id,
            orderId,
            smsEvent,
            `order:${orderId}:shipment:${shipmentId}:${shipmentStatus}`
          );
        }
      }
    }

    if (agentChanged && agentId) {
      const message = `A delivery agent has been assigned to order #${orderId}.`;
      const tracking = await client.query(
        `INSERT INTO tracking_updates (shipment_id, current_location, status, update_time)
         VALUES ($1, NULL, 'Delivery agent assigned', now())
         RETURNING tracking_id`,
        [shipmentId]
      );
      if (order.customer_id !== null) {
        await createOrderNotification(
          client,
          order.customer_id,
          orderId,
          `tracking:${tracking.rows[0].tracking_id}`,
          message
        );
      }
    }

    if (warehouseChanged && warehouseId) {
      await client.query(
        `INSERT INTO tracking_updates (shipment_id, current_location, status, update_time)
         VALUES ($1, NULL, 'Warehouse assigned', now())`,
        [shipmentId]
      );
    }

    await client.query("COMMIT");
    const smsResult = smsId ? await dispatchSmsSafely(pool, smsId) : null;
    return NextResponse.json({
      success: true,
      changed: true,
      smsWarning: smsResult?.status === "failed" ? smsResult.message : null
    });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof DatabaseConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Admin shipment update transaction failed.");
    return NextResponse.json({ error: "Could not update the shipment. No partial update was saved." }, { status: 500 });
  } finally {
    client.release();
  }
}
