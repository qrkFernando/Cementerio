const express = require('express');

const { requireRole, requirePermission } = require('../../middleware/auth');
const { getSetting, setSetting } = require('./settings.store');

const KEY_CEMETERY_LOCATION = 'cemetery_location_v1';

function normalizeString(value) {
	const s = String(value ?? '').trim();
	return s ? s : null;
}

function normalizeNumber(value) {
	if (value === '' || value == null) return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function buildSettingsAdminRouter() {
	const router = express.Router();

	// Admin/Empleado: obtener API key de Google Maps (para autocomplete/mapa en ajustes)
	// Nota: esta key igualmente llega al navegador; protégela con restricciones de HTTP referrer en Google Cloud.
	router.get('/google-maps-key', requireRole(['admin', 'employee']), requirePermission('graves'), async (req, res) => {
		const apiKey = String(process.env.GOOGLE_MAPS_API_KEY || '').trim();
		if (!apiKey) return res.status(404).json({ ok: false, error: 'NOT_CONFIGURED' });
		return res.status(200).json({ ok: true, apiKey });
	});

	// Admin/Empleado: ver ubicación general del cementerio
	router.get('/cemetery-location', requireRole(['admin', 'employee']), requirePermission('graves'), async (req, res) => {
		const row = await getSetting(KEY_CEMETERY_LOCATION);
		const value = row?.value || {};
		return res.status(200).json({
			ok: true,
			location: {
				name: normalizeString(value?.name),
				address: normalizeString(value?.address),
				latitude: value?.latitude ?? null,
				longitude: value?.longitude ?? null,
				updated_at: row?.updated_at ?? null,
			},
		});
	});

	// Admin/Empleado: actualizar ubicación general del cementerio
	router.put('/cemetery-location', requireRole(['admin', 'employee']), requirePermission('graves'), async (req, res) => {
		const name = normalizeString(req.body?.name);
		const address = normalizeString(req.body?.address);
		const latitude = normalizeNumber(req.body?.latitude);
		const longitude = normalizeNumber(req.body?.longitude);

		const hasLat = latitude != null;
		const hasLng = longitude != null;
		if (hasLat !== hasLng) return res.status(400).json({ ok: false, error: 'COORDS_INCOMPLETE' });
		if (latitude != null && (latitude < -90 || latitude > 90)) return res.status(400).json({ ok: false, error: 'LAT_INVALID' });
		if (longitude != null && (longitude < -180 || longitude > 180)) return res.status(400).json({ ok: false, error: 'LNG_INVALID' });
		if (name && name.length > 120) return res.status(400).json({ ok: false, error: 'NAME_TOO_LONG' });
		if (address && address.length > 240) return res.status(400).json({ ok: false, error: 'ADDRESS_TOO_LONG' });

		const saved = await setSetting(KEY_CEMETERY_LOCATION, {
			name,
			address,
			latitude,
			longitude,
		});

		return res.status(200).json({
			ok: true,
			location: {
				name,
				address,
				latitude,
				longitude,
				updated_at: saved?.updated_at ?? null,
			},
		});
	});

	return router;
}

module.exports = {
	buildSettingsAdminRouter,
};
