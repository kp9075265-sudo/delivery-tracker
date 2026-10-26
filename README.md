# Delivery Tracking Management System

A Next.js and TypeScript delivery application backed by PostgreSQL. The public dashboard and shipment-status tracking are available without customer sign-in. A separate administrator password protects database management and order operations.

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

These names are based on the queries in this project. If your Neon database uses different names, verify the schema before editing the SQL. The migration at `db/migrations/001_admin_accounts_and_notifications.sql` adds an `app_users` account table, an optional address link on orders, notification read/order/idempotency fields, and safe generated ID defaults for the records created by the app. It does not delete or recreate existing tables or rows. Apply it once to any database that this application will use. The local migration in this workspace was applied to the database configured in the local environment; confirm that Vercel uses the same Neon database before deciding whether to apply it there as well.

The additive migration at `db/migrations/002_generate_remaining_record_ids.sql` adds generated ID defaults to existing address, category, customer, delivery-agent, product, and warehouse records, so the admin forms can create records without manually assigning primary keys. It does not delete or recreate tables or rows. It has already been applied to the database configured in this local workspace. Apply it only to a database where it has not already been applied; it is not a repeatable migration.

An SMS feature requires an additional additive migration proposal at `db/migrations/003_sms_consent_and_outbox.sql`. It adds a default-off customer SMS-consent record and an idempotent SMS outbox/history table with provider status and retry metadata. This migration has **not** been applied. Review it and approve before applying to any database. Existing customers default to no SMS consent.

## Run locally

1. Install Node.js LTS and open this folder in VS Code.
2. In the terminal, run `npm install`.
3. If `.env.local` does not already exist, copy `.env.example` to `.env.local`. If it already exists, keep it and do not overwrite it.
4. Open `.env.local` on your computer and set `DATABASE_URL` to your Neon connection string. Configure `ADMIN_PASSWORD` as a unique, strong password at least 16 characters long. Keep all these values private; never paste them into GitHub, chat, screenshots, or frontend code. `AUTH_SECRET` is used only by the optional legacy customer sign-in and notification flow, not by the public dashboard or admin password session. Keep an existing `.env.local`; do not overwrite it with the example file.
5. Confirm which migrations have already run on the Neon database in `.env.local`. If migration 001 has not been applied, run `psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/001_admin_accounts_and_notifications.sql` from PowerShell, with `psql` installed. If migration 002 has not been applied, run `psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/002_generate_remaining_record_ids.sql`. Do not rerun either migration on a database where it has already succeeded.
6. Start the app with `npm run dev`. The main dashboard opens at <http://localhost:3000/> without customer sign-in. For database administration, open <http://localhost:3000/admin>; the password prompt appears at `/admin/login`.
7. The `/api/health` endpoint runs `SELECT 1` and reports database connectivity without revealing credentials.

## Admin panel

The protected `/admin` area uses the server-only `ADMIN_PASSWORD` environment variable. The app compares passwords on the server and issues an eight-hour, signed, HTTP-only, same-site cookie; admin APIs verify that cookie independently, so calling an API directly does not bypass access checks. Use **Admin log out** to clear the session. The password is not stored in PostgreSQL or sent to browser code. There is no default administrator password.

The sidebar provides database views for customers, products, categories, orders, order items, addresses, payments, shipments, delivery agents, tracking updates, warehouses, and notifications. Table views are searchable and paginated. The forms allow create/edit for customers, products, categories, addresses, delivery agents, and warehouses. Deletes are intentionally not offered. Order, shipment, tracking, payment, and notification history is read-only in the generic tables; use the existing order workflow for order and shipment changes so line items, payment history, tracking, and notifications remain consistent. The notification form checks that an optional related order belongs to the selected customer. Payment data is not editable.

For a local smoke test, open `/` without signing in, search/filter orders, and open a shipment tracking timeline. Open `/admin`, enter your configured admin password, then open each sidebar section, search and paginate records, and test create/edit only with safe test records. Use `/admin/orders` and its linked order detail page for order management. Avoid changing real customer or financial records while testing. Public tracking returns shipment status and tracking updates only; customer addresses, payment details, and purchased items are not returned anonymously.

The public dashboard shows live aggregate order counts and a limited order list with identifiers, dates, and statuses; it does not display customer names or order totals. Admin dashboards show system-wide totals. The administrator order form reads current customers, customer-owned addresses, products, and existing payment methods. The server verifies those records and calculates totals using database product prices inside a transaction. Payment records are marked Pending; the app never requests or stores card details. New orders do not create a shipment until an administrator updates shipment status or assignment.

Shipment changes, tracking entries, and notifications are committed together. Existing observed order statuses are `Placed`, `Shipped`, and `Delivered`; shipment statuses are `In Transit`, `Out for Delivery`, and `Delivered`. New notifications are stored against the order’s customer; a unique event key prevents duplicate notification inserts for the same recorded operation. Customer notification endpoints continue to require their existing customer account session. Public tracking exposes status and timeline only; agent phone numbers and customer details are not returned.

The legacy `/login` and provisioned customer-account flows remain available for customer notification features. They are no longer required to view the public dashboard or shipment status. Admin authorization is separate and is checked server-side on every admin page and API request.

## SMS notification setup (optional; disabled by default)

Twilio SMS sending is disabled unless `SMS_NOTIFICATIONS_ENABLED=true`. Do not enable it before reviewing/applying migration 003, verifying lawful opt-in for the recipient, and setting up a sender that Twilio permits for the destination country. `customers.phone` is the registered recipient source; the browser cannot choose a recipient. The admin consent form records an operator attestation and source, so only record consent after verifying the customer's explicit agreement. Phone numbers must already be valid E.164 values; the application does not guess or add country codes.

1. Create a Twilio account and use the Twilio Console to check sender-number or Messaging Service availability, country-level geo permissions, destination-country rules, registration requirements, billing, and your account's sending permissions.
2. Review Twilio's country guidelines for every recipient country. Rules differ by region and may require local sender registration or other messaging compliance steps; an international sender is not automatically eligible for domestic delivery.
3. Review current destination/carrier pricing before enabling paid sends. Twilio bills per message segment and pricing can vary by destination, sender type, carrier, and additional carrier fees; SMS may split into multiple billable segments. Pricing changes, so do not rely on a fixed estimate in this README.
4. Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` only as server-side environment variables. Use E.164 for the sender number. Set `TWILIO_STATUS_CALLBACK_URL` to the exact public HTTPS URL `/api/sms/twilio/status` configured in Twilio if you want provider delivery updates. The callback verifies Twilio's request signature with the Twilio SDK.
5. For a Twilio trial account, set `TWILIO_TRIAL_MODE=true`. The code sends only Twilio's documented predefined `sms_order_confirmation` and `sms_delivery_updates` template names in the Messaging API `body` field. Trial accounts restrict recipients to verified US numbers, so a trial cannot be used to validate delivery to Indian mobile numbers. Upgrade the account before targeting Indian recipients; with `TWILIO_TRIAL_MODE=false`, the API sends the application's order/status message as the body.
6. Keep `SMS_NOTIFICATIONS_ENABLED=false` while setting up. When ready, set it to `true`, start locally with `npm run dev`, and go to `/admin/sms`. Ensure migration 003 is already applied, record verified customer consent, select your own opted-in customer record, enter that record's exact E.164 phone number, and explicitly press **Send test SMS**. This action sends a real message. Trial recipients must meet Twilio's verified-US limitation. Order creation and shipment-status changes also send real SMS while the flag is enabled.
7. The admin **SMS history** page masks recipient numbers and records Twilio SID, status, timestamps, and safe error details. Failed sends can be retried up to three attempts after checking Twilio's message log. A retry after an ambiguous timeout may duplicate a message; check the provider log before retrying.

Twilio references: [trial SMS restrictions and predefined templates](https://www.twilio.com/docs/usage/trials/try-out-sms), [country SMS guidelines](https://www.twilio.com/en-us/guidelines/sms), [India SMS pricing](https://www.twilio.com/en-us/sms/pricing/in), [Messaging Services and delivery status callbacks](https://www.twilio.com/docs/messaging/services), and [webhook signature validation](https://www.twilio.com/docs/usage/webhooks/webhooks-security). Sender eligibility and Indian regulatory requirements depend on the account and sender; verify them in Twilio Console.

## Configure Vercel

1. Open your project in Vercel and go to **Settings → Environment Variables**.
2. Add `DATABASE_URL` and `ADMIN_PASSWORD` directly in Vercel. Choose a strong, unique password of at least 16 characters. Add `AUTH_SECRET` too only if you use the legacy customer sign-in/notification flow. Add the Twilio variables only if you have reviewed and applied migration 003 and are ready to configure SMS. Never expose or commit secret values.
3. Enable `DATABASE_URL` and `ADMIN_PASSWORD` for:
   - **Development** if you use Vercel CLI to run the project locally.
   - **Preview** to connect preview deployments to Neon.
   - **Production** for the live website.
   If you use the legacy customer login and notification endpoints, enable `AUTH_SECRET` for the environments that use those features too.
4. Save the variable. Environment-variable changes apply to new deployments, so go to **Deployments**, open the latest production deployment, and choose **Redeploy** (or push a new commit).
5. Confirm that the Vercel `DATABASE_URL` points to a database where migrations 001 and 002 have both been applied. Do not rerun migrations on an already migrated database. After deployment, visit `https://your-domain/api/health` to verify `SELECT 1`, open `/` for the public dashboard, and open `/admin` to enter the configured admin password. Vercel environment variables and production data are not changed by this repository.

SMS remains off on Vercel until you separately review/apply migration 003, add the Twilio environment variables, record verified customer consent, check country-specific sender rules, and intentionally set `SMS_NOTIFICATIONS_ENABLED=true`. Do not set that flag for a deployment intended only for UI or non-delivery testing.

This repository uses the standard Next.js Vercel build settings and does not require a custom `vercel.json`. No production Vercel settings are changed by the project code.

## Troubleshooting and checks

- Missing or malformed `DATABASE_URL` produces a setup message. Add the variable locally or in the Vercel environment where the app runs.
- If `/api/health` reports that the database is unavailable, check the Neon connection string, database availability, and Vercel function logs. Do not share the connection string while troubleshooting.
- If order queries fail after a successful health check, compare the Neon tables and columns with the list above.
- Admin and customer accounts are not created automatically. Provision them from an authorized operator terminal; do not enable self-selected admin roles.
- `npx tsc --noEmit` checks TypeScript and `npm run build` creates a production build. This project does not currently define an npm lint script.

Never enter card numbers, security codes, or other payment-card credentials. The payment table stores payment method and status only.
