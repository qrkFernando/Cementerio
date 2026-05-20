const express = require('express');

const { getSetting } = require('./settings.store');

const KEY_CEMETERY_LOCATION = 'cemetery_location_v1';

function normalizeString(value) {
	const s = String(value ?? '').trim();
	return s ? s : null;
}

function buildSettingsPublicRouter() {
	const router = express.Router();

	// Público: ubicación general del cementerio (para mostrar un mapa general)
	router.get('/public/cemetery-location', async (req, res) => {
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

	return router;
}

module.exports = {
	buildSettingsPublicRouter,
};
