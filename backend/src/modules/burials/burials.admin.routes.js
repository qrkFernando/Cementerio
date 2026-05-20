const express = require('express');
const db = require('../../infrastructure/db');
const { requireRole, requirePermission } = require('../../middleware/auth');

function buildBurialsAdminRouter() {
	const router = express.Router();

	// Crear entierro para un difunto existente (permiso: deceased)
	router.post('/burials', requireRole(['admin', 'employee']), requirePermission('deceased'), async (req, res) => {
		const deceasedId = req.body?.deceasedId;
		const graveId = req.body?.graveId;
		const burialDate = req.body?.burialDate || null;
		if (!deceasedId) return res.status(400).json({ ok: false, error: 'DECEASED_REQUIRED' });
		if (!graveId) return res.status(400).json({ ok: false, error: 'GRAVE_REQUIRED' });

		const created = await db.withTransaction(async (client) => {
			const oldStatusResult = await client.query('SELECT status FROM graves WHERE id = $1', [graveId]);
			const oldStatus = oldStatusResult.rows[0]?.status;

			const burialResult = await client.query(
				`INSERT INTO burials (deceased_id, grave_id, burial_date)
				 VALUES ($1, $2, $3)
				 RETURNING id, deceased_id, grave_id, burial_date`,
				[deceasedId, graveId, burialDate],
			);

			await client.query(`UPDATE graves SET status = 'occupied', updated_at = now() WHERE id = $1`, [graveId]);
			await client.query(
				`INSERT INTO grave_status_history (grave_id, old_status, new_status, changed_by_user_id)
				 VALUES ($1, $2, $3, $4)`,
				[graveId, oldStatus, 'occupied', req.session.user.id],
			);

			return { burial: burialResult.rows[0] };
		});

		return res.status(200).json({ ok: true, ...created });
	});

	return router;
}

module.exports = {
	buildBurialsAdminRouter,
};
