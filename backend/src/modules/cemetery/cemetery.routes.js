const express = require('express');
const db = require('../../infrastructure/db');
const { requireAuth, requireRole, requirePermission } = require('../../middleware/auth');
const { buildGravesPublicRouter } = require('../graves/graves.public.routes');
const { buildSectorsAdminRouter } = require('../sectors/sectors.admin.routes');
const { buildGravesAdminRouter } = require('../graves/graves.admin.routes');
const { buildReservationsClientRouter } = require('../reservations/reservations.client.routes');
const { buildPaymentsClientRouter } = require('../payments/payments.client.routes');
const { buildBurialsEmployeeRouter } = require('../burials/burials.employee.routes');
const { buildSettingsPublicRouter } = require('../settings/settings.public.routes');
const { buildBranchesRouter } = require('../branches/branches.routes');
const { buildBranchReviewsRouter } = require('../reviews/branchReviews.routes');

function normalizeQuery(value) {
	return String(value || '').trim();
}

function buildCemeteryRouter() {
	const router = express.Router();

	async function ensurePaymentTypes() {
		try {
			await db.query(
				`
					INSERT INTO payment_types (name)
					VALUES ('cash'), ('card_credit'), ('card_debit')
					ON CONFLICT (name) DO NOTHING
				`,
			);
		} catch {
			// Si la tabla aún no existe o la DB está caída, dejamos que el select falle y reporte.
		}
	}


	router.get('/search', requireAuth, async (req, res) => {
		const query = normalizeQuery(req.query?.q ?? req.query?.query);
		if (!query || query.length < 2) {
			return res.status(400).json({ ok: false, error: 'QUERY_TOO_SHORT' });
		}

		const like = `%${query}%`;
		const result = await db.query(
			`
				SELECT
					d.id AS deceased_id,
					d.first_name,
					d.last_name,
					d.date_of_death,
					g.id AS grave_id,
					g.code AS grave_code,
					g.status AS grave_status,
					g.price_cents,
					g.is_enabled,
					s.name AS sector_name,
					l.row_number,
					l.col_number,
					l.latitude,
					l.longitude
				FROM deceased d
				LEFT JOIN burials b ON b.deceased_id = d.id
				LEFT JOIN graves g ON g.id = b.grave_id
				LEFT JOIN locations l ON l.id = g.location_id
				LEFT JOIN sectors s ON s.id = l.sector_id
				WHERE
					(
						(d.first_name ILIKE $1 OR d.last_name ILIKE $1 OR (d.first_name || ' ' || d.last_name) ILIKE $1)
						OR (g.code ILIKE $1)
					)
					AND (g.id IS NULL OR g.is_enabled IS DISTINCT FROM false)
				ORDER BY d.last_name ASC, d.first_name ASC
				LIMIT 20
			`,
			[like],
		);

		return res.status(200).json({ ok: true, results: result.rows, items: result.rows });
	});

	// Tipos de pago (para cliente/visitante autenticado)
	router.get('/payment-types', requireAuth, async (req, res) => {
		await ensurePaymentTypes();
		const result = await db.query('SELECT id, name FROM payment_types ORDER BY name ASC');
		return res.status(200).json({ ok: true, paymentTypes: result.rows });
	});

	async function getClientIdOrNull(userId) {
		const clientResult = await db.query('SELECT id FROM clients WHERE user_id = $1 LIMIT 1', [userId]);
		return clientResult.rows[0]?.id ?? null;
	}

	// Cliente: ver datos del perfil (si corresponde)
	router.get('/client/profile', requireAuth, async (req, res) => {
		const userId = req.session.user.id;
		const result = await db.query(
			`SELECT id, user_id, full_name, phone, document_id
			 FROM clients
			 WHERE user_id = $1
			 LIMIT 1`,
			[userId],
		);
		return res.status(200).json({ ok: true, client: result.rows[0] || null });
	});

	// Cliente: editar datos del perfil
	router.put('/client/profile', requireAuth, async (req, res) => {
		const userId = req.session.user.id;
		const existing = await db.query(
			`SELECT id
			 FROM clients
			 WHERE user_id = $1
			 LIMIT 1`,
			[userId],
		);
		const clientId = existing.rows[0]?.id;
		if (!clientId) return res.status(403).json({ ok: false, error: 'CLIENT_REQUIRED' });

		const usernameRaw = String(req.body?.username ?? '').trim();
		const username = usernameRaw ? usernameRaw : null;
		const fullName = String(req.body?.fullName ?? req.body?.full_name ?? '').trim() || null;
		const phone = String(req.body?.phone ?? '').trim() || null;
		const documentId = String(req.body?.documentId ?? req.body?.document_id ?? '').trim() || null;

		if (username && (username.length < 2 || username.length > 24)) {
			return res.status(400).json({ ok: false, error: 'USERNAME_INVALID' });
		}
		if (fullName && fullName.length > 200) return res.status(400).json({ ok: false, error: 'FULL_NAME_TOO_LONG' });
		if (phone && phone.length > 40) return res.status(400).json({ ok: false, error: 'PHONE_TOO_LONG' });
		if (documentId && documentId.length > 32) return res.status(400).json({ ok: false, error: 'DNI_TOO_LONG' });

		if (username) {
			await db.query('UPDATE users SET username = $1 WHERE id = $2', [username, userId]);
			// Mantener la sesión actualizada (para /api/auth/me)
			if (req.session?.user) req.session.user.username = username;
		}

		const updated = await db.query(
			`UPDATE clients
			 SET full_name = $1,
			 	phone = $2,
			 	document_id = $3
			 WHERE id = $4
			 RETURNING id, user_id, full_name, phone, document_id`,
			[fullName, phone, documentId, clientId],
		);

		return res.status(200).json({ ok: true, client: updated.rows[0] || null });
	});

	// Dominio: graves (público)
	// Mantiene los mismos endpoints bajo /api/client/*
	router.use(buildGravesPublicRouter());

	// Dominio: settings (público)
	// Mantiene endpoints bajo /api/public/*
	router.use(buildSettingsPublicRouter());

	// Dominio: branches (público + admin)
	// Mantiene endpoints bajo /api/client/branches y /api/admin/branches
	router.use(buildBranchesRouter());

	// Dominio: reseñas/encuesta por sede
	// Endpoints bajo /api/client/branches/* y /api/admin/branch-reviews/*
	router.use(buildBranchReviewsRouter());

	// Dominio: reservations (cliente)
	// Mantiene los mismos endpoints bajo /api/client/reservations*
	router.use(buildReservationsClientRouter());

	// Dominio: payments (cliente)
	// Mantiene los mismos endpoints bajo /api/client/payments*
	router.use(buildPaymentsClientRouter());

	// Dominio: sectors + graves (admin/employee)
	// Mantiene los mismos endpoints bajo /api/admin/*
	router.use(buildSectorsAdminRouter());
	router.use(buildGravesAdminRouter());

	// Dominio: burials (employee)
	// Mantiene el mismo endpoint bajo /api/employee/burials
	router.use(buildBurialsEmployeeRouter());

	return router;
}

module.exports = {
	buildCemeteryRouter,
};
