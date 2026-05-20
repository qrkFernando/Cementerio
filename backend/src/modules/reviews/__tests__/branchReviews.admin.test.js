const express = require('express');
const request = require('supertest');

jest.mock('../../../infrastructure/db', () => ({
	query: jest.fn(),
}));

const db = require('../../../infrastructure/db');
const { buildBranchReviewsRouter } = require('../branchReviews.routes');

function makeApp() {
	const app = express();
	app.use(express.json());
	app.use((req, _res, next) => {
		req.session = req.session || {};
		const rawUser = req.get('x-test-user');
		if (rawUser) req.session.user = JSON.parse(rawUser);
		next();
	});
	app.use('/api', buildBranchReviewsRouter());
	app.use((err, _req, res, _next) => {
		return res.status(500).json({ ok: false, error: 'TEST_ERROR', message: String(err?.message || err) });
	});
	return app;
}

describe('reviews/branchReviews (admin)', () => {
	test('GET /api/admin/branch-reviews/recent: 401 si no hay sesión', async () => {
		const app = makeApp();
		const res = await request(app).get('/api/admin/branch-reviews/recent?branchId=1');
		expect(res.status).toBe(401);
		expect(res.body).toEqual({ ok: false, error: 'UNAUTHORIZED' });
	});

	test('GET /api/admin/branch-reviews/recent: 403 si falta permiso reports (employee)', async () => {
		const app = makeApp();
		const res = await request(app)
			.get('/api/admin/branch-reviews/recent?branchId=1')
			.set('x-test-user', JSON.stringify({ id: 1, role: 'employee', permissions: [] }));

		expect(res.status).toBe(403);
		expect(res.body).toEqual({ ok: false, error: 'FORBIDDEN' });
		expect(db.query).not.toHaveBeenCalled();
	});

	test('GET /api/admin/branch-reviews/recent: fallback [] cuando falta migración (42P01)', async () => {
		db.query.mockRejectedValueOnce({ code: '42P01' });

		const app = makeApp();
		const res = await request(app)
			.get('/api/admin/branch-reviews/recent?branchId=1&limit=5')
			.set('x-test-user', JSON.stringify({ id: 1, role: 'admin' }));

		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
		expect(res.body.reviews).toEqual([]);
	});
});
