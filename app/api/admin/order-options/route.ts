import { NextResponse } from "next/server";
import { isApiError, requireApiAdmin } from "@/lib/api-auth";
import { DatabaseConfigurationError, getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await requireApiAdmin();
  if (isApiError(user)) return user;

  const customerIdText = new URL(request.url).searchParams.get("customerId");
  const customerId = customerIdText === null ? null : Number(customerIdText);
  if (customerId !== null && (!Number.isSafeInteger(customerId) || customerId <= 0)) {
    return NextResponse.json({ error: "Choose a valid customer." }, { status: 400 });
  }

  try {
    const pool = getPool();
    const [customers, products, paymentMethods, warehouses, agents] = await Promise.all([
      pool.query(
        `SELECT customer_id, CONCAT_WS(' ', first_name, last_name) AS name
         FROM customers ORDER BY last_name, first_name, customer_id LIMIT 1000`
      ),
      pool.query(
        `SELECT product_id, product_name, price, stock_quantity
         FROM products ORDER BY product_name, product_id LIMIT 1000`
      ),
      pool.query(
        `SELECT DISTINCT payment_method FROM payments
         WHERE payment_method IS NOT NULL ORDER BY payment_method`
      ),
      pool.query(
        `SELECT warehouse_id, warehouse_name, city FROM warehouses
         ORDER BY warehouse_name, warehouse_id`
      ),
      pool.query(
        `SELECT agent_id, name, availability FROM delivery_agents
         ORDER BY name, agent_id`
      )
    ]);
    const addresses = customerId === null
      ? { rows: [] }
      : await pool.query(
        `SELECT address_id, street, city, state, pincode, country
         FROM addresses
         WHERE customer_id = $1
         ORDER BY address_id`,
        [customerId]
      );

    return NextResponse.json({
      customers: customers.rows,
      products: products.rows,
      paymentMethods: paymentMethods.rows.map((row) => row.payment_method),
      warehouses: warehouses.rows,
      agents: agents.rows,
      addresses: addresses.rows
    });
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Admin order options query failed.");
    return NextResponse.json({ error: "Could not load order options." }, { status: 500 });
  }
}
