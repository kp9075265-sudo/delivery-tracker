export type AdminFieldType = "text" | "email" | "integer" | "decimal" | "date" | "datetime" | "boolean";

export type AdminReference = {
  table: string;
  id: string;
  label: string;
  labelColumns?: string[];
};

export type AdminField = {
  name: string;
  label: string;
  type: AdminFieldType;
  required?: boolean;
  maxLength?: number;
  reference?: AdminReference;
};

export type AdminTableDefinition = {
  label: string;
  primaryKey: string;
  columns: string[];
  searchColumns: string[];
  editableFields: AdminField[];
  canCreate: boolean;
  createHelp?: string;
};

const customerRef: AdminReference = {
  table: "customers",
  id: "customer_id",
  label: "first_name",
  labelColumns: ["first_name", "last_name"]
};
export const adminTables: Record<string, AdminTableDefinition> = {
  customers: {
    label: "Customers",
    primaryKey: "customer_id",
    columns: ["customer_id", "first_name", "last_name", "email", "phone", "registration_date"],
    searchColumns: ["customer_id", "first_name", "last_name", "email", "phone"],
    editableFields: [
      { name: "first_name", label: "First name", type: "text", required: true, maxLength: 50 },
      { name: "last_name", label: "Last name", type: "text", required: true, maxLength: 50 },
      { name: "email", label: "Email", type: "email", maxLength: 100 },
      { name: "phone", label: "Phone", type: "text", maxLength: 15 },
      { name: "registration_date", label: "Registration date", type: "date" }
    ],
    canCreate: true
  },
  products: {
    label: "Products",
    primaryKey: "product_id",
    columns: ["product_id", "product_name", "category_id", "price", "stock_quantity", "description"],
    searchColumns: ["product_id", "product_name", "description"],
    editableFields: [
      { name: "product_name", label: "Product name", type: "text", required: true, maxLength: 150 },
      { name: "category_id", label: "Category", type: "integer", reference: { table: "categories", id: "category_id", label: "category_name" } },
      { name: "price", label: "Price", type: "decimal", required: true },
      { name: "stock_quantity", label: "Stock quantity", type: "integer" },
      { name: "description", label: "Description", type: "text" }
    ],
    canCreate: true
  },
  categories: {
    label: "Categories",
    primaryKey: "category_id",
    columns: ["category_id", "category_name", "description"],
    searchColumns: ["category_id", "category_name", "description"],
    editableFields: [
      { name: "category_name", label: "Category name", type: "text", required: true, maxLength: 100 },
      { name: "description", label: "Description", type: "text" }
    ],
    canCreate: true
  },
  orders: {
    label: "Orders",
    primaryKey: "order_id",
    columns: ["order_id", "customer_id", "address_id", "order_date", "order_status", "total_amount"],
    searchColumns: ["order_id", "customer_id", "order_status"],
    editableFields: [],
    canCreate: false,
    createHelp: "Use the order workflow so totals, items, payment and notifications stay consistent."
  },
  order_items: {
    label: "Order items",
    primaryKey: "order_item_id",
    columns: ["order_item_id", "order_id", "product_id", "quantity", "price"],
    searchColumns: ["order_item_id", "order_id", "product_id"],
    editableFields: [],
    canCreate: false,
    createHelp: "Use the order workflow to keep line items and totals consistent."
  },
  addresses: {
    label: "Addresses",
    primaryKey: "address_id",
    columns: ["address_id", "customer_id", "street", "city", "state", "pincode", "country"],
    searchColumns: ["address_id", "customer_id", "street", "city", "pincode"],
    editableFields: [
      { name: "customer_id", label: "Customer", type: "integer", required: true, reference: customerRef },
      { name: "street", label: "Street", type: "text", maxLength: 255 },
      { name: "city", label: "City", type: "text", maxLength: 50 },
      { name: "state", label: "State", type: "text", maxLength: 50 },
      { name: "pincode", label: "Postal code", type: "text", maxLength: 10 },
      { name: "country", label: "Country", type: "text", maxLength: 50 }
    ],
    canCreate: true
  },
  payments: {
    label: "Payments",
    primaryKey: "payment_id",
    columns: ["payment_id", "order_id", "payment_method", "payment_status", "payment_date"],
    searchColumns: ["payment_id", "order_id", "payment_method", "payment_status"],
    editableFields: [],
    canCreate: false,
    createHelp: "Payment records are read-only here to avoid altering financial history. The order workflow creates pending payment records."
  },
  shipments: {
    label: "Shipments",
    primaryKey: "shipment_id",
    columns: ["shipment_id", "order_id", "warehouse_id", "agent_id", "shipment_status"],
    searchColumns: ["shipment_id", "order_id", "shipment_status"],
    editableFields: [],
    canCreate: false,
    createHelp: "Manage status, agent, and warehouse from the linked order page to record tracking and notify the customer."
  },
  delivery_agents: {
    label: "Delivery agents",
    primaryKey: "agent_id",
    columns: ["agent_id", "name", "phone", "vehicle_type", "availability"],
    searchColumns: ["agent_id", "name", "phone", "vehicle_type"],
    editableFields: [
      { name: "name", label: "Agent name", type: "text", required: true, maxLength: 100 },
      { name: "phone", label: "Phone", type: "text", maxLength: 15 },
      { name: "vehicle_type", label: "Vehicle type", type: "text", maxLength: 50 },
      { name: "availability", label: "Available", type: "boolean" }
    ],
    canCreate: true
  },
  tracking_updates: {
    label: "Tracking updates",
    primaryKey: "tracking_id",
    columns: ["tracking_id", "shipment_id", "current_location", "status", "update_time"],
    searchColumns: ["tracking_id", "shipment_id", "current_location", "status"],
    editableFields: [],
    canCreate: false,
    createHelp: "Tracking history is an audit trail. Add updates from the shipment management page."
  },
  warehouses: {
    label: "Warehouses",
    primaryKey: "warehouse_id",
    columns: ["warehouse_id", "warehouse_name", "city", "state"],
    searchColumns: ["warehouse_id", "warehouse_name", "city", "state"],
    editableFields: [
      { name: "warehouse_name", label: "Warehouse name", type: "text", required: true, maxLength: 100 },
      { name: "city", label: "City", type: "text", maxLength: 50 },
      { name: "state", label: "State", type: "text", maxLength: 50 }
    ],
    canCreate: true
  },
  notifications: {
    label: "Notifications",
    primaryKey: "notification_id",
    columns: ["notification_id", "customer_id", "order_id", "message", "sent_at", "read_at"],
    searchColumns: ["notification_id", "customer_id", "order_id", "message"],
    editableFields: [],
    canCreate: false,
    createHelp: "Create notifications from order management so ownership, order links, and duplicate protection are enforced."
  }
};

export function getAdminTable(table: string) {
  return Object.prototype.hasOwnProperty.call(adminTables, table) ? adminTables[table] : null;
}
