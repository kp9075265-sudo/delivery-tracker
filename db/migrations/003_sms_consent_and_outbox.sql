BEGIN;

ALTER TABLE customers
  ADD COLUMN sms_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN sms_consent_updated_at timestamp with time zone,
  ADD COLUMN sms_consent_source varchar(100);

CREATE TABLE sms_notifications (
  sms_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers(customer_id),
  order_id integer REFERENCES orders(order_id),
  event_type varchar(50) NOT NULL,
  event_key text NOT NULL UNIQUE,
  recipient_phone varchar(16) NOT NULL,
  message text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'delivered', 'failed')),
  provider_message_id varchar(64),
  provider_status varchar(40),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_attempt_at timestamp with time zone,
  sent_at timestamp with time zone,
  delivered_at timestamp with time zone,
  last_error varchar(500),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX sms_notifications_status_created_idx
  ON sms_notifications(status, created_at DESC);
CREATE INDEX sms_notifications_order_idx
  ON sms_notifications(order_id);

COMMIT;
