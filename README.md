# Delivery Tracker (Vercel + PostgreSQL)

A delivery-tracking website that looks up an order ID and displays customer/order details, products in the order, payment status, shipment information, delivery agent, warehouse, and tracking history.

## Important: database hosting

Vercel cannot connect to PostgreSQL running only on your own computer through pgAdmin. Your database must be reachable from the internet using a hosted PostgreSQL provider such as Neon or Supabase. Import your existing database backup there first. Keep your original database unchanged.

## 1. Install and run locally

1. Install Node.js LTS from https://nodejs.org/
2. Extract this project ZIP and open the folder in VS Code.
3. Open the VS Code terminal in this folder and run:

   ```bash
   npm install
   ```

4. Copy `.env.example` to `.env.local`.
5. Replace `DATABASE_URL` in `.env.local` with your hosted PostgreSQL connection string. Do not share it or commit it to GitHub.
6. Run:

   ```bash
   npm run dev
   ```

7. Open http://localhost:3000 and enter an existing numeric `order_id`.

## 2. Database schema expected

The API expects the existing tables and columns below:

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

If your actual schema uses different column names, update the SQL in `app/api/track/[orderId]/route.ts` to match it. The app does not create, delete, or alter tables.

## 3. Deploy to Vercel

1. Push the extracted project folder to a GitHub repository.
2. Sign in at https://vercel.com and import that repository.
3. In Vercel, open **Project → Settings → Environment Variables**.
4. Add `DATABASE_URL` and paste the hosted PostgreSQL connection string as its value.
5. Apply it to Production (and Preview if needed), save, then redeploy.
6. Open the deployed URL and test using a real order ID.

Do not put database credentials in frontend files or commit `.env.local`.

## 4. If the API returns a database error

- Confirm `DATABASE_URL` is the hosted database connection string.
- Confirm the hosted database contains your imported tables and records.
- Compare actual table/column names with the schema above.
- Check Vercel **Project → Logs** for the underlying server error.
- For production, use the provider's recommended pooled connection string if connection limits become an issue.

## Current scope

This starter is a customer-facing order tracker with read-only database access. It does not change order status or create tracking updates from the public page. Add authentication and authorization before building any staff/admin update screens.
