import { NextResponse } from "next/server";
import { createOrderNotification } from "@/lib/admin-notifications";
import { isApiError, requireApiAdmin, requireSameOrigin } from "@/lib/api-auth";
import { DatabaseConfigurationError, getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderItemInput = { productId: number; quantity: number };

function positiveInteger(value: unknown): number | null {
  if (typeof value === "string" && !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export async function POST(request: Request) {
  if (!requireSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  }

  const user = await requireApiAdmin();
  if (isApiError(user)) return user;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Order details are required." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const customerId = positiveInteger(input.customerId);
  const addressId = positiveInteger(input.addressId);
  const paymentMethod = typeof input.paymentMethod === "string" ? input.paymentMethod : "";

  if (!customerId || !addressId) {
    return NextResponse.json({ error: "Choose a valid customer and delivery address." }, { status: 400 });
  }
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 50) {
    return NextResponse.json({ error: "Add between 1 and 50 products." }, { status: 400 });
  }

  const items: OrderItemInput[] = [];
  const seenProducts = new Set<number>();
  for (const rawItem of input.items) {
    if (typeof rawItem !== "object" || rawItem === null) {
      return NextResponse.json({ error: "Each order item must have a product and quantity." }, { status: 400 });
    }
    const item = rawItem as Record<string, unknown>;
    const productId = positiveInteger(item.productId);
    const quantity = positiveInteger(item.quantity);
    if (!productId || !quantity || quantity > 1000 || seenProducts.has(productId)) {
      return NextResponse.json({ error: "Each product must be unique and have a quantity between 1 and 1000." }, { status: 400 });
    }
    seenProducts.add(productId);
    items.push({ productId, quantity });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const customer = await client.query(
      `SELECT customer_id FROM customers WHERE customer_id = $1 FOR KEY SHARE`,
      [customerId]
    );
    if (customer.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "The selected customer does not exist." }, { status: 400 });
    }

    const address = await client.query(
      `SELECT address_id FROM addresses
       WHERE address_id = $1 AND customer_id = $2
       FOR SHARE`,
      [addressId, customerId]
    );
    if (address.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Choose a delivery address belonging to this customer." }, { status: 400 });
    }

    const products = await client.query(
      `SELECT product_id, price FROM products
       WHERE product_id = ANY($1::integer[])
       FOR SHARE`,
      [items.map((item) => item.productId)]
    );
    if (products.rowCount !== items.length || products.rows.some((product) =>
      product.price === null || !Number.isFinite(Number(product.price)) || Number(product.price) < 0
    )) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "One or more selected products are unavailable." }, { status: 400 });
    }

    const methods = await client.query(
      `SELECT DISTINCT payment_method FROM payments
       WHERE payment_method IS NOT NULL AND payment_method = $1`,
      [paymentMethod]
    );
    if (methods.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Choose a payment method already supported by the database." }, { status: 400 });
    }

    const totalResult = await client.query(
      `SELECT SUM(p.price * input.quantity)::numeric AS total_amount
       FROM jsonb_to_recordset($1::jsonb) AS input(product_id integer, quantity integer)
       JOIN products p ON p.product_id = input.product_id`,
      [JSON.stringify(items)]
    );
    const totalAmount = totalResult.rows[0].total_amount;
    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, address_id, order_date, order_status, total_amount)
       VALUES ($1, $2, now(), 'Placed', $3)
       RETURNING order_id`,
      [customerId, addressId, totalAmount]
    );
    const orderId = orderResult.rows[0].order_id as number;

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price)
         SELECT $1, product_id, $3, price FROM products WHERE product_id = $2`,
        [orderId, item.productId, item.quantity]
      );
    }

    await client.query(
      `INSERT INTO payments (order_id, payment_method, payment_status, payment_date)
       VALUES ($1, $2, 'Pending', now())`,
      [orderId, paymentMethod]
    );
    await createOrderNotification(
      client,
      customerId,
      orderId,
      `order:${orderId}:created`,
      `Your order #${orderId} has been placed.`
    );
    await client.query("COMMIT");

    return NextResponse.json({ success: true, orderId, totalAmount }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof DatabaseConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Admin order creation transaction failed.");
    return NextResponse.json({ error: "Could not create the order. No partial order was saved." }, { status: 500 });
  } finally {
    client.release();
  }
}
