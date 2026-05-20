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

describe('reviews/branchReviews (client)', () => {
	test('GET /api/client/branches/summary: fallback cuando falta migración (42P01)', async () => {
		db.query
			.mockRejectedValueOnce({ code: '42P01' })
			.mockResolvedValueOnce({
				rows: [
					{ id: 1, name: 'Sede A', reviews_count: 0, avg_rating: 0, recent_comments: [] },
					{ id: 2, name: 'Sede B', reviews_count: 0, avg_rating: 0, recent_comments: [] },
				],
			});

		const app = makeApp();
		const res = await request(app).get('/api/client/branches/summary');

		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
		expect(Array.isArray(res.body.branches)).toBe(true);
		expect(res.body.branches).toHaveLength(2);
		expect(db.query).toHaveBeenCalledTimes(2);
	});

	test('GET /api/client/branches/:id/review: 401 si no hay sesión', async () => {
		const app = makeApp();
		const res = await request(app).get('/api/client/branches/1/review');
		expect(res.status).toBe(401);
		expect(res.body).toEqual({ ok: false, error: 'UNAUTHORIZED' });
	});

	test('PUT /api/client/branches/:id/review: valida rating (RATING_INVALID)', async () => {
		db.query.mockResolvedValueOnce({ rows: [{ id: 10 }], rowCount: 1 }); // clients lookup

		const app = makeApp();
		const res = await request(app)
			.put('/api/client/branches/1/review')
			.set('x-test-user', JSON.stringify({ id: 999, role: 'client' }))
			.send({ rating: 6, comment: 'x' });

		expect(res.status).toBe(400);
		expect(res.body).toEqual({ ok: false, error: 'RATING_INVALID' });
		// No debe consultar branches/reviews si el rating ya es inválido
		expect(db.query).toHaveBeenCalledTimes(1);
	});
});
