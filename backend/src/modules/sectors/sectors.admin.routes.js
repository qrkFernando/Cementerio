const express = require('express');
const db = require('../../infrastructure/db');
const { requireRole, requirePermission } = require('../../middleware/auth');
const { normalizeQuery, toOptionalBigInt } = require('../../shared/normalize');

function buildSectorsAdminRouter() {
	const router = express.Router();

	// Admin/Empleado: sectores y tumbas (permiso: graves)
	router.get('/admin/sectors', requireRole(['admin', 'employee']), requirePermission('graves'), async (req, res) => {
		const branchId = toOptionalBigInt(req.query?.branchId);
		const result = await db.query(
			`
				SELECT s.id, s.name, s.branch_id, b.name AS branch_name
				FROM sectors s
				LEFT JOIN branches b ON b.id = s.branch_id
				WHERE ($1::bigint IS NULL OR s.branch_id = $1)
				ORDER BY b.name ASC NULLS LAST, s.name ASC
			`,
			[branchId],
		);
		return res.status(200).json({ ok: true, sectors: result.rows });
	});

	// Admin/Empleado: mapa de tumbas por sector (permiso: graves)
	router.get('/admin/grave-map', requireRole(['admin', 'employee']), requirePermission('graves'), async (req, res) => {
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
					ar.client_id AS active_reservation_client_id,
					(occ.burial_id IS NOT NULL) AS has_burial
				FROM graves g
				LEFT JOIN grave_types gt ON gt.id = g.grave_type_id
				LEFT JOIN locations l ON l.id = g.location_id
				LEFT JOIN sectors s ON s.id = l.sector_id
				LEFT JOIN branches b ON b.id = s.branch_id
				LEFT JOIN LATERAL (
					SELECT r.id, r.client_id, r.status, r.reservation_code
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
				ORDER BY l.row_number ASC NULLS LAST, l.col_number ASC NULLS LAST, g.id ASC
			`,
			[sectorId],
		);

		return res.status(200).json({ ok: true, sectors, sectorId, graves: gravesResult.rows });
	});

	router.post('/admin/sectors', requireRole(['admin', 'employee']), requirePermission('graves'), async (req, res) => {
		const name = normalizeQuery(req.body?.name);
		if (!name) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
		const requestedBranchId = toOptionalBigInt(req.body?.branchId);
		let branchId = requestedBranchId;
		if (branchId != null) {
			const check = await db.query('SELECT id FROM branches WHERE id = $1 LIMIT 1', [branchId]);
			if (check.rowCount === 0) return res.status(400).json({ ok: false, error: 'BRANCH_ID_INVALID' });
		} else {
			const preferred = await db.query("SELECT id FROM branches WHERE name = 'Lima (Huachipa)' LIMIT 1");
			branchId = preferred.rows[0]?.id ?? null;
			if (branchId == null) {
				const first = await db.query('SELECT id FROM branches ORDER BY id ASC LIMIT 1');
				branchId = first.rows[0]?.id ?? null;
			}
			if (branchId == null) return res.status(500).json({ ok: false, error: 'BRANCHES_NOT_READY' });
		}

		const result = await db.query(
			`
				WITH inserted AS (
					INSERT INTO sectors (branch_id, name)
					VALUES ($1, $2)
					ON CONFLICT (branch_id, name)
					DO UPDATE SET name = EXCLUDED.name
					RETURNING id, name, branch_id
				)
				SELECT i.id, i.name, i.branch_id, b.name AS branch_name
				FROM inserted i
				LEFT JOIN branches b ON b.id = i.branch_id
			`,
			[branchId, name],
		);
		return res.status(200).json({ ok: true, sector: result.rows[0] || null });
	});

	// Admin/Empleado: generar/expandir grilla (permiso: graves)
	router.post(
		'/admin/sectors/:sectorId/grid',
		requireRole(['admin', 'employee']),
		requirePermission('graves'),
		async (req, res) => {
			const sectorId = Number(req.params.sectorId);
			if (!Number.isFinite(sectorId)) return res.status(400).json({ ok: false, error: 'SECTOR_ID_INVALID' });

			const rows = Number(req.body?.rows);
			const cols = Number(req.body?.cols);
			if (!Number.isFinite(rows) || rows < 1 || rows > 200) return res.status(400).json({ ok: false, error: 'ROWS_INVALID' });
			if (!Number.isFinite(cols) || cols < 1 || cols > 200) return res.status(400).json({ ok: false, error: 'COLS_INVALID' });
			if (rows * cols > 5000) return res.status(400).json({ ok: false, error: 'GRID_TOO_LARGE' });

			const priceCents = req.body?.priceCents != null ? Number(req.body?.priceCents) : 0;
			if (!Number.isFinite(priceCents) || priceCents < 0) return res.status(400).json({ ok: false, error: 'PRICE_INVALID' });
			const graveTypeId = req.body?.graveTypeId != null ? Number(req.body?.graveTypeId) : null;
			const isEnabled = req.body?.isEnabled != null ? Boolean(req.body?.isEnabled) : true;
			const status = 'available';

			try {
				const created = await db.withTransaction(async (client) => {
					const sectorCheck = await client.query('SELECT id FROM sectors WHERE id = $1 LIMIT 1', [sectorId]);
					if (sectorCheck.rowCount === 0) {
						const err = new Error('SECTOR_NOT_FOUND');
						err.code = 'SECTOR_NOT_FOUND';
						throw err;
					}

					// 1) Asegura locations para todas las coordenadas 1..rows x 1..cols
					const locInsert = await client.query(
						`
							INSERT INTO locations (sector_id, row_number, col_number)
							SELECT $1, r, c
							FROM generate_series(1, $2) AS r
							CROSS JOIN generate_series(1, $3) AS c
							ON CONFLICT (sector_id, row_number, col_number) DO NOTHING
						`,
						[sectorId, rows, cols],
					);

					// 2) Inserta graves faltantes para esas locations (uno por location)
					await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['graves_code_seq']);
					const maxResult = await client.query(
						`SELECT COALESCE(MAX((regexp_replace(lower(code), '^t-', ''))::int), 0) AS max_n
						 FROM graves
						 WHERE lower(code) ~ '^t-[0-9]+$'`,
					);
					const base = Number(maxResult.rows[0]?.max_n || 0);

					const graveInsert = await client.query(
						`
							WITH slots AS (
								SELECT l.id AS location_id
								FROM locations l
								LEFT JOIN graves g ON g.location_id = l.id
								WHERE l.sector_id = $1
									AND l.row_number BETWEEN 1 AND $2
									AND l.col_number BETWEEN 1 AND $3
									AND g.id IS NULL
								ORDER BY l.row_number ASC, l.col_number ASC, l.id ASC
							)
							INSERT INTO graves (code, status, price_cents, is_enabled, notes, location_id, grave_type_id)
							SELECT
								('t-' || lpad(($4 + row_number() OVER (ORDER BY location_id))::text, 4, '0')) AS code,
								$5 AS status,
								$6 AS price_cents,
								$7 AS is_enabled,
								NULL AS notes,
								location_id,
								$8 AS grave_type_id
							FROM slots
							RETURNING id, code, location_id
						`,
						[sectorId, rows, cols, base, status, priceCents, isEnabled, graveTypeId],
					);

					return {
						createdLocations: locInsert.rowCount,
						createdGraves: graveInsert.rowCount,
						createdCodes: graveInsert.rows.slice(0, 10).map((r) => r.code),
					};
				});

				return res.status(200).json({ ok: true, ...created });
			} catch (e) {
				const code = e?.code || e?.message;
				if (code === 'SECTOR_NOT_FOUND') return res.status(404).json({ ok: false, error: code });
				console.error('GRID_GENERATE_FAILED', e);
				return res.status(500).json({ ok: false, error: 'GRID_GENERATE_FAILED' });
			}
		},
	);

	return router;
}

module.exports = {
	buildSectorsAdminRouter,
};
