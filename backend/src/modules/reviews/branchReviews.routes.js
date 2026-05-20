const express = require('express');
const db = require('../../infrastructure/db');
const { requireAuth, requireRole, requirePermission } = require('../../middleware/auth');

function toInt(value) {
	const n = Number(value);
	return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeText(value) {
	return String(value ?? '').trim();
}

async function getClientIdOrNull(userId) {
	const clientResult = await db.query('SELECT id FROM clients WHERE user_id = $1 LIMIT 1', [userId]);
	return clientResult.rows[0]?.id ?? null;
}

function buildBranchReviewsRouter() {
	const router = express.Router();

	// Público/cliente: resumen de reseñas por sede (promedio + cantidad + comentarios recientes)
	router.get('/client/branches/summary', async (_req, res) => {
		try {
			const result = await db.query(
				`
					WITH stats AS (
						SELECT
							branch_id,
							COUNT(*)::int AS reviews_count,
							AVG(rating)::float AS avg_rating
						FROM branch_reviews
						GROUP BY branch_id
					)
					SELECT
						b.id,
						b.name,
						COALESCE(s.reviews_count, 0) AS reviews_count,
						COALESCE(s.avg_rating, 0) AS avg_rating,
						COALESCE(rc.recent_comments, '[]'::jsonb) AS recent_comments
					FROM branches b
					LEFT JOIN stats s ON s.branch_id = b.id
					LEFT JOIN LATERAL (
						SELECT
							COALESCE(
								jsonb_agg(
									jsonb_build_object(
										'rating', t.rating,
										'comment', t.comment,
										'updated_at', t.updated_at
									)
									ORDER BY t.updated_at DESC
								),
								'[]'::jsonb
							) AS recent_comments
						FROM (
							SELECT rating, comment, updated_at
							FROM branch_reviews
							WHERE branch_id = b.id AND comment IS NOT NULL AND btrim(comment) <> ''
							ORDER BY updated_at DESC
							LIMIT 3
						) t
					) rc ON true
					ORDER BY b.name ASC
				`,
			);

			return res.status(200).json({ ok: true, branches: result.rows });
		} catch (error) {
			// Si aún no se aplicó la migración, devolvemos sedes con ceros.
			if (error?.code === '42P01') {
				const base = await db.query(
					`SELECT id, name, 0::int AS reviews_count, 0::float AS avg_rating, '[]'::jsonb AS recent_comments FROM branches ORDER BY name ASC`,
				);
				return res.status(200).json({ ok: true, branches: base.rows });
			}
			throw error;
		}
	});

	// Cliente: obtener mi reseña para una sede
	router.get('/client/branches/:branchId/review', requireAuth, async (req, res) => {
		const branchId = toInt(req.params.branchId);
		if (!Number.isFinite(branchId) || branchId <= 0) return res.status(400).json({ ok: false, error: 'BRANCH_ID_INVALID' });

		const userId = req.session.user.id;
		const clientId = await getClientIdOrNull(userId);
		if (!clientId) return res.status(403).json({ ok: false, error: 'CLIENT_REQUIRED' });

		try {
			const result = await db.query(
				`
					SELECT
						br.id,
						br.branch_id,
						br.client_id,
						br.rating,
						br.comment,
						br.created_at,
						br.updated_at
					FROM branch_reviews br
					WHERE br.branch_id = $1 AND br.client_id = $2
					LIMIT 1
				`,
				[branchId, clientId],
			);
			return res.status(200).json({ ok: true, review: result.rows[0] || null });
		} catch (error) {
			if (error?.code === '42P01') return res.status(503).json({ ok: false, error: 'MIGRATION_REQUIRED' });
			throw error;
		}
	});

	// Cliente: crear/actualizar mi reseña para una sede (upsert)
	router.put('/client/branches/:branchId/review', requireAuth, async (req, res) => {
		const branchId = toInt(req.params.branchId);
		if (!Number.isFinite(branchId) || branchId <= 0) return res.status(400).json({ ok: false, error: 'BRANCH_ID_INVALID' });

		const userId = req.session.user.id;
		const clientId = await getClientIdOrNull(userId);
		if (!clientId) return res.status(403).json({ ok: false, error: 'CLIENT_REQUIRED' });

		const rating = toInt(req.body?.rating);
		if (!Number.isFinite(rating) || rating < 1 || rating > 5) return res.status(400).json({ ok: false, error: 'RATING_INVALID' });

		const commentRaw = normalizeText(req.body?.comment);
		const comment = commentRaw ? commentRaw : null;
		if (comment && comment.length > 800) return res.status(400).json({ ok: false, error: 'COMMENT_TOO_LONG' });

		// Validar branch existente (para error más claro)
		const branchExists = await db.query('SELECT 1 FROM branches WHERE id = $1 LIMIT 1', [branchId]);
		if (branchExists.rowCount === 0) return res.status(404).json({ ok: false, error: 'BRANCH_NOT_FOUND' });

		try {
			const result = await db.query(
				`
					INSERT INTO branch_reviews (branch_id, client_id, rating, comment)
					VALUES ($1, $2, $3, $4)
					ON CONFLICT (branch_id, client_id)
					DO UPDATE
					SET rating = EXCLUDED.rating,
						comment = EXCLUDED.comment,
						updated_at = now()
					RETURNING id, branch_id, client_id, rating, comment, created_at, updated_at
				`,
				[branchId, clientId, rating, comment],
			);
			return res.status(200).json({ ok: true, review: result.rows[0] || null });
		} catch (error) {
			if (error?.code === '42P01') return res.status(503).json({ ok: false, error: 'MIGRATION_REQUIRED' });
			throw error;
		}
	});

	// Admin/Empleado: listar reseñas recientes (para ver comentarios en análisis)
	router.get('/admin/branch-reviews/recent', requireRole(['admin', 'employee']), requirePermission('reports'), async (req, res) => {
		const branchId = toInt(req.query?.branchId);
		if (!Number.isFinite(branchId) || branchId <= 0) return res.status(400).json({ ok: false, error: 'BRANCH_ID_INVALID' });

		const limitRaw = toInt(req.query?.limit);
		const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 20;

		try {
			const result = await db.query(
				`
					SELECT
						br.id,
						br.branch_id,
						b.name AS branch_name,
						br.client_id,
						br.rating,
						br.comment,
						br.created_at,
						br.updated_at,
						c.full_name AS client_full_name,
						u.email AS client_email
					FROM branch_reviews br
					JOIN branches b ON b.id = br.branch_id
					JOIN clients c ON c.id = br.client_id
					JOIN users u ON u.id = c.user_id
					WHERE br.branch_id = $1 AND br.comment IS NOT NULL AND btrim(br.comment) <> ''
					ORDER BY br.updated_at DESC
					LIMIT $2
				`,
				[branchId, limit],
			);
			return res.status(200).json({ ok: true, reviews: result.rows });
		} catch (error) {
			if (error?.code === '42P01') return res.status(200).json({ ok: true, reviews: [] });
			throw error;
		}
	});

	return router;
}

module.exports = {
	buildBranchReviewsRouter,
};
