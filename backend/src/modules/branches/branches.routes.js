const express = require('express');
const db = require('../../infrastructure/db');
const { requireRole, requirePermission } = require('../../middleware/auth');

function buildBranchesRouter() {
	const router = express.Router();

	// Público/cliente: listar sucursales disponibles
	router.get('/client/branches', async (_req, res) => {
		const result = await db.query('SELECT id, name FROM branches ORDER BY name ASC');
		return res.status(200).json({ ok: true, branches: result.rows });
	});

	// Admin/Empleado: listar sucursales (usado para gestión de tumbas/sectores)
	router.get('/admin/branches', requireRole(['admin', 'employee']), requirePermission('graves'), async (_req, res) => {
		const result = await db.query('SELECT id, name FROM branches ORDER BY name ASC');
		return res.status(200).json({ ok: true, branches: result.rows });
	});

	return router;
}

module.exports = {
	buildBranchesRouter,
};
