import { useEffect, useMemo, useState } from 'react'
import { api } from '../../../lib/api'
import { Card, StatCard } from '../ui'

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

function LineChart({ values }) {
	const width = 640
	const height = 180
	const pad = 14
	const nums = Array.isArray(values) ? values.map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0)) : []
	const n = nums.length
	const min = n ? Math.min(...nums) : 0
	const max = n ? Math.max(...nums) : 0
	const span = max - min
	const innerW = width - pad * 2
	const innerH = height - pad * 2

	function xAt(i) {
		if (n <= 1) return pad
		return pad + (i / (n - 1)) * innerW
	}
	function yAt(v) {
		if (n === 0) return pad + innerH / 2
		if (span === 0) return pad + innerH / 2
		const t = (v - min) / span
		return pad + (1 - t) * innerH
	}

	const path = useMemo(() => {
		if (!n) return ''
		let d = `M ${xAt(0).toFixed(2)} ${yAt(nums[0]).toFixed(2)}`
		for (let i = 1; i < n; i++) {
			d += ` L ${xAt(i).toFixed(2)} ${yAt(nums[i]).toFixed(2)}`
		}
		return d
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [n, min, max, span, values])

	return (
		<div className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] p-2">
			<svg viewBox={`0 0 ${width} ${height}`} className="h-[180px] w-full">
				<rect x="0" y="0" width={width} height={height} fill="transparent" />
				<path d={path} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
				{nums.map((v, i) => (
					<circle key={i} cx={xAt(i)} cy={yAt(v)} r={3} fill="var(--accent)" />
				))}
			</svg>
		</div>
	)
}

const ANALYTICS_METRICS = [
	{ key: 'graves_created', label: 'Tumbas registradas' },
	{ key: 'deceased_created', label: 'Difuntos registrados' },
	{ key: 'burials_created', label: 'Entierros' },
	{ key: 'reservations_created', label: 'Reservas' },
	{ key: 'payments_created', label: 'Pagos' },
	{ key: 'payments_paid', label: 'Pagos pagados' },
	{ key: 'reviews_count', label: 'Reseñas (cantidad)' },
	{ key: 'reviews_avg_rating', label: 'Reseñas (promedio)' },
]

export function AdminDashboardModule({ branches, sectors, graves, deceased, employees, reservations, payments }) {
	const branchStorageKey = 'ui.admin.dashboard.branchId'
	const [activeBranchId, setActiveBranchId] = useState(() => safeStorageGet(branchStorageKey) || '')
	const activeBranchIdN = useMemo(() => {
		const n = Number(activeBranchId)
		return Number.isFinite(n) && n > 0 ? n : null
	}, [activeBranchId])
	useEffect(() => {
		if (activeBranchId != null) safeStorageSet(branchStorageKey, String(activeBranchId))
	}, [activeBranchId])
	useEffect(() => {
		if (!Array.isArray(branches) || branches.length === 0) return
		if (activeBranchIdN == null) {
			setActiveBranchId(String(branches[0].id))
			return
		}
		const exists = branches.some((b) => Number(b.id) === Number(activeBranchIdN))
		if (!exists) setActiveBranchId(String(branches[0].id))
	}, [activeBranchIdN, branches])

	const analyticsDays = 30
	const [analyticsSeries, setAnalyticsSeries] = useState([])
	const [analyticsTotals, setAnalyticsTotals] = useState(null)
	const [analyticsLoading, setAnalyticsLoading] = useState(false)
	const [analyticsError, setAnalyticsError] = useState('')
	const [analyticsSummary, setAnalyticsSummary] = useState([])
	const [metricKey, setMetricKey] = useState('graves_created')
	const [recentReviews, setRecentReviews] = useState([])
	const [recentReviewsLoading, setRecentReviewsLoading] = useState(false)
	const [recentReviewsError, setRecentReviewsError] = useState('')

	async function loadAnalytics(branchId) {
		setAnalyticsLoading(true)
		setAnalyticsError('')
		try {
			const params = new URLSearchParams()
			params.set('branchId', String(branchId))
			params.set('days', String(analyticsDays))
			const r = await api(`/api/admin/analytics/daily?${params.toString()}`)
			if (!r.ok) {
				setAnalyticsError(r.data?.error || 'No se pudo cargar el análisis')
				setAnalyticsSeries([])
				setAnalyticsTotals(null)
				return
			}
			setAnalyticsSeries(Array.isArray(r.data?.series) ? r.data.series : [])
			setAnalyticsTotals(r.data?.totals || null)
		} finally {
			setAnalyticsLoading(false)
		}
	}

	async function loadAnalyticsSummary() {
		const params = new URLSearchParams()
		params.set('days', String(analyticsDays))
		const r = await api(`/api/admin/analytics/summary?${params.toString()}`)
		if (!r.ok) {
			setAnalyticsSummary([])
			return
		}
		setAnalyticsSummary(Array.isArray(r.data?.branches) ? r.data.branches : [])
	}

	async function loadRecentReviews(branchId) {
		setRecentReviewsLoading(true)
		setRecentReviewsError('')
		try {
			const params = new URLSearchParams()
			params.set('branchId', String(branchId))
			params.set('limit', '20')
			const r = await api(`/api/admin/branch-reviews/recent?${params.toString()}`)
			if (!r.ok) {
				setRecentReviews([])
				setRecentReviewsError(r.data?.error || 'No se pudieron cargar las reseñas')
				return
			}
			setRecentReviews(Array.isArray(r.data?.reviews) ? r.data.reviews : [])
		} finally {
			setRecentReviewsLoading(false)
		}
	}

	useEffect(() => {
		if (activeBranchIdN == null) return
		loadAnalytics(activeBranchIdN)
		loadAnalyticsSummary()
		loadRecentReviews(activeBranchIdN)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeBranchIdN])
	const gravesByStatus = useMemo(() => {
		const base = { available: 0, reserved: 0, occupied: 0, maintenance: 0 }
		for (const g of graves) {
			if (g?.status && base[g.status] != null) base[g.status] += 1
		}
		return base
	}, [graves])

	const reservationsByStatus = useMemo(() => {
		const base = { pending: 0, confirmed: 0, cancelled: 0, expired: 0 }
		for (const r of reservations) {
			if (r?.status && base[r.status] != null) base[r.status] += 1
		}
		return base
	}, [reservations])

	const paymentsByStatus = useMemo(() => {
		const base = { pending: 0, paid: 0, void: 0 }
		for (const p of payments) {
			if (p?.status && base[p.status] != null) base[p.status] += 1
		}
		return base
	}, [payments])

	const paidTotalPen = useMemo(() => {
		let cents = 0
		for (const p of payments) {
			if (p?.status === 'paid' && p?.currency === 'PEN') cents += Number(p.amount_cents || 0)
		}
		return (cents / 100).toFixed(2)
	}, [payments])

	const recentReservations = useMemo(() => reservations.slice(0, 10), [reservations])
	const recentPayments = useMemo(() => payments.slice(0, 10), [payments])

	const metric = ANALYTICS_METRICS.find((m) => m.key === metricKey) || ANALYTICS_METRICS[0]
	const metricValues = useMemo(() => analyticsSeries.map((row) => Number(row?.[metric.key] || 0)), [analyticsSeries, metric.key])
	const dateRangeLabel = useMemo(() => {
		if (!analyticsSeries.length) return null
		const first = analyticsSeries[0]?.day
		const last = analyticsSeries[analyticsSeries.length - 1]?.day
		if (!first || !last) return null
		return `${first} → ${last}`
	}, [analyticsSeries])

	return (
		<div className="space-y-3">
			<Card title="Estadísticas">
				<div className="grid gap-3 md:grid-cols-3">
					<StatCard label="Sectores" value={sectors.length} />
					<StatCard
						label="Tumbas"
						value={graves.length}
						hint={`Disponibles: ${gravesByStatus.available} · Reservadas: ${gravesByStatus.reserved} · Ocupadas: ${gravesByStatus.occupied} · Mant.: ${gravesByStatus.maintenance}`}
					/>
					<StatCard label="Difuntos" value={deceased.length} />
					<StatCard label="Empleados" value={employees.length} />
					<StatCard
						label="Reservas"
						value={reservations.length}
						hint={`Pend.: ${reservationsByStatus.pending} · Conf.: ${reservationsByStatus.confirmed} · Canc.: ${reservationsByStatus.cancelled} · Exp.: ${reservationsByStatus.expired}`}
					/>
					<StatCard
						label="Pagos"
						value={payments.length}
						hint={`Pend.: ${paymentsByStatus.pending} · Pagados: ${paymentsByStatus.paid} · Anul.: ${paymentsByStatus.void} · Total pagado PEN: ${paidTotalPen}`}
					/>
				</div>
			</Card>

			<Card title={`Análisis por sucursal (últimos ${analyticsDays} días)`}>
				<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
					<div className="flex flex-col gap-1">
						<div className="text-xs text-[color:var(--muted)]">Sucursal</div>
						{Array.isArray(branches) && branches.length > 0 ? (
							<select
								value={activeBranchId}
								onChange={(e) => setActiveBranchId(e.target.value)}
								className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm text-[color:var(--text-h)] md:w-[360px]"
								aria-label="Sucursal"
							>
								{branches.map((b) => (
									<option key={b.id} value={String(b.id)}>
										{b.name}
									</option>
								))}
							</select>
						) : (
							<div className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--text)]">
								No hay sucursales configuradas.
							</div>
						)}
					</div>

					<div className="flex items-end gap-2">
						<div className="flex flex-col gap-1">
							<div className="text-xs text-[color:var(--muted)]">Métrica</div>
							<select
								value={metricKey}
								onChange={(e) => setMetricKey(e.target.value)}
								className="rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm text-[color:var(--text-h)]"
								aria-label="Métrica"
							>
								{ANALYTICS_METRICS.map((m) => (
									<option key={m.key} value={m.key}>
										{m.label}
									</option>
								))}
							</select>
						</div>
						<button
							type="button"
							onClick={() => {
								if (activeBranchIdN == null) return
								loadAnalytics(activeBranchIdN)
								loadAnalyticsSummary()
								loadRecentReviews(activeBranchIdN)
							}}
							disabled={analyticsLoading || activeBranchIdN == null}
							className="h-[38px] rounded-md border border-[color:var(--border)] px-3 text-sm text-[color:var(--text-h)] hover:bg-[color:var(--hover)] disabled:opacity-50"
						>
							{analyticsLoading ? 'Cargando…' : 'Actualizar'}
						</button>
					</div>
				</div>

				{analyticsError ? <div className="mt-2 text-sm text-red-600">{analyticsError}</div> : null}

				<div className="mt-3 grid gap-3 md:grid-cols-4">
					<StatCard label="Tumbas" value={analyticsTotals?.graves_created ?? 0} />
					<StatCard label="Difuntos" value={analyticsTotals?.deceased_created ?? 0} hint="(con entierro en la sucursal)" />
					<StatCard label="Entierros" value={analyticsTotals?.burials_created ?? 0} />
					<StatCard label="Reservas" value={analyticsTotals?.reservations_created ?? 0} />
					<StatCard label="Pagos" value={analyticsTotals?.payments_created ?? 0} />
					<StatCard label="Pagos pagados" value={analyticsTotals?.payments_paid ?? 0} />
					<StatCard label="Reseñas" value={analyticsTotals?.reviews_count ?? 0} />
					<StatCard label="Prom. reseñas" value={Number(analyticsTotals?.reviews_avg_rating ?? 0).toFixed(2)} hint="(1–5)" />
				</div>

				<div className="mt-3">
					<div className="mb-2 flex items-center justify-between gap-2">
						<div className="text-sm font-medium text-[color:var(--text-h)]">{metric.label}</div>
						{dateRangeLabel ? <div className="text-xs text-[color:var(--muted)]">{dateRangeLabel}</div> : null}
					</div>
					{analyticsLoading ? (
						<div className="rounded-md border border-[color:var(--border)] p-3 text-sm text-[color:var(--text)]">Cargando gráfico…</div>
					) : analyticsSeries.length === 0 ? (
						<div className="rounded-md border border-[color:var(--border)] p-3 text-sm text-[color:var(--text)]">Sin datos.</div>
					) : (
						<LineChart values={metricValues} />
					)}
				</div>

				<div className="mt-3 rounded-md border border-[color:var(--border)] overflow-hidden">
					<div className="border-b border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-xs font-medium text-[color:var(--text)]">
						Reseñas recientes (comentarios)
					</div>
					{recentReviewsError ? <div className="px-3 py-3 text-sm text-red-600">{recentReviewsError}</div> : null}
					{recentReviewsLoading ? (
						<div className="px-3 py-3 text-sm text-[color:var(--text)]">Cargando…</div>
					) : recentReviews.length === 0 ? (
						<div className="px-3 py-3 text-sm text-[color:var(--text)]">Sin comentarios por ahora.</div>
					) : (
						<div className="max-h-64 overflow-auto">
							{recentReviews.map((r) => (
								<div key={r.id} className="border-b border-[color:var(--border)] px-3 py-3 text-xs last:border-b-0">
									<div className="flex items-center justify-between gap-2">
										<div className="font-medium text-[color:var(--text-h)]">{r.client_email}</div>
										<div className="text-[color:var(--muted)]">⭐ {r.rating} · {String(r.updated_at || '').slice(0, 10)}</div>
									</div>
									<div className="mt-1 text-[color:var(--text)]">{r.comment}</div>
								</div>
							))}
						</div>
					)}
				</div>
			</Card>

			<Card title={`Reporte por sucursal (últimos ${analyticsDays} días)`}>
				<div className="rounded-md border border-[color:var(--border)] overflow-hidden">
					<div className="grid grid-cols-9 gap-2 border-b border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-[11px] font-medium text-[color:var(--text)]">
						<div className="col-span-2">Sucursal</div>
						<div className="text-right">Tumbas</div>
						<div className="text-right">Difuntos</div>
						<div className="text-right">Entierros</div>
						<div className="text-right">Reservas</div>
						<div className="text-right">Pagos</div>
						<div className="text-right">Reseñas</div>
						<div className="text-right">Prom.</div>
					</div>
					{analyticsSummary.length === 0 ? (
						<div className="px-3 py-3 text-sm text-[color:var(--text)]">Sin datos.</div>
					) : (
						analyticsSummary.map((row) => (
							<div
								key={row.branch_id}
								className="grid grid-cols-9 gap-2 border-b border-[color:var(--border)] px-3 py-2 text-xs text-[color:var(--text)] last:border-b-0"
							>
								<div className="col-span-2 font-medium text-[color:var(--text-h)]">{row.branch_name}</div>
								<div className="text-right">{row.graves_created}</div>
								<div className="text-right">{row.deceased_created}</div>
								<div className="text-right">{row.burials_created}</div>
								<div className="text-right">{row.reservations_created}</div>
								<div className="text-right">{row.payments_created}</div>
								<div className="text-right">{row.reviews_count ?? 0}</div>
								<div className="text-right">{Number(row.reviews_avg_rating || 0).toFixed(2)}</div>
							</div>
						))
					)}
				</div>
				<div className="mt-2 text-xs text-[color:var(--muted)]">
					Nota: “Difuntos” cuenta difuntos creados que ya tienen entierro en esa sucursal.
				</div>
			</Card>

			<Card title="Reporte rápido">
				<div className="grid gap-3 md:grid-cols-2">
					<div className="rounded-md border border-[color:var(--border)]">
						<div className="border-b border-[color:var(--border)] px-3 py-2 text-xs font-medium text-[color:var(--text)]">
							Últimas reservas
						</div>
						<div className="max-h-64 overflow-auto">
							{recentReservations.length === 0 ? (
								<div className="p-3 text-sm text-[color:var(--text)]">Sin reservas.</div>
							) : (
								recentReservations.map((r) => (
									<div key={r.id} className="border-b border-[color:var(--border)] p-3 last:border-b-0">
										<div className="text-sm font-medium text-[color:var(--text-h)]">#{r.id} · {r.grave_code}</div>
										<div className="text-xs text-[color:var(--text)]">{r.client_email} · {r.status}</div>
									</div>
								))
							)}
						</div>
					</div>

					<div className="rounded-md border border-[color:var(--border)]">
						<div className="border-b border-[color:var(--border)] px-3 py-2 text-xs font-medium text-[color:var(--text)]">
							Últimos pagos
						</div>
						<div className="max-h-64 overflow-auto">
							{recentPayments.length === 0 ? (
								<div className="p-3 text-sm text-[color:var(--text)]">Sin pagos.</div>
							) : (
								recentPayments.map((p) => (
									<div key={p.id} className="border-b border-[color:var(--border)] p-3 last:border-b-0">
										<div className="text-sm font-medium text-[color:var(--text-h)]">
											#{p.id} · {(p.amount_cents / 100).toFixed(2)} {p.currency}
										</div>
										<div className="text-xs text-[color:var(--text)]">{p.client_email} · {p.payment_type_name} · {p.status}</div>
									</div>
								))
							)}
						</div>
					</div>
				</div>
			</Card>
		</div>
	)
}
