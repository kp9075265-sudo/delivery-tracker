"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { AdminField, AdminFieldType } from "@/lib/admin-records";

type RecordValue = string | number | boolean | null;
type ReferenceOption = { value: number; label: string };
type TableDefinition = {
  label: string;
  primaryKey: string;
  columns: string[];
  editableFields: AdminField[];
  canCreate: boolean;
  createHelp?: string;
};
type TableResponse = {
  definition: TableDefinition;
  records: Array<Record<string, RecordValue>>;
  total: number;
  page: number;
  pageSize: number;
  references: Record<string, ReferenceOption[]>;
};

const fieldTypeInput: Record<AdminFieldType, string> = {
  text: "text",
  email: "email",
  integer: "number",
  decimal: "number",
  date: "date",
  datetime: "datetime-local",
  boolean: "checkbox"
};

function inputValue(value: RecordValue | undefined, type: AdminFieldType) {
  if (value === null || value === undefined) return "";
  if (type === "datetime" && typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  return String(value);
}

function displayValue(value: RecordValue) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }
  return String(value);
}

export function AdminRecords({ table }: { table: string }) {
  const [data, setData] = useState<TableResponse | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Record<string, RecordValue> | null>(null);
  const [creating, setCreating] = useState(false);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const notificationKey = useRef("");

  async function loadRecords(nextPage = page, searchTerm = search) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ table, page: String(nextPage), search: searchTerm });
      const response = await fetch(`/api/admin/records?${params.toString()}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load records.");
      setData(body);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRecords(1, "");
    // Table changes when navigating between sections.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  const isNotificationSection = table === "notifications";
  const currentFields = data?.definition.editableFields ?? [];
  const totalPages = useMemo(() => Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 25))), [data]);

  function startCreate() {
    setMessage("");
    setError("");
    setEditing(null);
    setCreating(true);
    notificationKey.current = "";
    const initial: Record<string, string | boolean> = {};
    currentFields.forEach((field) => { initial[field.name] = field.type === "boolean" ? false : ""; });
    if (isNotificationSection) {
      initial.customerId = "";
      initial.orderId = "";
      initial.message = "";
    }
    setValues(initial);
  }

  function startEdit(record: Record<string, RecordValue>) {
    setMessage("");
    setError("");
    setCreating(false);
    setEditing(record);
    const initial: Record<string, string | boolean> = {};
    currentFields.forEach((field) => {
      initial[field.name] = field.type === "boolean"
        ? Boolean(record[field.name])
        : inputValue(record[field.name], field.type);
    });
    setValues(initial);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
    setValues({});
    notificationKey.current = "";
  }

  function updateValue(name: string, value: string | boolean) {
    setValues((previous) => ({ ...previous, [name]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      let payload: Record<string, unknown>;
      if (isNotificationSection) {
        if (!notificationKey.current) notificationKey.current = crypto.randomUUID();
        payload = {
          table,
          customerId: values.customerId,
          orderId: values.orderId,
          message: values.message,
          eventKey: notificationKey.current
        };
      } else {
        const fields = creating ? currentFields : currentFields.filter((field) => Object.hasOwn(values, field.name));
        const recordValues: Record<string, string | boolean> = {};
        for (const field of fields) recordValues[field.name] = values[field.name] ?? "";
        payload = {
          table,
          values: recordValues,
          ...(editing ? { id: editing[data?.definition.primaryKey ?? ""] } : {})
        };
      }
      const response = await fetch("/api/admin/records", {
        method: creating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save this record.");
      closeForm();
      setMessage(creating
        ? isNotificationSection ? "Notification sent to the selected customer." : "Record created successfully."
        : "Record updated successfully.");
      setPage(1);
      await loadRecords(1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save this record.");
    } finally {
      setSaving(false);
    }
  }

  function renderField(field: AdminField) {
    const id = `record-${field.name}`;
    const options = data?.references[field.name];
    const isReference = Boolean(field.reference);
    return (
      <div className="record-form-field" key={field.name}>
        <label htmlFor={id}>{field.label}{field.required ? " *" : ""}</label>
        {isReference ? (
          <select id={id} value={String(values[field.name] ?? "")} required={field.required} onChange={(event) => updateValue(field.name, event.target.value)}>
            <option value="">Choose {field.label.toLowerCase()}</option>
            {(options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label} (#{option.value})</option>)}
          </select>
        ) : field.type === "boolean" ? (
          <select id={id} value={String(values[field.name] ?? "false")} onChange={(event) => updateValue(field.name, event.target.value === "true")}>
            <option value="true">Yes</option><option value="false">No</option>
          </select>
        ) : field.name === "description" || field.name === "message" ? (
          <textarea id={id} rows={3} maxLength={field.maxLength} required={field.required} value={String(values[field.name] ?? "")} onChange={(event) => updateValue(field.name, event.target.value)} />
        ) : (
          <input
            id={id}
            type={fieldTypeInput[field.type]}
            value={String(values[field.name] ?? "")}
            required={field.required}
            maxLength={field.maxLength}
            min={field.type === "integer" || field.type === "decimal" ? 0 : undefined}
            step={field.type === "decimal" ? "0.01" : field.type === "integer" ? "1" : undefined}
            onChange={(event) => updateValue(field.name, event.target.value)}
          />
        )}
      </div>
    );
  }

  function renderNotificationForm() {
    return (
      <div className="record-form-grid">
        <div className="record-form-field">
          <label htmlFor="record-customerId">Customer *</label>
          <select id="record-customerId" required value={String(values.customerId ?? "")} onChange={(event) => updateValue("customerId", event.target.value)}>
            <option value="">Choose a customer</option>
            {(data?.references.customerId ?? []).map((option) => <option key={option.value} value={option.value}>{option.label} (#{option.value})</option>)}
          </select>
        </div>
        <div className="record-form-field">
          <label htmlFor="record-orderId">Related order (optional)</label>
          <select id="record-orderId" value={String(values.orderId ?? "")} onChange={(event) => updateValue("orderId", event.target.value)}>
            <option value="">No related order</option>
            {(data?.references.orderId ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <small>The server verifies the order belongs to the selected customer.</small>
        </div>
        <div className="record-form-field record-form-wide">
          <label htmlFor="record-message">Message *</label>
          <textarea id="record-message" rows={4} maxLength={2000} required value={String(values.message ?? "")} onChange={(event) => updateValue("message", event.target.value)} />
        </div>
      </div>
    );
  }

  return (
      <div className="dashboard admin-records-page">
        <header className="page-heading">
          <div>
            <p className="section-kicker">DATABASE MANAGEMENT</p>
            <h1>{data?.definition.label ?? "Manage records"}</h1>
            <p className="page-subtitle">Search and manage existing PostgreSQL records. Primary keys are protected.</p>
          </div>
          {(data?.definition.canCreate || isNotificationSection) && (
            <button className="primary-button" type="button" onClick={startCreate}>
              {isNotificationSection ? "Create notification" : "Add record"}
            </button>
          )}
        </header>

        {error && <div className="error-box" role="alert">{error}</div>}
        {message && <div className="success-box" role="status">{message}</div>}
        {data?.definition.createHelp && <p className="record-guidance">{data.definition.createHelp}</p>}

        {(creating || editing) && (
          <section className="panel record-editor" aria-labelledby="record-editor-title">
            <div className="panel-heading">
              <div><p className="section-kicker">{creating ? "NEW RECORD" : `RECORD #${editing?.[data?.definition.primaryKey ?? ""] ?? ""}`}</p><h2 id="record-editor-title">{isNotificationSection ? "Create customer notification" : creating ? `Add ${data?.definition.label.toLowerCase()}` : "Edit record"}</h2></div>
              <button className="secondary-button" type="button" onClick={closeForm}>Cancel</button>
            </div>
            <form onSubmit={submit}>
              {isNotificationSection ? renderNotificationForm() : <div className="record-form-grid">{currentFields.map(renderField)}</div>}
              <div className="record-form-actions"><span className="muted">* Required field</span><button className="primary-button" disabled={saving}>{saving ? "Saving…" : creating ? "Create record" : "Save changes"}</button></div>
            </form>
          </section>
        )}

        <section className="panel">
          <form className="record-search" onSubmit={(event) => { event.preventDefault(); setPage(1); void loadRecords(1, search.trim()); }}>
            <div><label htmlFor="record-search">Search {data?.definition.label.toLowerCase() ?? "records"}</label><input id="record-search" type="search" value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} placeholder="Search available fields" /></div>
            <button className="primary-button" type="submit" disabled={loading}>{loading ? "Searching…" : "Search"}</button>
          </form>
          {loading && <p className="loading-message" role="status">Loading records…</p>}
          {!loading && !error && data?.records.length === 0 && <p className="empty">No records match this search.</p>}
          {data && data.records.length > 0 && (
            <>
              <div className="table-wrap">
                <table>
                  <thead><tr>{data.definition.columns.map((column) => <th scope="col" key={column}>{column.replaceAll("_", " ")}</th>)}<th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    {data.records.map((record) => (
                      <tr key={String(record[data.definition.primaryKey])}>
                        {data.definition.columns.map((column) => {
                          const value = record[column];
                          const relationOrder = ["order_id"].includes(column) && table !== "orders" && value != null;
                          return <td key={column}>
                            {relationOrder
                              ? <Link className="text-button" href={`/admin/orders/${value}`}>#{value}</Link>
                              : displayValue(value)}
                          </td>;
                        })}
                        <td>
                          {data.definition.editableFields.length > 0
                            ? <button className="text-button" type="button" onClick={() => startEdit(record)}>Edit</button>
                            : table === "orders"
                              ? <Link className="text-button" href={`/admin/orders/${record[data.definition.primaryKey]}`}>Manage</Link>
                              : <span className="muted">Read only</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="record-pagination">
                <span className="muted">Showing {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} of {data.total.toLocaleString()}</span>
                <div>
                  <button className="secondary-button" type="button" disabled={loading || page <= 1} onClick={() => { const next = page - 1; setPage(next); void loadRecords(next); }}>Previous</button>
                  <span aria-live="polite">Page {page} of {totalPages}</span>
                  <button className="secondary-button" type="button" disabled={loading || page >= totalPages} onClick={() => { const next = page + 1; setPage(next); void loadRecords(next); }}>Next</button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
  );
}
