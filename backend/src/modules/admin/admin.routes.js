const express = require('express');
const db = require('../../infrastructure/db');
const { requireRole, requirePermission } = require('../../middleware/auth');
const { validatePasswordStrength, hashPassword } = require('../auth/auth.service');
const { buildReservationsAdminRouter } = require('../reservations/reservations.admin.routes');
const { buildPaymentsAdminRouter } = require('../payments/payments.admin.routes');
const { buildDeceasedAdminRouter } = require('../deceased/deceased.admin.routes');
const { buildBurialsAdminRouter } = require('../burials/burials.admin.routes');
const { buildSettingsAdminRouter } = require('../settings/settings.admin.routes');
const { buildAnalyticsAdminRouter } = require('../analytics/analytics.admin.routes');

const EMPLOYEE_PERMISSION_KEYS = ['graves', 'deceased', 'reservations', 'payments', 'reports'];

function normalizePermissions(perms) {
	if (!Array.isArray(perms)) return [];
	const cleaned = perms
		.map((p) => String(p || '').trim())
		.filter((p) => EMPLOYEE_PERMISSION_KEYS.includes(p));
	return Array.from(new Set(cleaned));
}

function normalizeEmail(email) {
	return String(email || '').trim().toLowerCase();
}

function normalizeQuery(value) {
	return String(value || '').trim();
}

function isValidPasswordHash(value) {
	return typeof value === 'string' && value.startsWith('scrypt:');
}

function buildAdminRouter() {
	const router = express.Router();

	// Asignar rol a un usuario (MVP) para poder crear empleados sin panel complejo.
	router.post('/users/role', requireRole('admin'), async (req, res) => {
		const email = normalizeEmail(req.body?.email);
		const role = normalizeQuery(req.body?.role);
		if (!email || !email.includes('@')) return res.status(400).json({ ok: false, error: 'EMAIL_INVALID' });
		if (!['admin', 'employee', 'visitor', 'client'].includes(role)) {
			return res.status(400).json({ ok: false, error: 'ROLE_INVALID' });
		}

		const roleResult = await db.query('SELECT id FROM roles WHERE name = $1', [role]);
		const roleId = roleResult.rows[0]?.id;
		if (!roleId) return res.status(500).json({ ok: false, error: 'ROLES_NOT_INITIALIZED' });

		const userResult = await db.query(
			`INSERT INTO users (email, role_id)
			 VALUES ($1, $2)
			 ON CONFLICT (email) DO UPDATE SET role_id = EXCLUDED.role_id
			 RETURNING id, email, role_id`,
			[email, roleId],
		);

		return res.status(200).json({ ok: true, user: userResult.rows[0] });
	});

	// Crear perfil empleado asociado a un user (1:1) + rol employee
	router.post('/employees', requireRole('admin'), async (req, res) => {
		const email = normalizeEmail(req.body?.email);
		const fullName = normalizeQuery(req.body?.fullName) || null;
		const phone = normalizeQuery(req.body?.phone) || null;
		const permissions = normalizePermissions(req.body?.permissions);
		const password = String(req.body?.password || '');
		const confirmPassword = String(req.body?.confirmPassword || '');
		if (!email || !email.includes('@')) return res.status(400).json({ ok: false, error: 'EMAIL_INVALID' });

		const wantsPasswordUpdate = Boolean(password || confirmPassword);
		if (wantsPasswordUpdate) {
			if (!password || password !== confirmPassword) {
				return res.status(400).json({ ok: false, error: 'PASSWORD_MISMATCH' });
			}
			const strength = validatePasswordStrength(password);
			if (!strength.ok) {
				return res.status(400).json({ ok: false, error: strength.reason || 'PASSWORD_WEAK' });
			}
		}

		const passwordHash = wantsPasswordUpdate ? await hashPassword(password) : null;
		const defaultUsername = email.includes('@') ? email.split('@')[0].slice(0, 24) : null;

		const employeeRole = await db.query("SELECT id FROM roles WHERE name = 'employee' LIMIT 1");
		const employeeRoleId = employeeRole.rows[0]?.id;
		if (!employeeRoleId) return res.status(500).json({ ok: false, error: 'ROLES_NOT_INITIALIZED' });

		let created;
		try {
			created = await db.withTransaction(async (client) => {
			const existingUser = await client.query('SELECT id, password_hash, email_verified_at, username FROM users WHERE email = $1 LIMIT 1', [
				email,
			]);
			const hasExistingUser = existingUser.rowCount > 0;
			const existingPasswordHash = existingUser.rows[0]?.password_hash || null;
			const hasValidPassword = isValidPasswordHash(existingPasswordHash);
			if (!hasExistingUser && !passwordHash) {
				const err = new Error('PASSWORD_REQUIRED');
				err.code = 'PASSWORD_REQUIRED';
				throw err;
			}
			if (hasExistingUser && !hasValidPassword && !passwordHash) {
				const err = new Error('PASSWORD_REQUIRED');
				err.code = 'PASSWORD_REQUIRED';
				throw err;
			}

			const userResult = await client.query(
				`INSERT INTO users (email, role_id)
				 VALUES ($1, $2)
				 ON CONFLICT (email) DO UPDATE SET role_id = EXCLUDED.role_id
				 RETURNING id, email`,
				[email, employeeRoleId],
			);
			const user = userResult.rows[0];

			// Asegura username por defecto y correo verificado para poder login con password.
			await client.query(
				`UPDATE users
				 SET username = COALESCE(username, $1),
				 	email_verified_at = COALESCE(email_verified_at, now())
				 WHERE id = $2`,
				[defaultUsername, user.id],
			);

			if (passwordHash) {
				await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, user.id]);
			}

			const employeeResult = await client.query(
				`INSERT INTO employees (user_id, full_name, phone, permissions)
				 VALUES ($1, $2, $3, $4)
				 ON CONFLICT (user_id) DO UPDATE
				 SET full_name = EXCLUDED.full_name,
				 	phone = EXCLUDED.phone,
				 	permissions = EXCLUDED.permissions
				 RETURNING id, user_id, full_name, phone, permissions`,
				[user.id, fullName, phone, permissions],
			);

			return { user, employee: employeeResult.rows[0] };
			});
		} catch (e) {
			const code = e?.code || e?.message;
			if (code === 'PASSWORD_REQUIRED') return res.status(400).json({ ok: false, error: 'PASSWORD_REQUIRED' });
			throw e;
		}

		// Nota: si el admin quiere que el empleado inicie sesión con password, ya quedó verificado.
		return res.status(200).json({ ok: true, ...created });
	});

	// Crear perfil cliente/visitante asociado a un user (1:1)
	router.post('/clients', requireRole('admin'), async (req, res) => {
		const email = normalizeEmail(req.body?.email);
		const fullName = normalizeQuery(req.body?.fullName) || null;
		const phone = normalizeQuery(req.body?.phone) || null;
		const documentId = normalizeQuery(req.body?.documentId) || null;
		if (!email || !email.includes('@')) return res.status(400).json({ ok: false, error: 'EMAIL_INVALID' });

		const clientRole = await db.query("SELECT id FROM roles WHERE name = 'client' LIMIT 1");
		const clientRoleId = clientRole.rows[0]?.id;
		if (!clientRoleId) return res.status(500).json({ ok: false, error: 'ROLES_NOT_INITIALIZED' });

		const created = await db.withTransaction(async (client) => {
			const userResult = await client.query(
				`INSERT INTO users (email, role_id)
				 VALUES ($1, $2)
				 ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email, role_id = EXCLUDED.role_id
				 RETURNING id, email`,
				[email, clientRoleId],
			);
			const user = userResult.rows[0];

			const clientResult = await client.query(
				`INSERT INTO clients (user_id, full_name, phone, document_id)
				 VALUES ($1, $2, $3, $4)
				 ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, document_id = EXCLUDED.document_id
				 RETURNING id, user_id, full_name, phone, document_id`,
				[user.id, fullName, phone, documentId],
			);

			return { user, client: clientResult.rows[0] };
		});

		return res.status(200).json({ ok: true, ...created });
	});

	// Listar empleados
	router.get('/employees', requireRole('admin'), async (req, res) => {
		const result = await db.query(
			`
				SELECT
					e.id,
					e.user_id,
					e.full_name,
					e.phone,
					e.permissions,
					u.email,
					(u.password_hash LIKE 'scrypt:%') AS has_password
				FROM employees e
				JOIN users u ON u.id = e.user_id
				ORDER BY e.id DESC
				LIMIT 200
			`,
		);
		return res.status(200).json({ ok: true, employees: result.rows });
	});

	// Dominio: deceased + burials (admin/employee)
	// Mantiene los mismos endpoints bajo /api/admin/deceased y /api/admin/burials
	router.use(buildDeceasedAdminRouter());
	router.use(buildBurialsAdminRouter());

	// Dominio: payments + reservations (admin/employee)
	// Mantiene los mismos endpoints bajo /api/admin/*
	router.use(buildPaymentsAdminRouter());
	router.use(buildReservationsAdminRouter());

	// Dominio: analytics (admin/employee)
	router.use(buildAnalyticsAdminRouter());

	// Dominio: settings (admin/employee)
	// Mantiene endpoints bajo /api/admin/*
	router.use(buildSettingsAdminRouter());

	return router;
}

module.exports = {
	buildAdminRouter,
};
