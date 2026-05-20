const express = require('express');
const db = require('../../infrastructure/db');
const { requireRole, requirePermission } = require('../../middleware/auth');
const { normalizeQuery, toOptionalBigInt } = require('../../shared/normalize');

function buildGravesAdminRouter() {
	const router = express.Router();

	router.get('/admin/grave-types', requireRole(['admin', 'employee']), requirePermission('graves'), async (req, res) => {
		const result = await db.query('SELECT id, name FROM grave_types ORDER BY name ASC');
		return res.status(200).json({ ok: true, graveTypes: result.rows });
	});

	router.get('/admin/graves', requireRole(['admin', 'employee']), requirePermission('graves'), async (req, res) => {
		const branchId = toOptionalBigInt(req.query?.branchId);
		const result = await db.query(
			`
				SELECT
					g.id,
					g.code,
					g.status,
					g.price_cents,
					g.is_enabled,
					g.notes,
					g.location_id,
					g.grave_type_id,
					gt.name AS grave_type_name,
					l.sector_id,
					s.name AS sector_name,
					s.branch_id,
					b.name AS branch_name,
					l.row_number,
					l.col_number,
					l.latitude,
					l.longitude,
					g.created_at,
					g.updated_at
				FROM graves g
				LEFT JOIN grave_types gt ON gt.id = g.grave_type_id
				LEFT JOIN locations l ON l.id = g.location_id
				LEFT JOIN sectors s ON s.id = l.sector_id
				LEFT JOIN branches b ON b.id = s.branch_id
				WHERE ($1::bigint IS NULL OR s.branch_id = $1)
				ORDER BY g.id DESC
				LIMIT 200
			`,
			[branchId],
		);
		return res.status(200).json({ ok: true, graves: result.rows });
	});

	router.post('/admin/graves', requireRole(['admin', 'employee']), requirePermission('graves'), async (req, res) => {
		const codeInput = normalizeQuery(req.body?.code);
		const sectorId = req.body?.sectorId ?? null;
		const rowNumber = req.body?.rowNumber ?? null;
		const colNumber = req.body?.colNumber ?? null;
		const latitude = req.body?.latitude ?? null;
		const longitude = req.body?.longitude ?? null;
		const graveTypeId = req.body?.graveTypeId ?? null;
		const status = normalizeQuery(req.body?.status) || 'available';
		const priceCents = Number(req.body?.priceCents ?? 0);
		const isEnabled = req.body?.isEnabled != null ? Boolean(req.body?.isEnabled) : true;
		const notes = normalizeQuery(req.body?.notes) || null;
		if (!['available', 'occupied', 'reserved', 'maintenance'].includes(status)) {
			return res.status(400).json({ ok: false, error: 'STATUS_INVALID' });
		}
		if (!Number.isFinite(priceCents) || priceCents < 0) {
			return res.status(400).json({ ok: false, error: 'PRICE_INVALID' });
		}

		function formatGraveCode(n) {
			const padded = String(n).padStart(4, '0');
			return `t-${padded}`;
		}

		let locationId = null;
		if (sectorId != null || rowNumber != null || colNumber != null || latitude != null || longitude != null) {
			const locationResult = await db.query(
				`
					INSERT INTO locations (sector_id, row_number, col_number, latitude, longitude)
					VALUES ($1, $2, $3, $4, $5)
					ON CONFLICT (sector_id, row_number, col_number)
					DO UPDATE SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude
					RETURNING id
				`,
				[sectorId, rowNumber, colNumber, latitude, longitude],
			);
			locationId = locationResult.rows[0]?.id ?? null;
		}

		const result = await db.withTransaction(async (client) => {
			// Evita colisiones en generación secuencial
			await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['graves_code_seq']);

			let code = codeInput || null;
			if (!code) {
				const maxResult = await client.query(
					`SELECT COALESCE(MAX((regexp_replace(lower(code), '^t-', ''))::int), 0) AS max_n
					 FROM graves
					 WHERE lower(code) ~ '^t-[0-9]+$'`,
				);
				const next = Number(maxResult.rows[0]?.max_n || 0) + 1;
				code = formatGraveCode(next);
			}

			// Inserta y si choca (por código existente), reintenta sin abortar la transacción.
			for (let i = 0; i < 5; i++) {
				const inserted = await client.query(
					`
						INSERT INTO graves (code, status, price_cents, is_enabled, notes, location_id, grave_type_id)
						VALUES ($1, $2, $3, $4, $5, $6, $7)
						ON CONFLICT DO NOTHING
						RETURNING id, code, status, price_cents, is_enabled, notes, location_id, grave_type_id
					`,
					[code, status, priceCents, isEnabled, notes, locationId, graveTypeId],
				);
				if (inserted.rowCount > 0) return inserted;

				if (codeInput) break;
				const maxResult = await client.query(
					`SELECT COALESCE(MAX((regexp_replace(lower(code), '^t-', ''))::int), 0) AS max_n
					 FROM graves
					 WHERE lower(code) ~ '^t-[0-9]+$'`,
				);
				const next = Number(maxResult.rows[0]?.max_n || 0) + 1;
				code = formatGraveCode(next);
			}

			const err = new Error('GRAVE_CODE_GENERATION_FAILED');
			err.code = 'GRAVE_CODE_GENERATION_FAILED';
			throw err;
		});

		return res.status(200).json({ ok: true, grave: result.rows[0] });
	});

	router.patch('/admin/graves/:id', requireRole(['admin', 'employee']), requirePermission('graves'), async (req, res) => {
		const id = Number(req.params.id);
		if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'ID_INVALID' });

		const sectorId = req.body?.sectorId ?? null;
		const rowNumber = req.body?.rowNumber ?? null;
		const colNumber = req.body?.colNumber ?? null;
		const latitude = req.body?.latitude ?? null;
		const longitude = req.body?.longitude ?? null;
		const graveTypeId = req.body?.graveTypeId ?? null;
		const status = req.body?.status != null ? normalizeQuery(req.body?.status) : null;
		const priceCents = req.body?.priceCents != null ? Number(req.body?.priceCents) : null;
		const isEnabled = req.body?.isEnabled != null ? Boolean(req.body?.isEnabled) : null;
		const notes = req.body?.notes != null ? normalizeQuery(req.body?.notes) : null;

		if (status != null && !['available', 'occupied', 'reserved', 'maintenance'].includes(status)) {
			return res.status(400).json({ ok: false, error: 'STATUS_INVALID' });
		}
		if (priceCents != null && (!Number.isFinite(priceCents) || priceCents < 0)) {
			return res.status(400).json({ ok: false, error: 'PRICE_INVALID' });
		}

		const updated = await db.withTransaction(async (client) => {
			const currentResult = await client.query('SELECT id, status, location_id FROM graves WHERE id = $1 FOR UPDATE', [
				id,
			]);
			const current = currentResult.rows[0];
			if (!current) return null;

			let locationId = current.location_id;
			if (sectorId != null || rowNumber != null || colNumber != null || latitude != null || longitude != null) {
				const locationResult = await client.query(
					`
						INSERT INTO locations (sector_id, row_number, col_number, latitude, longitude)
						VALUES ($1, $2, $3, $4, $5)
						ON CONFLICT (sector_id, row_number, col_number)
						DO UPDATE SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude
						RETURNING id
					`,
					[sectorId, rowNumber, colNumber, latitude, longitude],
				);
				locationId = locationResult.rows[0]?.id ?? locationId;
			}

			const newStatus = status != null ? status : current.status;
			const updateResult = await client.query(
				`
					UPDATE graves
					SET status = COALESCE($1, status),
						price_cents = COALESCE($2, price_cents),
						is_enabled = COALESCE($3, is_enabled),
						notes = COALESCE($4, notes),
						location_id = $5,
						grave_type_id = COALESCE($6, grave_type_id),
						updated_at = now()
					WHERE id = $7
					RETURNING id, code, status, price_cents, is_enabled, notes, location_id, grave_type_id
				`,
				[status, priceCents, isEnabled, notes, locationId, graveTypeId, id],
			);

			if (status != null && current.status !== newStatus) {
				await client.query(
					`INSERT INTO grave_status_history (grave_id, old_status, new_status, changed_by_user_id)
					 VALUES ($1, $2, $3, $4)`,
					[id, current.status, newStatus, req.session.user.id],
				);
			}

			return updateResult.rows[0];
		});

		if (!updated) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
		return res.status(200).json({ ok: true, grave: updated });
	});

	return router;
}

module.exports = {
	buildGravesAdminRouter,
};
