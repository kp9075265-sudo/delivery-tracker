import type { PoolClient } from "pg";

export async function createOrderNotification(
  client: PoolClient,
  customerId: number,
  orderId: number,
  eventKey: string,
  message: string
) {
  await client.query(
    `INSERT INTO notifications (customer_id, order_id, message, sent_at, event_key)
     VALUES ($1, $2, $3, now(), $4)
     ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING`,
    [customerId, orderId, message, eventKey]
  );
}
