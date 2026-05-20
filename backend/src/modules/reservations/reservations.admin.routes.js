const express = require('express');
const db = require('../../infrastructure/db');
const { requireRole, requirePermission } = require('../../middleware/auth');

function normalizeEmail(email) {
	return String(email || '').trim().toLowerCase();
}

function normalizeQuery(value) {
	return String(value || '').trim();
}

function buildReservationsAdminRouter() {
	const router = express.Router();

	// Reservas (GET: reservations o reports)
	router.get('/reservations', requireRole(['admin', 'employee']), requirePermission(['reservations', 'reports']), async (req, res) => {
		const hasReservedName = await db
			.query(
				`
					SELECT 1
					FROM information_schema.columns
					WHERE table_name = 'reservations'
					  AND column_name = 'reserved_deceased_full_name'
					LIMIT 1
				`,
			)
			.then((r) => (r.rowCount || 0) > 0);

		const result = await db.query(
			hasReservedName
				? `
					SELECT
						r.id,
						r.reservation_code,
						r.client_id,
						r.grave_id,
						r.reserved_from,
						r.reserved_to,
						r.status,
						r.created_at,
						r.reserved_deceased_full_name AS deceased_full_name,
						g.code AS grave_code,
						u.email AS client_email
					FROM reservations r
					JOIN clients c ON c.id = r.client_id
					JOIN users u ON u.id = c.user_id
					JOIN graves g ON g.id = r.grave_id
					ORDER BY r.id DESC
					LIMIT 200
				`
				: `
					SELECT
						r.id,
						r.reservation_code,
						r.client_id,
						r.grave_id,
						r.reserved_from,
						r.reserved_to,
						r.status,
						r.created_at,
						NULL::text AS deceased_full_name,
						g.code AS grave_code,
						u.email AS client_email
					FROM reservations r
					JOIN clients c ON c.id = r.client_id
					JOIN users u ON u.id = c.user_id
					JOIN graves g ON g.id = r.grave_id
					ORDER BY r.id DESC
					LIMIT 200
				`,
		);
		return res.status(200).json({ ok: true, reservations: result.rows });
	});

	// Reservas (write: reservations)
	router.post('/reservations', requireRole(['admin', 'employee']), requirePermission('reservations'), async (req, res) => {
		const clientEmail = normalizeEmail(req.body?.clientEmail);
		const graveId = req.body?.graveId;
		const reservedFrom = req.body?.reservedFrom || null;
		const reservedTo = req.body?.reservedTo || null;
		const status = normalizeQuery(req.body?.status) || 'pending';

		if (!clientEmail || !clientEmail.includes('@')) return res.status(400).json({ ok: false, error: 'EMAIL_INVALID' });
		if (!graveId) return res.status(400).json({ ok: false, error: 'GRAVE_REQUIRED' });
		if (!['pending', 'confirmed', 'cancelled', 'expired'].includes(status)) {
			return res.status(400).json({ ok: false, error: 'STATUS_INVALID' });
		}

		const clientResult = await db.query(
			`SELECT c.id AS client_id
			 FROM clients c
			 JOIN users u ON u.id = c.user_id
			 WHERE u.email = $1
			 LIMIT 1`,
			[clientEmail],
		);
		const clientId = clientResult.rows[0]?.client_id;
		if (!clientId) return res.status(400).json({ ok: false, error: 'CLIENT_NOT_FOUND' });

		const created = await db.query(
			`INSERT INTO reservations (client_id, grave_id, reserved_from, reserved_to, status)
			 VALUES ($1, $2, $3, $4, $5)
			 RETURNING id, client_id, grave_id, reserved_from, reserved_to, status, created_at`,
			[clientId, graveId, reservedFrom, reservedTo, status],
		);

		return res.status(200).json({ ok: true, reservation: created.rows[0] });
	});

	// Reservas (write: reservations)
	router.patch('/reservations/:id', requireRole(['admin', 'employee']), requirePermission('reservations'), async (req, res) => {
		const id = Number(req.params.id);
		const status = normalizeQuery(req.body?.status);
		if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'ID_INVALID' });
		if (!['pending', 'confirmed', 'cancelled', 'expired'].includes(status)) {
			return res.status(400).json({ ok: false, error: 'STATUS_INVALID' });
		}

		const updated = await db.withTransaction(async (client) => {
			const currentResult = await client.query(
				`SELECT id, grave_id, status, reservation_code
				 FROM reservations
				 WHERE id = $1
				 FOR UPDATE`,
				[id],
			);
			const current = currentResult.rows[0];
			if (!current) return null;

			const result = await client.query(
				`UPDATE reservations
				 SET status = $1
				 WHERE id = $2
				 RETURNING id, reservation_code, client_id, grave_id, reserved_from, reserved_to, status, created_at`,
				[status, id],
			);
			const reservation = result.rows[0];

			// Admin "habilita" la reserva: al confirmar, marcamos la tumba como reserved.
			if (current.status !== status) {
				if (status === 'confirmed') {
					const graveResult = await client.query('SELECT status FROM graves WHERE id = $1 FOR UPDATE', [current.grave_id]);
					const oldStatus = graveResult.rows[0]?.status;
					if (oldStatus === 'available') {
						await client.query(`UPDATE graves SET status = 'reserved', updated_at = now() WHERE id = $1`, [current.grave_id]);
						await client.query(
							`INSERT INTO grave_status_history (grave_id, old_status, new_status, changed_by_user_id)
							 VALUES ($1, $2, $3, $4)`,
							[current.grave_id, oldStatus, 'reserved', req.session.user.id],
						);
					}
				}

				if (status === 'cancelled' || status === 'expired') {
					const graveResult = await client.query('SELECT status FROM graves WHERE id = $1 FOR UPDATE', [current.grave_id]);
					const oldStatus = graveResult.rows[0]?.status;
					if (oldStatus === 'reserved') {
						await client.query(`UPDATE graves SET status = 'available', updated_at = now() WHERE id = $1`, [current.grave_id]);
						await client.query(
							`INSERT INTO grave_status_history (grave_id, old_status, new_status, changed_by_user_id)
							 VALUES ($1, $2, $3, $4)`,
							[current.grave_id, oldStatus, 'available', req.session.user.id],
						);
					}
				}
			}

			return reservation;
		});

		if (!updated) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
		return res.status(200).json({ ok: true, reservation: updated });
	});

	return router;
}

module.exports = {
	buildReservationsAdminRouter,
};
