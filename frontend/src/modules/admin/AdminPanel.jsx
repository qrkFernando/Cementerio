import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

import { SidebarButton } from './ui'

import { AdminDashboardModule } from './modules/AdminDashboardModule'
import { AdminDeceasedModule } from './modules/AdminDeceasedModule'
import { AdminEmployeesModule } from './modules/AdminEmployeesModule'
import { AdminGravesModule } from './modules/AdminGravesModule'
import { AdminPaymentsModule } from './modules/AdminPaymentsModule'
import { AdminReportsModule } from './modules/AdminReportsModule'
import { AdminReservationsModule } from './modules/AdminReservationsModule'

export function AdminPanel({ me }) {
	function safeStorageGet(key) {
		try {
			return window.localStorage.getItem(key)
		} catch {
			return null
		}
	}

	function safeStorageSet(key, value) {
		try {
			window.localStorage.setItem(key, value)
		} catch {
			// ignore
		}
	}

	const [activeModule, setActiveModule] = useState(() => safeStorageGet('ui.admin.activeModule') || 'dashboard')
	const [bootLoading, setBootLoading] = useState(true)
	const [bootError, setBootError] = useState('')
	const [lastRefreshAt, setLastRefreshAt] = useState(null)

	const [sectors, setSectors] = useState([])
	const [branches, setBranches] = useState([])
	const [graveTypes, setGraveTypes] = useState([])
	const [graves, setGraves] = useState([])
	const [employees, setEmployees] = useState([])
	const [deceased, setDeceased] = useState([])
	const [reservations, setReservations] = useState([])
	const [paymentTypes, setPaymentTypes] = useState([])
	const [payments, setPayments] = useState([])

	const perms = Array.isArray(me?.permissions) ? me.permissions : []
	const isAdmin = me?.role === 'admin'
	const canGraves = isAdmin || perms.includes('graves')
	const canDeceased = isAdmin || perms.includes('deceased')
	const canReservations = isAdmin || perms.includes('reservations')
	const canPayments = isAdmin || perms.includes('payments')
	const canReports = isAdmin || perms.includes('reports')
	const canEmployees = isAdmin

	const moduleMeta = {
		dashboard: {
			code: 'IN',
			label: 'Inicio',
			shortLabel: 'Inicio',
			description: 'Indicadores generales, actividad por sede y reportes rápidos.',
			value: graves.length + reservations.length + payments.length,
			hint: `${branches.length} sedes activas`,
		},
		graves: {
			code: 'TU',
			label: 'Tumbas',
			shortLabel: 'Tumbas',
			description: 'Sectores, parcelas, precios, ubicación y disponibilidad operativa.',
			value: graves.length,
			hint: `${sectors.length} sectores · ${graveTypes.length} tipos`,
		},
		deceased: {
			code: 'DI',
			label: 'Difuntos',
			shortLabel: 'Difuntos',
			description: 'Registro, trazabilidad y asociación de difuntos con reservas.',
			value: deceased.length,
			hint: 'Fichas registradas',
		},
		reservations: {
			code: 'RE',
			label: 'Reservas',
			shortLabel: 'Reservas',
			description: 'Solicitudes, aprobación, estados y seguimiento del cliente.',
			value: reservations.length,
			hint: `${reservations.filter((r) => r?.status === 'pending').length} pendientes`,
		},
		payments: {
			code: 'PA',
			label: 'Pagos',
			shortLabel: 'Pagos',
			description: 'Comprobantes, estados de pago y conciliación administrativa.',
			value: payments.length,
			hint: `${payments.filter((p) => p?.status === 'paid').length} pagados`,
		},
		employees: {
			code: 'EM',
			label: 'Empleados',
			shortLabel: 'Equipo',
			description: 'Usuarios internos, permisos y acceso por módulo.',
			value: employees.length,
			hint: 'Cuentas del sistema',
		},
		reports: {
			code: 'RP',
			label: 'Reportes',
			shortLabel: 'Reportes',
			description: 'Lectura ejecutiva de ingresos, reservas y operación.',
			value: reservations.length + payments.length,
			hint: 'Datos consolidados',
		},
	}

	const allowedModules = (() => {
		if (isAdmin) {
			return ['dashboard', 'graves', 'deceased', 'reservations', 'payments', 'employees', 'reports']
		}
		const list = []
		if (canGraves) list.push('graves')
		if (canDeceased) list.push('deceased')
		if (canReservations) list.push('reservations')
		if (canPayments) list.push('payments')
		if (canReports) list.push('reports')
		return list
	})()

	const activeMeta = moduleMeta[activeModule] || moduleMeta[allowedModules[0]] || moduleMeta.dashboard
	const healthItems = [
		{ label: 'Sedes', value: branches.length, hint: 'operación' },
		{ label: 'Parcelas', value: graves.length, hint: `${graves.filter((g) => g?.status === 'available').length} disponibles` },
		{ label: 'Reservas', value: reservations.length, hint: `${reservations.filter((r) => r?.status === 'confirmed').length} confirmadas` },
		{ label: 'Pagos', value: payments.length, hint: `${payments.filter((p) => p?.status === 'pending').length} pendientes` },
	]

	async function refreshAll() {
		const calls = []
		if (isAdmin || canGraves) {
			calls.push(['branches', api('/api/admin/branches')])
			calls.push(['sectors', api('/api/admin/sectors')])
			calls.push(['graveTypes', api('/api/admin/grave-types')])
			calls.push(['graves', api('/api/admin/graves')])
		}
		if (isAdmin || canEmployees) {
			calls.push(['employees', api('/api/admin/employees')])
		}
		if (isAdmin || canDeceased) {
			calls.push(['deceased', api('/api/admin/deceased')])
		}
		if (isAdmin || canReservations || canReports) {
			calls.push(['reservations', api('/api/admin/reservations')])
		}
		if (isAdmin || canPayments || canReports) {
			calls.push(['paymentTypes', api('/api/admin/payment-types')])
			calls.push(['payments', api('/api/admin/payments')])
		}

		const results = await Promise.all(calls.map((c) => c[1]))
		for (let i = 0; i < calls.length; i++) {
			const key = calls[i][0]
			const r = results[i]
			if (!r?.ok) continue
			if (key === 'sectors') setSectors(Array.isArray(r.data?.sectors) ? r.data.sectors : [])
			if (key === 'branches') setBranches(Array.isArray(r.data?.branches) ? r.data.branches : [])
			if (key === 'graveTypes') setGraveTypes(Array.isArray(r.data?.graveTypes) ? r.data.graveTypes : [])
			if (key === 'graves') setGraves(Array.isArray(r.data?.graves) ? r.data.graves : [])
			if (key === 'employees') setEmployees(Array.isArray(r.data?.employees) ? r.data.employees : [])
			if (key === 'deceased') setDeceased(Array.isArray(r.data?.deceased) ? r.data.deceased : [])
			if (key === 'reservations') setReservations(Array.isArray(r.data?.reservations) ? r.data.reservations : [])
			if (key === 'paymentTypes') setPaymentTypes(Array.isArray(r.data?.paymentTypes) ? r.data.paymentTypes : [])
			if (key === 'payments') setPayments(Array.isArray(r.data?.payments) ? r.data.payments : [])
		}

		setLastRefreshAt(new Date())
	}

	useEffect(() => {
		safeStorageSet('ui.admin.activeModule', activeModule)
	}, [activeModule])

	useEffect(() => {
		// Si el usuario no tiene permiso para el módulo activo, cae al primero permitido.
		if (!allowedModules.length) return
		if (!allowedModules.includes(activeModule)) {
			setActiveModule(allowedModules[0])
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [me?.role, me?.permissions])

	useEffect(() => {
		;(async () => {
			setBootLoading(true)
			setBootError('')
			try {
				await refreshAll()
			} catch {
				setBootError('No se pudo cargar el panel de administración')
			} finally {
				setBootLoading(false)
			}
		})()
	}, [])

	async function onManualRefresh() {
		setBootLoading(true)
		setBootError('')
		try {
			await refreshAll()
		} catch {
			setBootError('No se pudo actualizar el panel de administración')
		} finally {
			setBootLoading(false)
		}
	}

	return (
		<div className="admin-shell">
			<div className="admin-hero">
				<div className="admin-hero__content">
					<div className="ui-kicker">Panel administrativo</div>
					<h2 className="mt-2 text-2xl font-semibold text-white md:text-3xl">Centro de control</h2>
					<div className="mt-2 max-w-3xl text-sm text-white/78">
						Gestiona la operación del cementerio con módulos de seguimiento, registros, aprobaciones y reportes.
					</div>
					<div className="mt-4 flex flex-wrap gap-2">
						<span className="admin-hero__pill">{me?.email || 'Administrador'}</span>
						<span className="admin-hero__pill">{isAdmin ? 'Acceso total' : 'Acceso por permisos'}</span>
						<span className="admin-hero__pill">{lastRefreshAt ? `Actualizado ${lastRefreshAt.toLocaleTimeString()}` : 'Esperando datos'}</span>
					</div>
				</div>
				<div className="admin-hero__panel">
					<div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Módulo activo</div>
					<div className="mt-3 flex items-center gap-3">
						<div className="admin-module-badge admin-module-badge--hero">{activeMeta.code}</div>
						<div>
							<div className="text-lg font-semibold text-white">{activeMeta.label}</div>
							<div className="text-xs text-white/70">{activeMeta.hint}</div>
						</div>
					</div>
					<button
						onClick={onManualRefresh}
						disabled={bootLoading}
						className="mt-4 w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"
					>
						{bootLoading ? 'Actualizando…' : 'Actualizar datos'}
					</button>
				</div>
			</div>

			{bootLoading && <p className="mt-3 text-sm text-[color:var(--text)]">Cargando…</p>}
			{bootError && <p className="mt-3 text-sm text-red-600">{bootError}</p>}

			{!bootLoading && !bootError && (
				<div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
					<aside className="admin-sidebar">
						<div className="px-2 py-2">
							<div className="ui-kicker">Módulos</div>
							<div className="mt-1 text-sm font-semibold text-[color:var(--text-h)]">Navegación operativa</div>
						</div>
						<div className="space-y-1">
							{(isAdmin ? true : false) && (
								<SidebarButton active={activeModule === 'dashboard'} onClick={() => setActiveModule('dashboard')}>
									<span className="admin-sidebar-button__code">IN</span>
									<span>Inicio</span>
									<span className="admin-sidebar-button__metric">{moduleMeta.dashboard.value}</span>
								</SidebarButton>
							)}
							{canGraves && (
								<SidebarButton active={activeModule === 'graves'} onClick={() => setActiveModule('graves')}>
									<span className="admin-sidebar-button__code">TU</span>
									<span>Tumbas</span>
									<span className="admin-sidebar-button__metric">{moduleMeta.graves.value}</span>
								</SidebarButton>
							)}
							{canDeceased && (
								<SidebarButton active={activeModule === 'deceased'} onClick={() => setActiveModule('deceased')}>
									<span className="admin-sidebar-button__code">DI</span>
									<span>Difuntos</span>
									<span className="admin-sidebar-button__metric">{moduleMeta.deceased.value}</span>
								</SidebarButton>
							)}
							{canReservations && (
								<SidebarButton active={activeModule === 'reservations'} onClick={() => setActiveModule('reservations')}>
									<span className="admin-sidebar-button__code">RE</span>
									<span>Reservas</span>
									<span className="admin-sidebar-button__metric">{moduleMeta.reservations.value}</span>
								</SidebarButton>
							)}
							{canPayments && (
								<SidebarButton active={activeModule === 'payments'} onClick={() => setActiveModule('payments')}>
									<span className="admin-sidebar-button__code">PA</span>
									<span>Pagos</span>
									<span className="admin-sidebar-button__metric">{moduleMeta.payments.value}</span>
								</SidebarButton>
							)}
							{canEmployees && (
								<SidebarButton active={activeModule === 'employees'} onClick={() => setActiveModule('employees')}>
									<span className="admin-sidebar-button__code">EM</span>
									<span>Equipo</span>
									<span className="admin-sidebar-button__metric">{moduleMeta.employees.value}</span>
								</SidebarButton>
							)}
							{canReports && (
								<SidebarButton active={activeModule === 'reports'} onClick={() => setActiveModule('reports')}>
									<span className="admin-sidebar-button__code">RP</span>
									<span>Reportes</span>
									<span className="admin-sidebar-button__metric">{moduleMeta.reports.value}</span>
								</SidebarButton>
							)}
						</div>
						<div className="mt-4 grid gap-2">
							{healthItems.map((item) => (
								<div key={item.label} className="admin-sidebar-mini">
									<div>
										<div className="text-xs text-[color:var(--muted)]">{item.label}</div>
										<div className="text-[11px] text-[color:var(--text)]">{item.hint}</div>
									</div>
									<div className="text-lg font-semibold text-[color:var(--text-h)]">{item.value}</div>
								</div>
							))}
						</div>
					</aside>

					<section className="admin-module-stage">
						<div className="admin-module-header">
							<div className="flex items-center gap-3">
								<div className="admin-module-badge">{activeMeta.code}</div>
								<div>
									<div className="text-xl font-semibold text-[color:var(--text-h)]">{activeMeta.label}</div>
									<div className="mt-1 text-sm text-[color:var(--text)]">{activeMeta.description}</div>
								</div>
							</div>
							<div className="admin-module-header__metric">
								<div className="text-xs text-[color:var(--muted)]">Registros</div>
								<div className="text-2xl font-semibold text-[color:var(--text-h)]">{activeMeta.value}</div>
							</div>
						</div>
						<div className="mt-4">
						{activeModule === 'dashboard' && isAdmin && (
							<AdminDashboardModule
								branches={branches}
								sectors={sectors}
								graves={graves}
								deceased={deceased}
								employees={employees}
								reservations={reservations}
								payments={payments}
							/>
						)}

						{activeModule === 'graves' && canGraves && (
							<AdminGravesModule branches={branches} sectors={sectors} graveTypes={graveTypes} graves={graves} onRefresh={refreshAll} />
						)}

						{activeModule === 'deceased' && canDeceased && (
							<AdminDeceasedModule deceased={deceased} reservations={reservations} graves={graves} onRefresh={refreshAll} />
						)}

						{activeModule === 'reservations' && canReservations && (
							<AdminReservationsModule reservations={reservations} graves={graves} onRefresh={refreshAll} />
						)}

						{activeModule === 'payments' && canPayments && (
							<AdminPaymentsModule payments={payments} paymentTypes={paymentTypes} onRefresh={refreshAll} />
						)}

						{activeModule === 'employees' && canEmployees && (
							<AdminEmployeesModule employees={employees} onRefresh={refreshAll} />
						)}

						{activeModule === 'reports' && canReports && (
							<AdminReportsModule reservations={reservations} payments={payments} onRefresh={refreshAll} />
						)}

						{!isAdmin && allowedModules.length === 0 && (
							<div className="rounded-md border border-[color:var(--border)] p-3 text-sm text-[color:var(--text)]">
								No tienes permisos asignados. Pídele a un administrador que te habilite módulos.
							</div>
						)}
						</div>
					</section>
				</div>
			)}
		</div>
	)
}
