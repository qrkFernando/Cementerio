const express = require('express');
const db = require('../../infrastructure/db');
const { requireRole, requirePermission } = require('../../middleware/auth');
const { toOptionalBigInt } = require('../../shared/normalize');

function toBoundedInt(value, { fallback, min, max }) {
	const n = Number(value);
	if (!Number.isFinite(n)) return fallback;
	const i = Math.trunc(n);
	if (i < min) return min;
	if (i > max) return max;
	return i;
}

function buildAnalyticsAdminRouter() {
	const router = express.Router();

	// Analítica diaria por sucursal (permiso: reports)
	// Ej: GET /api/admin/analytics/daily?branchId=1&days=30
	router.get('/analytics/daily', requireRole(['admin', 'employee']), requirePermission('reports'), async (req, res) => {
		const branchId = toOptionalBigInt(req.query?.branchId);
		if (branchId == null) return res.status(400).json({ ok: false, error: 'BRANCH_ID_REQUIRED' });

		const days = toBoundedInt(req.query?.days, { fallback: 30, min: 1, max: 365 });
		const sinceDateExpr = `current_date - ($2::int - 1)`;

			let result;
			try {
				result = await db.query(
					`
				WITH days AS (
					SELECT (current_date - i)::date AS day
					FROM generate_series(0, $2::int - 1) AS i
				),
				graves_created AS (
					SELECT g.created_at::date AS day, COUNT(*)::int AS c
					FROM graves g
					JOIN locations l ON l.id = g.location_id
					JOIN sectors s ON s.id = l.sector_id
					WHERE s.branch_id = $1
						AND g.created_at::date >= ${sinceDateExpr}
					GROUP BY 1
				),
				deceased_created AS (
					-- Difuntos creados que ya tienen entierro en esta sucursal
					SELECT d.created_at::date AS day, COUNT(*)::int AS c
					FROM deceased d
					JOIN burials bu ON bu.deceased_id = d.id
					JOIN graves g ON g.id = bu.grave_id
					JOIN locations l ON l.id = g.location_id
					JOIN sectors s ON s.id = l.sector_id
					WHERE s.branch_id = $1
						AND d.created_at::date >= ${sinceDateExpr}
					GROUP BY 1
				),
				burials_created AS (
					SELECT bu.created_at::date AS day, COUNT(*)::int AS c
					FROM burials bu
					JOIN graves g ON g.id = bu.grave_id
					JOIN locations l ON l.id = g.location_id
					JOIN sectors s ON s.id = l.sector_id
					WHERE s.branch_id = $1
						AND bu.created_at::date >= ${sinceDateExpr}
					GROUP BY 1
				),
				reservations_created AS (
					SELECT r.created_at::date AS day, COUNT(*)::int AS c
					FROM reservations r
					JOIN graves g ON g.id = r.grave_id
					JOIN locations l ON l.id = g.location_id
					JOIN sectors s ON s.id = l.sector_id
					WHERE s.branch_id = $1
						AND r.created_at::date >= ${sinceDateExpr}
					GROUP BY 1
				),
				payments_created AS (
					SELECT p.created_at::date AS day, COUNT(*)::int AS c
					FROM payments p
					JOIN reservations r ON r.id = p.reservation_id
					JOIN graves g ON g.id = r.grave_id
					JOIN locations l ON l.id = g.location_id
					JOIN sectors s ON s.id = l.sector_id
					WHERE s.branch_id = $1
						AND p.created_at::date >= ${sinceDateExpr}
					GROUP BY 1
				),
				payments_paid AS (
					SELECT p.paid_at::date AS day, COUNT(*)::int AS c
					FROM payments p
					JOIN reservations r ON r.id = p.reservation_id
					JOIN graves g ON g.id = r.grave_id
					JOIN locations l ON l.id = g.location_id
					JOIN sectors s ON s.id = l.sector_id
					WHERE s.branch_id = $1
						AND p.status = 'paid'
						AND p.paid_at IS NOT NULL
						AND p.paid_at::date >= ${sinceDateExpr}
					GROUP BY 1
					),
					reviews_updated AS (
						SELECT br.updated_at::date AS day, COUNT(*)::int AS reviews_count, SUM(br.rating)::int AS reviews_rating_sum
						FROM branch_reviews br
						WHERE br.branch_id = $1
							AND br.updated_at::date >= ${sinceDateExpr}
						GROUP BY 1
				)
				SELECT
					d.day::text AS day,
					COALESCE(gc.c, 0) AS graves_created,
					COALESCE(dc.c, 0) AS deceased_created,
					COALESCE(bc.c, 0) AS burials_created,
					COALESCE(rc.c, 0) AS reservations_created,
					COALESCE(pc.c, 0) AS payments_created,
						COALESCE(pp.c, 0) AS payments_paid,
						COALESCE(ru.reviews_count, 0) AS reviews_count,
						COALESCE(ru.reviews_rating_sum, 0) AS reviews_rating_sum,
						COALESCE(ru.reviews_rating_sum::float / NULLIF(ru.reviews_count, 0), 0) AS reviews_avg_rating
				FROM days d
				LEFT JOIN graves_created gc ON gc.day = d.day
				LEFT JOIN deceased_created dc ON dc.day = d.day
				LEFT JOIN burials_created bc ON bc.day = d.day
				LEFT JOIN reservations_created rc ON rc.day = d.day
				LEFT JOIN payments_created pc ON pc.day = d.day
				LEFT JOIN payments_paid pp ON pp.day = d.day
					LEFT JOIN reviews_updated ru ON ru.day = d.day
				ORDER BY d.day ASC
					`,
					[branchId, days],
				);
			} catch (error) {
				if (error?.code !== '42P01') throw error;
				// Sin migración de reseñas: devolvemos serie base (sin columnas de reseñas)
				result = await db.query(
					`
						WITH days AS (
							SELECT (current_date - i)::date AS day
							FROM generate_series(0, $2::int - 1) AS i
						),
						graves_created AS (
							SELECT g.created_at::date AS day, COUNT(*)::int AS c
							FROM graves g
							JOIN locations l ON l.id = g.location_id
							JOIN sectors s ON s.id = l.sector_id
							WHERE s.branch_id = $1
								AND g.created_at::date >= ${sinceDateExpr}
							GROUP BY 1
						),
						deceased_created AS (
							SELECT d.created_at::date AS day, COUNT(*)::int AS c
							FROM deceased d
							JOIN burials bu ON bu.deceased_id = d.id
							JOIN graves g ON g.id = bu.grave_id
							JOIN locations l ON l.id = g.location_id
							JOIN sectors s ON s.id = l.sector_id
							WHERE s.branch_id = $1
								AND d.created_at::date >= ${sinceDateExpr}
							GROUP BY 1
						),
						burials_created AS (
							SELECT bu.created_at::date AS day, COUNT(*)::int AS c
							FROM burials bu
							JOIN graves g ON g.id = bu.grave_id
							JOIN locations l ON l.id = g.location_id
							JOIN sectors s ON s.id = l.sector_id
							WHERE s.branch_id = $1
								AND bu.created_at::date >= ${sinceDateExpr}
							GROUP BY 1
						),
						reservations_created AS (
							SELECT r.created_at::date AS day, COUNT(*)::int AS c
							FROM reservations r
							JOIN graves g ON g.id = r.grave_id
							JOIN locations l ON l.id = g.location_id
							JOIN sectors s ON s.id = l.sector_id
							WHERE s.branch_id = $1
								AND r.created_at::date >= ${sinceDateExpr}
							GROUP BY 1
						),
						payments_created AS (
							SELECT p.created_at::date AS day, COUNT(*)::int AS c
							FROM payments p
							JOIN reservations r ON r.id = p.reservation_id
							JOIN graves g ON g.id = r.grave_id
							JOIN locations l ON l.id = g.location_id
							JOIN sectors s ON s.id = l.sector_id
							WHERE s.branch_id = $1
								AND p.created_at::date >= ${sinceDateExpr}
							GROUP BY 1
						),
						payments_paid AS (
							SELECT p.paid_at::date AS day, COUNT(*)::int AS c
							FROM payments p
							JOIN reservations r ON r.id = p.reservation_id
							JOIN graves g ON g.id = r.grave_id
							JOIN locations l ON l.id = g.location_id
							JOIN sectors s ON s.id = l.sector_id
							WHERE s.branch_id = $1
								AND p.status = 'paid'
								AND p.paid_at IS NOT NULL
								AND p.paid_at::date >= ${sinceDateExpr}
							GROUP BY 1
						)
						SELECT
							d.day::text AS day,
							COALESCE(gc.c, 0) AS graves_created,
							COALESCE(dc.c, 0) AS deceased_created,
							COALESCE(bc.c, 0) AS burials_created,
							COALESCE(rc.c, 0) AS reservations_created,
							COALESCE(pc.c, 0) AS payments_created,
							COALESCE(pp.c, 0) AS payments_paid,
							0::int AS reviews_count,
							0::int AS reviews_rating_sum,
							0::float AS reviews_avg_rating
						FROM days d
						LEFT JOIN graves_created gc ON gc.day = d.day
						LEFT JOIN deceased_created dc ON dc.day = d.day
						LEFT JOIN burials_created bc ON bc.day = d.day
						LEFT JOIN reservations_created rc ON rc.day = d.day
						LEFT JOIN payments_created pc ON pc.day = d.day
						LEFT JOIN payments_paid pp ON pp.day = d.day
						ORDER BY d.day ASC
					`,
					[branchId, days],
				);
			}

		const branchResult = await db.query('SELECT id, name FROM branches WHERE id = $1 LIMIT 1', [branchId]);
		const branch = branchResult.rows[0] || { id: branchId, name: null };

		const series = Array.isArray(result.rows) ? result.rows : [];
			const totals = series.reduce(
			(acc, row) => {
				acc.graves_created += Number(row.graves_created || 0);
				acc.deceased_created += Number(row.deceased_created || 0);
				acc.burials_created += Number(row.burials_created || 0);
				acc.reservations_created += Number(row.reservations_created || 0);
				acc.payments_created += Number(row.payments_created || 0);
				acc.payments_paid += Number(row.payments_paid || 0);
					acc.reviews_count += Number(row.reviews_count || 0);
					acc.reviews_rating_sum += Number(row.reviews_rating_sum || 0);
				return acc;
			},
			{
				graves_created: 0,
				deceased_created: 0,
				burials_created: 0,
				reservations_created: 0,
				payments_created: 0,
				payments_paid: 0,
					reviews_count: 0,
					reviews_rating_sum: 0,
			},
		);
			totals.reviews_avg_rating = totals.reviews_count > 0 ? totals.reviews_rating_sum / totals.reviews_count : 0;

		return res.status(200).json({ ok: true, branch, days, series, totals });
	});

	// Resumen por sucursal (permiso: reports)
	// Ej: GET /api/admin/analytics/summary?days=30
	router.get('/analytics/summary', requireRole(['admin', 'employee']), requirePermission('reports'), async (req, res) => {
		const days = toBoundedInt(req.query?.days, { fallback: 30, min: 1, max: 365 });
		const sinceDateExpr = `current_date - ($1::int - 1)`;

		let result;
		try {
			result = await db.query(
				`
				WITH
				gr AS (
					SELECT s.branch_id, COUNT(*)::int AS graves_created
					FROM graves g
					JOIN locations l ON l.id = g.location_id
					JOIN sectors s ON s.id = l.sector_id
					WHERE g.created_at::date >= ${sinceDateExpr}
					GROUP BY 1
				),
				dc AS (
					SELECT s.branch_id, COUNT(*)::int AS deceased_created
					FROM deceased d
					JOIN burials bu ON bu.deceased_id = d.id
					JOIN graves g ON g.id = bu.grave_id
					JOIN locations l ON l.id = g.location_id
					JOIN sectors s ON s.id = l.sector_id
					WHERE d.created_at::date >= ${sinceDateExpr}
					GROUP BY 1
				),
				bu AS (
					SELECT s.branch_id, COUNT(*)::int AS burials_created
					FROM burials bu
					JOIN graves g ON g.id = bu.grave_id
					JOIN locations l ON l.id = g.location_id
					JOIN sectors s ON s.id = l.sector_id
					WHERE bu.created_at::date >= ${sinceDateExpr}
					GROUP BY 1
				),
				rc AS (
					SELECT s.branch_id, COUNT(*)::int AS reservations_created
					FROM reservations r
					JOIN graves g ON g.id = r.grave_id
					JOIN locations l ON l.id = g.location_id
					JOIN sectors s ON s.id = l.sector_id
					WHERE r.created_at::date >= ${sinceDateExpr}
					GROUP BY 1
				),
				pc AS (
					SELECT s.branch_id, COUNT(*)::int AS payments_created
					FROM payments p
					JOIN reservations r ON r.id = p.reservation_id
					JOIN graves g ON g.id = r.grave_id
					JOIN locations l ON l.id = g.location_id
					JOIN sectors s ON s.id = l.sector_id
					WHERE p.created_at::date >= ${sinceDateExpr}
					GROUP BY 1
				),
				pp AS (
					SELECT s.branch_id, COUNT(*)::int AS payments_paid
					FROM payments p
					JOIN reservations r ON r.id = p.reservation_id
					JOIN graves g ON g.id = r.grave_id
					JOIN locations l ON l.id = g.location_id
					JOIN sectors s ON s.id = l.sector_id
					WHERE p.status = 'paid'
						AND p.paid_at IS NOT NULL
						AND p.paid_at::date >= ${sinceDateExpr}
					GROUP BY 1
				),
				rv AS (
					SELECT br.branch_id, COUNT(*)::int AS reviews_count, AVG(br.rating)::float AS reviews_avg_rating
					FROM branch_reviews br
					WHERE br.updated_at::date >= ${sinceDateExpr}
					GROUP BY 1
				)
				SELECT
					b.id AS branch_id,
					b.name AS branch_name,
					COALESCE(gr.graves_created, 0) AS graves_created,
					COALESCE(dc.deceased_created, 0) AS deceased_created,
					COALESCE(bu.burials_created, 0) AS burials_created,
					COALESCE(rc.reservations_created, 0) AS reservations_created,
					COALESCE(pc.payments_created, 0) AS payments_created,
					COALESCE(pp.payments_paid, 0) AS payments_paid,
					COALESCE(rv.reviews_count, 0) AS reviews_count,
					COALESCE(rv.reviews_avg_rating, 0) AS reviews_avg_rating
				FROM branches b
				LEFT JOIN gr ON gr.branch_id = b.id
				LEFT JOIN dc ON dc.branch_id = b.id
				LEFT JOIN bu ON bu.branch_id = b.id
				LEFT JOIN rc ON rc.branch_id = b.id
				LEFT JOIN pc ON pc.branch_id = b.id
				LEFT JOIN pp ON pp.branch_id = b.id
				LEFT JOIN rv ON rv.branch_id = b.id
				ORDER BY b.name ASC
				`,
				[days],
			);
		} catch (error) {
			if (error?.code !== '42P01') throw error;
			result = await db.query(
				`
					WITH
					gr AS (
						SELECT s.branch_id, COUNT(*)::int AS graves_created
						FROM graves g
						JOIN locations l ON l.id = g.location_id
						JOIN sectors s ON s.id = l.sector_id
						WHERE g.created_at::date >= ${sinceDateExpr}
						GROUP BY 1
					),
					dc AS (
						SELECT s.branch_id, COUNT(*)::int AS deceased_created
						FROM deceased d
						JOIN burials bu ON bu.deceased_id = d.id
						JOIN graves g ON g.id = bu.grave_id
						JOIN locations l ON l.id = g.location_id
						JOIN sectors s ON s.id = l.sector_id
						WHERE d.created_at::date >= ${sinceDateExpr}
						GROUP BY 1
					),
					bu AS (
						SELECT s.branch_id, COUNT(*)::int AS burials_created
						FROM burials bu
						JOIN graves g ON g.id = bu.grave_id
						JOIN locations l ON l.id = g.location_id
						JOIN sectors s ON s.id = l.sector_id
						WHERE bu.created_at::date >= ${sinceDateExpr}
						GROUP BY 1
					),
					rc AS (
						SELECT s.branch_id, COUNT(*)::int AS reservations_created
						FROM reservations r
						JOIN graves g ON g.id = r.grave_id
						JOIN locations l ON l.id = g.location_id
						JOIN sectors s ON s.id = l.sector_id
						WHERE r.created_at::date >= ${sinceDateExpr}
						GROUP BY 1
					),
					pc AS (
						SELECT s.branch_id, COUNT(*)::int AS payments_created
						FROM payments p
						JOIN reservations r ON r.id = p.reservation_id
						JOIN graves g ON g.id = r.grave_id
						JOIN locations l ON l.id = g.location_id
						JOIN sectors s ON s.id = l.sector_id
						WHERE p.created_at::date >= ${sinceDateExpr}
						GROUP BY 1
					),
					pp AS (
						SELECT s.branch_id, COUNT(*)::int AS payments_paid
						FROM payments p
						JOIN reservations r ON r.id = p.reservation_id
						JOIN graves g ON g.id = r.grave_id
						JOIN locations l ON l.id = g.location_id
						JOIN sectors s ON s.id = l.sector_id
						WHERE p.status = 'paid'
							AND p.paid_at IS NOT NULL
							AND p.paid_at::date >= ${sinceDateExpr}
						GROUP BY 1
					)
					SELECT
						b.id AS branch_id,
						b.name AS branch_name,
						COALESCE(gr.graves_created, 0) AS graves_created,
						COALESCE(dc.deceased_created, 0) AS deceased_created,
						COALESCE(bu.burials_created, 0) AS burials_created,
						COALESCE(rc.reservations_created, 0) AS reservations_created,
						COALESCE(pc.payments_created, 0) AS payments_created,
						COALESCE(pp.payments_paid, 0) AS payments_paid,
						0::int AS reviews_count,
						0::float AS reviews_avg_rating
					FROM branches b
					LEFT JOIN gr ON gr.branch_id = b.id
					LEFT JOIN dc ON dc.branch_id = b.id
					LEFT JOIN bu ON bu.branch_id = b.id
					LEFT JOIN rc ON rc.branch_id = b.id
					LEFT JOIN pc ON pc.branch_id = b.id
					LEFT JOIN pp ON pp.branch_id = b.id
					ORDER BY b.name ASC
				`,
				[days],
			);
		}

		return res.status(200).json({ ok: true, days, branches: result.rows || [] });
	});

	return router;
}

module.exports = {
	buildAnalyticsAdminRouter,
};
