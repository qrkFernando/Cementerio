const express = require('express');
const db = require('../../infrastructure/db');
const { toOptionalBigInt } = require('../../shared/normalize');

function buildGravesPublicRouter() {
	const router = express.Router();

	// Público: listar tumbas disponibles para reservar (solo lectura)
	router.get('/client/available-graves', async (req, res) => {
		const branchId = toOptionalBigInt(req.query?.branchId);
		const result = await db.query(
			`
				SELECT
					g.id,
					g.code,
					g.status,
					g.price_cents,
					g.is_enabled,
					l.sector_id,
					s.branch_id,
					b.name AS branch_name,
					s.name AS sector_name,
					l.row_number,
					l.col_number,
					l.latitude,
					l.longitude
				FROM graves g
				LEFT JOIN locations l ON l.id = g.location_id
				LEFT JOIN sectors s ON s.id = l.sector_id
				LEFT JOIN branches b ON b.id = s.branch_id
				WHERE
					g.status = 'available'
					AND g.is_enabled IS DISTINCT FROM false
					AND ($1::bigint IS NULL OR s.branch_id = $1)
					AND NOT EXISTS (
						SELECT 1
						FROM reservations r
						WHERE r.grave_id = g.id
							AND r.status IN ('pending', 'confirmed')
					)
				ORDER BY b.name ASC NULLS LAST, s.name ASC NULLS LAST, l.row_number ASC NULLS LAST, l.col_number ASC NULLS LAST, g.id ASC
				LIMIT 500
			`,
			[branchId],
		);
		return res.status(200).json({ ok: true, graves: result.rows });
	});

	// Público: mapa de tumbas por sector (solo lectura)
	router.get('/client/grave-map', async (req, res) => {
		const requestedSectorId = toOptionalBigInt(req.query?.sectorId);
		const branchId = toOptionalBigInt(req.query?.branchId);
		const sectorsResult = await db.query(
			`
				SELECT s.id, s.name, s.branch_id, b.name AS branch_name
				FROM sectors s
				LEFT JOIN branches b ON b.id = s.branch_id
				WHERE ($1::bigint IS NULL OR s.branch_id = $1)
				ORDER BY b.name ASC NULLS LAST, s.name ASC
			`,
			[branchId],
		);
		const sectors = sectorsResult.rows;
		if (sectors.length === 0) return res.status(200).json({ ok: true, sectors: [], sectorId: null, graves: [] });

		const requestedInList = requestedSectorId != null && sectors.some((s) => Number(s.id) === Number(requestedSectorId));
		const sectorId = requestedInList ? requestedSectorId : sectors[0].id;
		const gravesResult = await db.query(
			`
				SELECT
					g.id,
					g.code,
					g.status AS grave_status,
					g.price_cents,
					g.is_enabled,
					g.grave_type_id,
					gt.name AS grave_type_name,
					l.sector_id,
					s.name AS sector_name,
					s.branch_id,
					b.name AS branch_name,
					l.row_number,
					l.col_number,
					ar.id AS active_reservation_id,
					ar.status AS active_reservation_status,
					ar.reservation_code AS active_reservation_code,
					(occ.burial_id IS NOT NULL) AS has_burial
				FROM graves g
				LEFT JOIN grave_types gt ON gt.id = g.grave_type_id
				LEFT JOIN locations l ON l.id = g.location_id
				LEFT JOIN sectors s ON s.id = l.sector_id
				LEFT JOIN branches b ON b.id = s.branch_id
				LEFT JOIN LATERAL (
					SELECT r.id, r.status, r.reservation_code
					FROM reservations r
					WHERE r.grave_id = g.id
						AND r.status IN ('pending','confirmed')
					ORDER BY r.id DESC
					LIMIT 1
				) ar ON true
				LEFT JOIN LATERAL (
					SELECT b.id AS burial_id
					FROM burials b
					WHERE b.grave_id = g.id
					ORDER BY b.id DESC
					LIMIT 1
				) occ ON true
				WHERE l.sector_id = $1
					AND g.is_enabled IS DISTINCT FROM false
				ORDER BY l.row_number ASC NULLS LAST, l.col_number ASC NULLS LAST, g.id ASC
			`,
			[sectorId],
		);

		return res.status(200).json({ ok: true, sectors, sectorId, graves: gravesResult.rows });
	});

	return router;
}

module.exports = {
	buildGravesPublicRouter,
};
