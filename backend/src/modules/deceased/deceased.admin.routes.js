const express = require('express');
const db = require('../../infrastructure/db');
const { requireRole, requirePermission } = require('../../middleware/auth');

function normalizeQuery(value) {
	return String(value || '').trim();
}

function buildDeceasedAdminRouter() {
	const router = express.Router();

	// Difuntos (permiso: deceased)
	router.get('/deceased', requireRole(['admin', 'employee']), requirePermission('deceased'), async (req, res) => {
		const result = await db.query(
			`
				SELECT
					d.id,
					d.first_name,
					d.last_name,
					d.document_id,
					d.date_of_birth,
					d.date_of_death,
					b.id AS burial_id,
					b.burial_date,
					g.id AS grave_id,
					g.code AS grave_code
				FROM deceased d
				LEFT JOIN burials b ON b.deceased_id = d.id
				LEFT JOIN graves g ON g.id = b.grave_id
				ORDER BY d.id DESC
				LIMIT 200
			`,
		);
		return res.status(200).json({ ok: true, deceased: result.rows });
	});

	// Crear difunto (permiso: deceased)
	router.post('/deceased', requireRole(['admin', 'employee']), requirePermission('deceased'), async (req, res) => {
		const firstName = normalizeQuery(req.body?.firstName);
		const lastName = normalizeQuery(req.body?.lastName);
		const documentId = normalizeQuery(req.body?.documentId) || null;
		const dateOfBirth = req.body?.dateOfBirth || null;
		const dateOfDeath = req.body?.dateOfDeath || null;
		if (!firstName || !lastName) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });

		const result = await db.query(
			`INSERT INTO deceased (first_name, last_name, document_id, date_of_birth, date_of_death)
			 VALUES ($1, $2, $3, $4, $5)
			 RETURNING id, first_name, last_name, document_id, date_of_birth, date_of_death`,
			[firstName, lastName, documentId, dateOfBirth, dateOfDeath],
		);
		return res.status(200).json({ ok: true, deceased: result.rows[0] });
	});

	return router;
}

module.exports = {
	buildDeceasedAdminRouter,
};
