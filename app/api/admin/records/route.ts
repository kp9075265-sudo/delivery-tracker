import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { isApiError, requireApiAdmin, requireSameOrigin } from "@/lib/api-auth";
import { getAdminTable } from "@/lib/admin-records";
import { DatabaseConfigurationError, getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dbError(error: unknown, operation: string) {
  if (error instanceof DatabaseConfigurationError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
  if (code === "23503") {
    return NextResponse.json({ error: "This value is linked to another record. Check the selected relationship and try again." }, { status: 409 });
  }
  if (code === "23505") {
    return NextResponse.json({ error: "A record with the same unique value already exists." }, { status: 409 });
  }
  if (["23514", "22P02", "22001", "22003"].includes(code)) {
    return NextResponse.json({ error: "One or more values are outside the allowed database format or range." }, { status: 400 });
  }
  console.error(`Admin ${operation} database request failed.`);
  return NextResponse.json({ error: `Could not ${operation} this record. Check required fields and linked records.` }, { status: 500 });
}

function normalizeFieldValue(value: unknown, field: { type: string; required?: boolean; maxLength?: number }) {
  if (value === null || value === undefined || value === "") {
    if (field.required) throw new Error("A required field is missing.");
    return null;
  }

  if (field.type === "text" || field.type === "email") {
    if (typeof value !== "string") throw new Error("Text fields must contain text.");
    const normalized = value.trim();
    if (!normalized && field.required) throw new Error("A required field is missing.");
    if (field.maxLength && normalized.length > field.maxLength) throw new Error("A text field exceeds its allowed length.");
    if (field.type === "email" && normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new Error("Enter a valid email address.");
    }
    return normalized || null;
  }

  if (field.type === "integer") {
    const normalized = typeof value === "number" ? value : Number(value);
    if (!Number.isSafeInteger(normalized) || normalized < 0 || normalized > 2147483647) {
      throw new Error("Enter a non-negative whole number within the supported range.");
    }
    return normalized;
  }

  if (field.type === "decimal") {
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized < 0 || Math.abs(Math.round(normalized * 100) - normalized * 100) > 1e-8) {
      throw new Error("Enter a non-negative amount with at most two decimal places.");
    }
    if (normalized >= 100000000) throw new Error("The value exceeds this database column's supported range.");
    return normalized;
  }

  if (field.type === "boolean") {
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error("Choose true or false.");
  }

  if (field.type === "date") {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Enter a valid date.");
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Enter a valid date.");
    return value;
  }

  if (field.type === "datetime") {
    if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) throw new Error("Enter a valid date and time.");
    return new Date(value);
  }

  throw new Error("Unsupported field type.");
}

async function validateReference(client: PoolClient, field: { reference?: { table: string; id: string } }, value: unknown) {
  if (!field.reference || value === null) return;
  const { table, id } = field.reference;
  const result = await client.query(`SELECT 1 FROM "${table}" WHERE "${id}" = $1 LIMIT 1`, [value]);
  if (result.rowCount === 0) throw new Error("A selected linked record does not exist.");
}

export async function GET(request: Request) {
  const user = await requireApiAdmin();
  if (isApiError(user)) return user;

  const params = new URL(request.url).searchParams;
  const tableName = params.get("table") ?? "";
  const definition = getAdminTable(tableName);
  if (!definition) return NextResponse.json({ error: "Choose a supported database section." }, { status: 400 });

  const requestedPage = Number(params.get("page") ?? "1");
  const page = Number.isSafeInteger(requestedPage)
    ? Math.max(1, Math.min(100000, requestedPage))
    : 1;
  const limit = 25;
  const search = (params.get("search") ?? "").trim().slice(0, 100);
  const offset = (page - 1) * limit;
  const where = search
    ? `WHERE (${definition.searchColumns.map((column) => `"${column}"::text ILIKE $1`).join(" OR ")})`
    : "";
  const values = search ? [`%${search}%`] : [];

  try {
    const pool = getPool();
    const [records, total] = await Promise.all([
      pool.query(
        `SELECT ${definition.columns.map((column) => `"${column}"`).join(", ")}
         FROM "${tableName}"
         ${where}
         ORDER BY "${definition.primaryKey}" DESC
         LIMIT ${limit} OFFSET $${values.length + 1}`,
        [...values, offset]
      ),
      pool.query(`SELECT COUNT(*) AS total FROM "${tableName}" ${where}`, values)
    ]);

    const references: Record<string, Array<{ value: number; label: string }>> = {};
    for (const field of definition.editableFields) {
      if (!field.reference) continue;
      const { table, id, label, labelColumns } = field.reference;
      const displayLabel = labelColumns
        ? `concat_ws(' ', ${labelColumns.map((column) => `"${column}"`).join(", ")})`
        : `"${label}"::text`;
      const options = await pool.query(
        `SELECT "${id}" AS value, ${displayLabel} AS label
         FROM "${table}" ORDER BY "${label}" LIMIT 500`
      );
      references[field.name] = options.rows;
    }
    if (tableName === "notifications") {
      const [customers, orders] = await Promise.all([
        pool.query(
          `SELECT customer_id AS value, concat_ws(' ', first_name, last_name) AS label
           FROM customers ORDER BY first_name, last_name, customer_id LIMIT 500`
        ),
        pool.query(
          `SELECT o.order_id AS value,
                  '#' || o.order_id::text || ' - ' || concat_ws(' ', c.first_name, c.last_name) AS label
           FROM orders o JOIN customers c ON c.customer_id = o.customer_id
           ORDER BY o.order_id DESC LIMIT 500`
        )
      ]);
      references.customerId = customers.rows;
      references.orderId = orders.rows;
    }

    return NextResponse.json({
      table: tableName,
      definition: {
        label: definition.label,
        primaryKey: definition.primaryKey,
        columns: definition.columns,
        editableFields: definition.editableFields,
        canCreate: definition.canCreate,
        createHelp: definition.createHelp
      },
      records: records.rows,
      total: Number(total.rows[0].total),
      page,
      pageSize: limit,
      references
    });
  } catch (error) {
    return dbError(error, "load");
  }
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
    return NextResponse.json({ error: "Record details are required." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const tableName = typeof input.table === "string" ? input.table : "";
  const definition = getAdminTable(tableName);
  if (tableName === "notifications") {
    const customerId = Number(input.customerId);
    const orderId = input.orderId === "" || input.orderId === null || input.orderId === undefined
      ? null
      : Number(input.orderId);
    const message = typeof input.message === "string" ? input.message.trim() : "";
    const eventKey = typeof input.eventKey === "string" ? input.eventKey : "";
    if (!Number.isSafeInteger(customerId) || customerId <= 0 ||
      (orderId !== null && (!Number.isSafeInteger(orderId) || orderId <= 0)) ||
      !message || message.length > 2000 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventKey)) {
      return NextResponse.json({ error: "Choose a customer, provide a message up to 2,000 characters, and submit a valid notification request." }, { status: 400 });
    }

    let client: PoolClient;
    try {
      client = await getPool().connect();
    } catch (error) {
      return dbError(error, "create");
    }
    try {
      await client.query("BEGIN");
      const customer = await client.query(
        "SELECT customer_id FROM customers WHERE customer_id = $1 FOR KEY SHARE",
        [customerId]
      );
      if (customer.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "The selected customer does not exist." }, { status: 400 });
      }
      if (orderId !== null) {
        const order = await client.query(
          "SELECT order_id FROM orders WHERE order_id = $1 AND customer_id = $2 FOR KEY SHARE",
          [orderId, customerId]
        );
        if (order.rowCount === 0) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "The selected order does not belong to this customer." }, { status: 400 });
        }
      }
      const result = await client.query(
        `INSERT INTO notifications (customer_id, order_id, message, sent_at, event_key)
         VALUES ($1, $2, $3, now(), $4)
         ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING
         RETURNING notification_id`,
        [customerId, orderId, message, `admin:${eventKey}`]
      );
      await client.query("COMMIT");
      return NextResponse.json({
        success: true,
        duplicate: result.rowCount === 0,
        id: result.rows[0]?.notification_id ?? null
      }, { status: result.rowCount === 0 ? 200 : 201 });
    } catch (error) {
      await client.query("ROLLBACK");
      return dbError(error, "create");
    } finally {
      client.release();
    }
  }
  if (!definition || !definition.canCreate) {
    return NextResponse.json({ error: "Records in this section must be created through their dedicated workflow." }, { status: 400 });
  }
  if (typeof input.values !== "object" || input.values === null || Array.isArray(input.values)) {
    return NextResponse.json({ error: "Record fields are required." }, { status: 400 });
  }

  const rawValues = input.values as Record<string, unknown>;
  const allowedFields = new Set(definition.editableFields.map((field) => field.name));
  if (Object.keys(rawValues).some((key) => !allowedFields.has(key))) {
    return NextResponse.json({ error: "A primary key or unsupported field cannot be changed." }, { status: 400 });
  }

  let values: Record<string, unknown>;
  try {
    values = {};
    for (const field of definition.editableFields) {
      const value = normalizeFieldValue(rawValues[field.name], field);
      if (field.required && value === null) throw new Error(`${field.label} is required.`);
      values[field.name] = value;
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Check the submitted values." }, { status: 400 });
  }

  let client: PoolClient;
  try {
    client = await getPool().connect();
  } catch (error) {
    return dbError(error, "create");
  }
  try {
    await client.query("BEGIN");
    for (const field of definition.editableFields) {
      await validateReference(client, field, values[field.name]);
    }
    const fields = definition.editableFields;
    const result = await client.query(
      `INSERT INTO "${tableName}" (${fields.map((field) => `"${field.name}"`).join(", ")})
       VALUES (${fields.map((_, index) => `$${index + 1}`).join(", ")})
       RETURNING "${definition.primaryKey}"`,
      fields.map((field) => values[field.name])
    );
    await client.query("COMMIT");
    return NextResponse.json({ success: true, id: result.rows[0][definition.primaryKey] }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    return dbError(error, "create");
  } finally {
    client.release();
  }
}

export async function PATCH(request: Request) {
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
    return NextResponse.json({ error: "Record changes are required." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const tableName = typeof input.table === "string" ? input.table : "";
  const definition = getAdminTable(tableName);
  const id = Number(input.id);
  if (!definition || !definition.editableFields.length) {
    return NextResponse.json({ error: "This section is read-only or uses a dedicated workflow." }, { status: 400 });
  }
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "A valid record ID is required." }, { status: 400 });
  }
  if (typeof input.values !== "object" || input.values === null || Array.isArray(input.values)) {
    return NextResponse.json({ error: "Record fields are required." }, { status: 400 });
  }

  const rawValues = input.values as Record<string, unknown>;
  const allowedFields = new Set(definition.editableFields.map((field) => field.name));
  const keys = Object.keys(rawValues);
  if (keys.length === 0 || keys.some((key) => !allowedFields.has(key))) {
    return NextResponse.json({ error: "Choose valid fields. Primary keys cannot be changed." }, { status: 400 });
  }

  let values: Record<string, unknown>;
  try {
    values = {};
    for (const field of definition.editableFields) {
      if (!Object.prototype.hasOwnProperty.call(rawValues, field.name)) continue;
      values[field.name] = normalizeFieldValue(rawValues[field.name], field);
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Check the submitted values." }, { status: 400 });
  }

  const fields = definition.editableFields.filter((field) => Object.prototype.hasOwnProperty.call(values, field.name));
  let client: PoolClient;
  try {
    client = await getPool().connect();
  } catch (error) {
    return dbError(error, "update");
  }
  try {
    await client.query("BEGIN");
    for (const field of fields) {
      await validateReference(client, field, values[field.name]);
    }
    const result = await client.query(
      `UPDATE "${tableName}"
       SET ${fields.map((field, index) => `"${field.name}" = $${index + 1}`).join(", ")}
       WHERE "${definition.primaryKey}" = $${fields.length + 1}
       RETURNING "${definition.primaryKey}"`,
      [...fields.map((field) => values[field.name]), id]
    );
    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Record not found." }, { status: 404 });
    }
    await client.query("COMMIT");
    return NextResponse.json({ success: true, id });
  } catch (error) {
    await client.query("ROLLBACK");
    return dbError(error, "update");
  } finally {
    client.release();
  }
}
