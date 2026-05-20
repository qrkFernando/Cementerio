const db = require('../../infrastructure/db');

let ensured = false;

async function ensureSettingsTable() {
	if (ensured) return;
	await db.query(`
		CREATE TABLE IF NOT EXISTS app_settings (
			key TEXT PRIMARY KEY,
			value JSONB NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		);
	`);
	ensured = true;
}

async function getSetting(key) {
	await ensureSettingsTable();
	const result = await db.query('SELECT key, value, updated_at FROM app_settings WHERE key = $1 LIMIT 1', [key]);
	return result.rows[0] || null;
}

async function setSetting(key, value) {
	await ensureSettingsTable();
	const result = await db.query(
		`INSERT INTO app_settings (key, value)
		 VALUES ($1, $2)
		 ON CONFLICT (key) DO UPDATE
		 SET value = EXCLUDED.value,
		 	updated_at = now()
		 RETURNING key, value, updated_at`,
		[key, value],
	);
	return result.rows[0] || null;
}

module.exports = {
	ensureSettingsTable,
	getSetting,
	setSetting,
};
