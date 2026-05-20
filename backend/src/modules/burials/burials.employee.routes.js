const express = require('express');
const db = require('../../infrastructure/db');
const { requireRole, requirePermission } = require('../../middleware/auth');
const { normalizeQuery } = require('../../shared/normalize');

function buildBurialsEmployeeRouter() {
	const router = express.Router();

	// Admin/Empleado: registrar entierro (permiso: deceased)
	router.post('/employee/burials', requireRole(['admin', 'employee']), requirePermission('deceased'), async (req, res) => {
		const firstName = normalizeQuery(req.body?.firstName);
		const lastName = normalizeQuery(req.body?.lastName);
		const dateOfDeath = req.body?.dateOfDeath || null;
		const graveId = req.body?.graveId;
		const burialDate = req.body?.burialDate || null;

		if (!firstName || !lastName) {
			return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
		}
		if (!graveId) return res.status(400).json({ ok: false, error: 'GRAVE_REQUIRED' });

		try {
			const created = await db.withTransaction(async (client) => {
				const deceasedResult = await client.query(
					`INSERT INTO deceased (first_name, last_name, date_of_death)
					 VALUES ($1, $2, $3)
					 RETURNING id, first_name, last_name, date_of_death`,
					[firstName, lastName, dateOfDeath],
				);
				const deceased = deceasedResult.rows[0];

				const burialResult = await client.query(
					`INSERT INTO burials (deceased_id, grave_id, burial_date)
					 VALUES ($1, $2, $3)
					 RETURNING id, deceased_id, grave_id, burial_date`,
					[deceased.id, graveId, burialDate],
				);

				const oldStatusResult = await client.query('SELECT status FROM graves WHERE id = $1', [graveId]);
				const oldStatus = oldStatusResult.rows[0]?.status;

				await client.query(`UPDATE graves SET status = 'occupied', updated_at = now() WHERE id = $1`, [graveId]);
				await client.query(
					`INSERT INTO grave_status_history (grave_id, old_status, new_status, changed_by_user_id)
					 VALUES ($1, $2, $3, $4)`,
					[graveId, oldStatus, 'occupied', req.session.user.id],
				);

				return { deceased, burial: burialResult.rows[0] };
			});

			return res.status(200).json({ ok: true, ...created });
		} catch {
			return res.status(400).json({ ok: false, error: 'BURIAL_CREATE_FAILED' });
		}
	});

	return router;
}

module.exports = {
	buildBurialsEmployeeRouter,
};
