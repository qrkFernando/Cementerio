function normalizeQuery(value) {
	return String(value || '').trim();
}

function normalizeEmail(value) {
	return String(value || '').trim().toLowerCase();
}

function toOptionalBigInt(value) {
	// En este proyecto lo tratamos como Number (IDs de Postgres llegan como texto o number)
	if (value == null || value === '') return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

module.exports = {
	normalizeQuery,
	normalizeEmail,
	toOptionalBigInt,
};
