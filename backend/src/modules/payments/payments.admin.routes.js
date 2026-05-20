const express = require('express');
const db = require('../../infrastructure/db');
const { requireRole, requirePermission } = require('../../middleware/auth');
const { writePaymentReceiptPdf } = require('../../shared/payment-receipt-pdf');

function normalizeEmail(email) {
	return String(email || '').trim().toLowerCase();
}

function normalizeQuery(value) {
	return String(value || '').trim();
}

function buildPaymentsAdminRouter() {
	const router = express.Router();

	// Tipos de pago (permiso: payments o reports)
	router.get('/payment-types', requireRole(['admin', 'employee']), requirePermission(['payments', 'reports']), async (req, res) => {
		try {
			await db.query(
				`
					INSERT INTO payment_types (name)
					VALUES ('cash'), ('card_credit'), ('card_debit')
					ON CONFLICT (name) DO NOTHING
				`,
			);
		} catch {
			// Ignorar (DB no lista / tabla no existe todavía)
		}
		const result = await db.query('SELECT id, name FROM payment_types ORDER BY name ASC');
		return res.status(200).json({ ok: true, paymentTypes: result.rows });
	});

	// Pagos (GET: payments o reports)
	router.get('/payments', requireRole(['admin', 'employee']), requirePermission(['payments', 'reports']), async (req, res) => {
		const result = await db.query(
			`
				SELECT
					p.id,
					p.receipt_code,
					p.client_id,
					p.reservation_id,
					p.payment_type_id,
					pt.name AS payment_type_name,
					p.amount_cents,
					p.currency,
					p.status,
					p.paid_at,
					p.created_at,
					u.email AS client_email
				FROM payments p
				JOIN payment_types pt ON pt.id = p.payment_type_id
				JOIN clients c ON c.id = p.client_id
				JOIN users u ON u.id = c.user_id
				ORDER BY p.id DESC
				LIMIT 200
			`,
		);
		return res.status(200).json({ ok: true, payments: result.rows });
	});

	// Admin/Empleado: descargar comprobante PDF (permiso: payments o reports)
	router.get(
		'/payments/:id/receipt.pdf',
		requireRole(['admin', 'employee']),
		requirePermission(['payments', 'reports']),
		async (req, res) => {
			const id = Number(req.params.id);
			if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'ID_INVALID' });

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
					WHERE p.id = $1
					LIMIT 1
				`,
				[id],
			);
			const receipt = result.rows[0];
			if (!receipt) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

			return writePaymentReceiptPdf(res, receipt);
		},
	);

	// Pagos (write: payments)
	router.post('/payments', requireRole(['admin', 'employee']), requirePermission('payments'), async (req, res) => {
		const clientEmail = normalizeEmail(req.body?.clientEmail);
		const reservationId = req.body?.reservationId ?? null;
		const paymentTypeId = req.body?.paymentTypeId;
		const amountCents = Number(req.body?.amountCents);
		const currency = normalizeQuery(req.body?.currency) || 'PEN';
		const status = normalizeQuery(req.body?.status) || 'pending';

		if (!clientEmail || !clientEmail.includes('@')) return res.status(400).json({ ok: false, error: 'EMAIL_INVALID' });
		if (!paymentTypeId) return res.status(400).json({ ok: false, error: 'PAYMENT_TYPE_REQUIRED' });
		if (!Number.isFinite(amountCents) || amountCents <= 0) return res.status(400).json({ ok: false, error: 'AMOUNT_INVALID' });
		if (!['pending', 'paid', 'void'].includes(status)) return res.status(400).json({ ok: false, error: 'STATUS_INVALID' });

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

		const paidAt = status === 'paid' ? new Date() : null;
		const created = await db.query(
			`INSERT INTO payments (client_id, reservation_id, payment_type_id, amount_cents, currency, status, paid_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)
			 RETURNING id, receipt_code, client_id, reservation_id, payment_type_id, amount_cents, currency, status, paid_at, created_at`,
			[clientId, reservationId, paymentTypeId, amountCents, currency, status, paidAt],
		);
		return res.status(200).json({ ok: true, payment: created.rows[0] });
	});

	// Pagos (write: payments)
	router.patch('/payments/:id', requireRole(['admin', 'employee']), requirePermission('payments'), async (req, res) => {
		const id = Number(req.params.id);
		const status = normalizeQuery(req.body?.status);
		if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'ID_INVALID' });
		if (!['pending', 'paid', 'void'].includes(status)) return res.status(400).json({ ok: false, error: 'STATUS_INVALID' });

		const paidAt = status === 'paid' ? new Date() : null;
		const result = await db.query(
			`UPDATE payments
			 SET status = $1,
			 	paid_at = CASE WHEN $1 = 'paid' THEN COALESCE(paid_at, $2) ELSE NULL END
			 WHERE id = $3
			 RETURNING id, receipt_code, client_id, reservation_id, payment_type_id, amount_cents, currency, status, paid_at, created_at`,
			[status, paidAt, id],
		);
		if (result.rowCount === 0) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
		return res.status(200).json({ ok: true, payment: result.rows[0] });
	});

	return router;
}

module.exports = {
	buildPaymentsAdminRouter,
};
