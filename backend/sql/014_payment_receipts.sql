-- Comprobantes/recibos para pagos

-- Código estable para descargar comprobante en PDF.
-- Nota: el PDF se genera dinámicamente según estado, pero el receipt_code es fijo.

CREATE SEQUENCE IF NOT EXISTS payment_receipt_seq;

ALTER TABLE payments
	ADD COLUMN IF NOT EXISTS receipt_code TEXT;

ALTER TABLE payments
	ADD COLUMN IF NOT EXISTS receipt_issued_at TIMESTAMPTZ;

-- Default: genera código al insertar (ej: RC-000123)
ALTER TABLE payments
	ALTER COLUMN receipt_code
	SET DEFAULT ('RC-' || lpad(nextval('payment_receipt_seq')::text, 6, '0'));

CREATE UNIQUE INDEX IF NOT EXISTS payments_receipt_code_ux
	ON payments (receipt_code)
	WHERE receipt_code IS NOT NULL;

-- Backfill para pagos existentes
UPDATE payments
SET
	receipt_code = COALESCE(receipt_code, ('RC-' || lpad(nextval('payment_receipt_seq')::text, 6, '0'))),
	receipt_issued_at = COALESCE(receipt_issued_at, created_at, now())
WHERE receipt_code IS NULL OR receipt_issued_at IS NULL;
