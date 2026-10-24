# Delivery Tracking Management System

A read-only delivery dashboard built with Next.js, TypeScript, and PostgreSQL. It displays live order counts and status distribution, calculates delivered orders as a percentage of all orders, lets you search by order ID or customer name, filters by delivery status and order date, and shows customer, shipment, payment, product, and tracking-history details.

## Database connection

The server connects with the `pg` package using `DATABASE_URL`. It does not use an ORM and it does not create, delete, or alter database tables. The connection pool is reused by the server, and non-local PostgreSQL connections use TLS with certificate and hostname verification.

The SQL uses the existing project schema:

- `orders(order_id, customer_id, order_date, order_status, total_amount)`
- `customers(customer_id, first_name, last_name)`
- `shipments(shipment_id, order_id, warehouse_id, agent_id, shipment_status)`
- `warehouses(warehouse_id, warehouse_name, city)`
- `delivery_agents(agent_id, name, phone)`
- `tracking_updates(tracking_id, shipment_id, current_location, status, update_time)`
- `order_items(order_item_id, order_id, product_id, quantity, price)`
- `products(product_id, product_name, category_id)`
- `categories(category_id, category_name)`
- `payments(payment_id, order_id, payment_method, payment_status, payment_date)`

These names are based on the queries in this project. If your Neon database uses different names, verify the schema before editing the SQL. The project never runs schema migrations or writes to the database.

## Run locally

1. Install Node.js LTS and open this folder in VS Code.
2. In the terminal, run `npm install`.
3. If `.env.local` does not already exist, copy `.env.example` to `.env.local`. If it already exists, keep it and do not overwrite it.
4. Open `.env.local` on your computer and replace the example `DATABASE_URL` with the connection string from your Neon dashboard. Do not paste the real value into GitHub, chat, screenshots, or frontend code.
5. Start the development server with `npm run dev`, then open <http://localhost:3000>.
6. Visit <http://localhost:3000/api/health>. A successful `SELECT 1` returns `{"status":"ok","database":"connected"}`. Errors do not include the connection string.
7. Search by an existing order ID or customer name. Select **View details**, then **Open details page**, to view its shipment, payment, products, and tracking updates at `/orders/[orderId]`.

The dashboard displays up to 50 matching orders. Its summary counts, chart, and delivery success rate use all database orders; the success rate is delivered orders divided by total orders and is unavailable when there are no orders. The table can be filtered by order date because `orders.order_date` is used by the existing order queries. Search and filters use parameterized SQL. Status groups recognize common delivered, pending/processing, and in-transit wording; values not recognized are grouped as other. Shipment status is preferred when a shipment exists, otherwise the order status is used.

Shipment details use the existing `shipments.agent_id` relationship to show the assigned delivery-agent name. The API intentionally does not return the delivery agent's phone number on the public order-details route. This project does not provide user authentication; do not use it to publish private customer/order information without first adding access control.

## Configure Vercel

1. Open your project in Vercel and go to **Settings → Environment Variables**.
2. Add a variable named `DATABASE_URL` and enter the Neon connection string directly in Vercel. Never expose or commit its value.
3. Enable it for:
   - **Development** if you use Vercel CLI to run the project locally.
   - **Preview** to connect preview deployments to Neon.
   - **Production** for the live website.
4. Save the variable. Environment-variable changes apply to new deployments, so go to **Deployments**, open the latest production deployment, and choose **Redeploy** (or push a new commit).
5. After deployment, visit `https://your-domain/api/health`. A connected response verifies that the deployed function ran `SELECT 1`; an error response means the database connection still needs attention.

This repository uses the standard Next.js Vercel build settings and does not require a custom `vercel.json`. No production Vercel settings are changed by the project code.

## Troubleshooting and checks

- Missing or malformed `DATABASE_URL` produces a setup message. Add the variable locally or in the Vercel environment where the app runs.
- If `/api/health` reports that the database is unavailable, check the Neon connection string, database availability, and Vercel function logs. Do not share the connection string while troubleshooting.
- If order queries fail after a successful health check, compare the Neon tables and columns with the list above.
- `npx tsc --noEmit` checks TypeScript and `npm run build` creates a production build. This project does not currently define an npm lint script.

The public application is read-only. It does not update order status or create tracking updates. Add authentication and server-side authorization before implementing staff/admin write features.
