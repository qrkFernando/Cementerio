const express = require('express');
const request = require('supertest');

jest.mock('../../../infrastructure/db', () => ({
	query: jest.fn(),
}));

const db = require('../../../infrastructure/db');
const { buildAnalyticsAdminRouter } = require('../analytics.admin.routes');

function makeApp() {
	const app = express();
	app.use(express.json());
	app.use((req, _res, next) => {
		req.session = req.session || {};
		const rawUser = req.get('x-test-user');
		if (rawUser) req.session.user = JSON.parse(rawUser);
		next();
	});
	app.use('/api/admin', buildAnalyticsAdminRouter());
	app.use((err, _req, res, _next) => {
		return res.status(500).json({ ok: false, error: 'TEST_ERROR', message: String(err?.message || err) });
	});
	return app;
}

describe('analytics/admin', () => {
	test('GET /api/admin/analytics/daily: 401 si no hay sesión', async () => {
		const app = makeApp();
		const res = await request(app).get('/api/admin/analytics/daily?branchId=1');
		expect(res.status).toBe(401);
		expect(res.body).toEqual({ ok: false, error: 'UNAUTHORIZED' });
	});

	test('GET /api/admin/analytics/daily: fallback si falta migración (42P01) y conserva reviews_* en 0', async () => {
		db.query
			.mockRejectedValueOnce({ code: '42P01' })
			.mockResolvedValueOnce({
				rows: [
					{
						day: '2026-05-19',
						graves_created: 1,
						deceased_created: 0,
						burials_created: 0,
						reservations_created: 2,
						payments_created: 1,
						payments_paid: 0,
						reviews_count: 0,
						reviews_rating_sum: 0,
						reviews_avg_rating: 0,
					},
				],
			})
			.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Sede A' }], rowCount: 1 });

		const app = makeApp();
		const res = await request(app)
			.get('/api/admin/analytics/daily?branchId=1&days=7')
			.set('x-test-user', JSON.stringify({ id: 1, role: 'admin' }));

		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
		expect(res.body.series).toHaveLength(1);
		expect(res.body.totals.reviews_count).toBe(0);
		expect(res.body.totals.reviews_avg_rating).toBe(0);
		expect(db.query).toHaveBeenCalledTimes(3);
	});

	test('GET /api/admin/analytics/summary: 403 si falta permiso reports (employee)', async () => {
		const app = makeApp();
		const res = await request(app)
			.get('/api/admin/analytics/summary?days=30')
			.set('x-test-user', JSON.stringify({ id: 2, role: 'employee', permissions: [] }));

		expect(res.status).toBe(403);
		expect(res.body).toEqual({ ok: false, error: 'FORBIDDEN' });
	});

	test('GET /api/admin/analytics/summary: fallback si falta migración (42P01)', async () => {
		db.query
			.mockRejectedValueOnce({ code: '42P01' })
			.mockResolvedValueOnce({
				rows: [
					{
						branch_id: 1,
						branch_name: 'Sede A',
						graves_created: 0,
						deceased_created: 0,
						burials_created: 0,
						reservations_created: 0,
						payments_created: 0,
						payments_paid: 0,
						reviews_count: 0,
						reviews_avg_rating: 0,
					},
				],
			});

		const app = makeApp();
		const res = await request(app)
			.get('/api/admin/analytics/summary?days=30')
			.set('x-test-user', JSON.stringify({ id: 1, role: 'admin' }));

		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
		expect(res.body.branches).toHaveLength(1);
		expect(res.body.branches[0].reviews_count).toBe(0);
	});
});
