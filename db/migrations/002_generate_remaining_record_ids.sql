BEGIN;

LOCK TABLE addresses, categories, customers, delivery_agents, products, warehouses
  IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  item record;
  sequence_name text;
  highest_id bigint;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('addresses', 'address_id'),
      ('categories', 'category_id'),
      ('customers', 'customer_id'),
      ('delivery_agents', 'agent_id'),
      ('products', 'product_id'),
      ('warehouses', 'warehouse_id')
    ) AS ids(table_name, column_name)
  LOOP
    sequence_name := item.table_name || '_' || item.column_name || '_seq';
    EXECUTE format('CREATE SEQUENCE public.%I AS integer', sequence_name);
    EXECUTE format(
      'SELECT COALESCE(MAX(%I), 0)::bigint FROM public.%I',
      item.column_name,
      item.table_name
    ) INTO highest_id;

    PERFORM setval(
      format('%I.%I', 'public', sequence_name)::regclass,
      GREATEST(highest_id, 1),
      highest_id > 0
    );
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT nextval(%L::regclass)',
      item.table_name,
      item.column_name,
      format('%I.%I', 'public', sequence_name)
    );
    EXECUTE format(
      'ALTER SEQUENCE public.%I OWNED BY public.%I.%I',
      sequence_name,
      item.table_name,
      item.column_name
    );
  END LOOP;
END
$$;

COMMIT;
