const express = require('express');
const db = require('../../infrastructure/db');
const { requireAuth } = require('../../middleware/auth');
const { normalizeQuery } = require('../../shared/normalize');
const { writePaymentReceiptPdf } = require('../../shared/payment-receipt-pdf');

function buildPaymentsClientRouter() {
	const router = express.Router();

	async function getClientIdOrNull(userId) {
		const clientResult = await db.query('SELECT id FROM clients WHERE user_id = $1 LIMIT 1', [userId]);
		return clientResult.rows[0]?.id ?? null;
	}

	// Cliente/Visitante: ver sus pagos (si corresponde)
	router.get('/client/payments', requireAuth, async (req, res) => {
		const userId = req.session.user.id;
		const clientId = await getClientIdOrNull(userId);
		if (!clientId) {
			return res.status(200).json({ ok: true, payments: [] });
		}

		const result = await db.query(
			`
				SELECT
					p.id,
					p.receipt_code,
					p.reservation_id,
					r.reservation_code,
					r.grave_id,
					g.code AS grave_code,
					p.payment_type_id,
					pt.name AS payment_type_name,
					p.amount_cents,
					p.currency,
					p.status,
					p.paid_at,
					p.created_at
				FROM payments p
				JOIN payment_types pt ON pt.id = p.payment_type_id
				LEFT JOIN reservations r ON r.id = p.reservation_id
				LEFT JOIN graves g ON g.id = r.grave_id
				WHERE p.client_id = $1
				ORDER BY p.id DESC
				LIMIT 200
			`,
			[clientId],
		);

		return res.status(200).json({ ok: true, payments: result.rows });
	});

	// Cliente: descargar comprobante PDF
	router.get('/client/payments/:id/receipt.pdf', requireAuth, async (req, res) => {
		const id = Number(req.params.id);
		if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'ID_INVALID' });

		const userId = req.session.user.id;
		const clientId = await getClientIdOrNull(userId);
		if (!clientId) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

		const result = await db.query(
			`
				SELECT
					p.id,
					p.receipt_code,
					p.receipt_issued_at,
					p.client_id,
					p.reservation_id,
					p.amount_cents,
					p.currency,
					p.status,
					p.paid_at,
					p.created_at,
					pt.name AS payment_type_name,
					u.email AS client_email,
					c.full_name AS client_full_name,
					c.document_id AS client_document_id,
					r.reservation_code,
					g.code AS grave_code,
					b.name AS branch_name,
					s.name AS sector_name
				FROM payments p
				JOIN payment_types pt ON pt.id = p.payment_type_id
				JOIN clients c ON c.id = p.client_id
				JOIN users u ON u.id = c.user_id
				LEFT JOIN reservations r ON r.id = p.reservation_id
				LEFT JOIN graves g ON g.id = r.grave_id
				LEFT JOIN locations l ON l.id = g.location_id
				LEFT JOIN sectors s ON s.id = l.sector_id
				LEFT JOIN branches b ON b.id = s.branch_id
				WHERE p.id = $1 AND p.client_id = $2
				LIMIT 1
			`,
			[id, clientId],
		);
		const receipt = result.rows[0];
		if (!receipt) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

		return writePaymentReceiptPdf(res, receipt);
	});

	// Cliente: registrar un pago (queda pending para validación)
	router.post('/client/payments', requireAuth, async (req, res) => {
		const userId = req.session.user.id;
		const clientId = await getClientIdOrNull(userId);
		if (!clientId) return res.status(403).json({ ok: false, error: 'CLIENT_REQUIRED' });

		const reservationCode = normalizeQuery(req.body?.reservationCode);
		const paymentTypeId = req.body?.paymentTypeId;
		const amountCents = Number(req.body?.amountCents);
		const currency = normalizeQuery(req.body?.currency) || 'PEN';
		if (!reservationCode) return res.status(400).json({ ok: false, error: 'RESERVATION_CODE_REQUIRED' });
		if (!paymentTypeId) return res.status(400).json({ ok: false, error: 'PAYMENT_TYPE_REQUIRED' });
		if (!Number.isFinite(amountCents) || amountCents <= 0) return res.status(400).json({ ok: false, error: 'AMOUNT_INVALID' });

		try {
			const created = await db.withTransaction(async (client) => {
				const resv = await client.query(
					`
						SELECT r.id, r.status, r.grave_id, COALESCE(g.price_cents, 0) AS price_cents
						FROM reservations r
						JOIN graves g ON g.id = r.grave_id
						WHERE r.client_id = $1 AND r.reservation_code = $2
						LIMIT 1
						FOR UPDATE
					`,
					[clientId, reservationCode],
				);
				const reservation = resv.rows[0];
				if (!reservation) {
					const err = new Error('RESERVATION_NOT_FOUND');
					err.code = 'RESERVATION_NOT_FOUND';
					throw err;
				}
				if (reservation.status !== 'confirmed') {
					const err = new Error('RESERVATION_NOT_CONFIRMED');
					err.code = 'RESERVATION_NOT_CONFIRMED';
					throw err;
				}

				const sumsResult = await client.query(
					`
						SELECT
							COALESCE(SUM(amount_cents) FILTER (WHERE status = 'paid'), 0) AS paid_cents,
							COALESCE(SUM(amount_cents) FILTER (WHERE status = 'pending'), 0) AS pending_cents
						FROM payments
						WHERE client_id = $1 AND reservation_id = $2
					`,
					[clientId, reservation.id],
				);
				const paidCents = Number(sumsResult.rows[0]?.paid_cents || 0);
				const pendingCents = Number(sumsResult.rows[0]?.pending_cents || 0);
				const priceCents = Number(reservation.price_cents || 0);
				const dueCents = Math.max(priceCents - (paidCents + pendingCents), 0);
				if (!(dueCents > 0)) {
					const err = new Error('NOTHING_DUE');
					err.code = 'NOTHING_DUE';
					throw err;
				}
				if (amountCents !== dueCents) {
					const err = new Error('AMOUNT_MUST_MATCH_DUE');
					err.code = 'AMOUNT_MUST_MATCH_DUE';
					throw err;
				}

				const inserted = await client.query(
					`INSERT INTO payments (client_id, reservation_id, payment_type_id, amount_cents, currency, status)
					 VALUES ($1, $2, $3, $4, $5, 'pending')
					 RETURNING id, receipt_code, client_id, reservation_id, payment_type_id, amount_cents, currency, status, paid_at, created_at`,
					[clientId, reservation.id, paymentTypeId, amountCents, currency],
				);
				return inserted.rows[0];
			});

			return res.status(200).json({ ok: true, payment: created });
		} catch (error) {
			const code = error?.code || error?.message;
			if (code === 'RESERVATION_NOT_FOUND') return res.status(404).json({ ok: false, error: code });
			if (code === 'RESERVATION_NOT_CONFIRMED') return res.status(409).json({ ok: false, error: code });
			if (code === 'NOTHING_DUE') return res.status(409).json({ ok: false, error: code });
			if (code === 'AMOUNT_MUST_MATCH_DUE') return res.status(400).json({ ok: false, error: code });
			console.error('PAYMENT_CREATE_FAILED', error);
			return res.status(500).json({ ok: false, error: 'PAYMENT_CREATE_FAILED' });
		}
	});

	return router;
}

module.exports = {
	buildPaymentsClientRouter,
};
