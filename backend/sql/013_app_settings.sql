-- Settings storage for small app-wide configuration (e.g. cemetery location)

CREATE TABLE IF NOT EXISTS app_settings (
	key TEXT PRIMARY KEY,
	value JSONB NOT NULL,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
