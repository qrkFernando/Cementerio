import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'

function formatDate(value) {
	if (!value) return '—'
	try {
		return new Date(value).toLocaleDateString()
	} catch {
		return String(value)
	}
}

function formatDateTime(value) {
	if (!value) return '—'
	try {
		return new Date(value).toLocaleString()
	} catch {
		return String(value)
	}
}

function prettyStatus(status) {
	if (!status) return '—'
	const s = String(status)
	const map = {
		pending: 'Pendiente',
		confirmed: 'Confirmada',
		cancelled: 'Cancelada',
		expired: 'Vencida',
	}
	return map[s] || s
}

function formatMoney(cents, currency = 'PEN') {
	const amount = Number(cents || 0) / 100
	try {
		return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
	} catch {
		return `${amount.toFixed(2)} ${currency}`
	}
}

export function MyReservationsView({ me, onLogin, onPayReservation, filterSeed }) {
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState('')
	const [items, setItems] = useState([])
	const [filterQ, setFilterQ] = useState('')

	useEffect(() => {
		if (!filterSeed?.ts) return
		const nextQ = typeof filterSeed.q === 'string' ? filterSeed.q : ''
		setFilterQ(nextQ)
	}, [filterSeed?.ts])

	const filteredItems = useMemo(() => {
		const raw = String(filterQ || '').trim()
		const query = raw.toLowerCase()
		if (!query) return items
		const match = raw.match(/\bRSV[-\w]+\b/i)
		const rsvCode = match ? match[0].toLowerCase() : ''
		return items.filter((r) => {
			if (rsvCode) {
				return String(r.reservation_code || '').toLowerCase().includes(rsvCode)
			}
			const haystack = [
				r.deceased_full_name,
				r.reservation_code,
				r.grave_code,
				r.sector_name,
				r.row_number,
				r.col_number,
				r.status,
			]
				.filter((v) => v != null && String(v).trim() !== '')
				.join(' ')
				.toLowerCase()
			return haystack.includes(query)
		})
	}, [items, filterQ])

	const reservationStats = useMemo(() => {
		let paid = 0
		let pendingPay = 0
		let pendingValidation = 0
		for (const r of items) {
			const price = Number(r.price_cents || 0)
			const paidCents = Number(r.paid_cents || 0)
			const pending = Number(r.pending_cents || 0)
			const due = Number(r.due_cents || 0)
			const paidDone = r.status === 'confirmed' && price > 0 && paidCents >= price
			if (paidDone) paid += 1
			else if (r.status === 'confirmed' && pending > 0) pendingValidation += 1
			else if (r.status === 'confirmed' && due > 0) pendingPay += 1
		}
		return { total: items.length, paid, pendingPay, pendingValidation }
	}, [items])

	async function refresh() {
		if (!me) return
		setLoading(true)
		setError('')
		try {
			const resv = await api('/api/client/reservations')
			if (!resv.ok) {
				setError(resv.data?.error || 'No se pudieron cargar tus reservas')
				setItems([])
			} else {
				setItems(Array.isArray(resv.data?.reservations) ? resv.data.reservations : [])
			}
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		let cancelled = false
		async function load() {
			if (!me) return
			setLoading(true)
			setError('')
			try {
				const resv = await api('/api/client/reservations')
				if (!resv.ok) {
					setError(resv.data?.error || 'No se pudieron cargar tus reservas')
					setItems([])
				}
				if (resv.ok && !cancelled) setItems(Array.isArray(resv.data?.reservations) ? resv.data.reservations : [])
			} finally {
				if (!cancelled) setLoading(false)
			}
		}
		load()
		return () => {
			cancelled = true
		}
	}, [me])

	if (!me) {
		return (
			<div className="space-y-3">
				<div className="text-sm text-[color:var(--text)]">Inicia sesión para ver tus reservas.</div>
				<button
					onClick={onLogin}
					className="rounded-md bg-[color:var(--accent)] px-3 py-2 text-sm font-medium text-[color:var(--on-accent)]"
				>
					Iniciar sesión
				</button>
			</div>
		)
	}

	return (
		<div className="client-ledger-view">
			<div className="client-ledger-head">
				<div>
					<div className="ui-kicker">Historial</div>
					<h2 className="mt-1 text-lg font-semibold text-[color:var(--text-h)]">Mis reservas</h2>
					<div className="mt-1 text-xs text-[color:var(--muted)]">Consulta el estado de tus solicitudes y pagos pendientes.</div>
				</div>
				<button
					type="button"
					onClick={refresh}
					disabled={loading}
					className="rounded-md border border-[color:var(--border)] px-3 py-2 text-sm font-semibold text-[color:var(--text-h)] hover:bg-[color:var(--hover)] disabled:opacity-50"
				>
					{loading ? 'Actualizando…' : 'Actualizar'}
				</button>
			</div>

			<div className="client-ledger-stats">
				<div><span>{reservationStats.total}</span><small>Total</small></div>
				<div><span>{reservationStats.paid}</span><small>Pagadas</small></div>
				<div><span>{reservationStats.pendingPay}</span><small>Por pagar</small></div>
				<div><span>{reservationStats.pendingValidation}</span><small>Validación</small></div>
			</div>

			<div className="client-ledger-toolbar">
				<input
					value={filterQ}
					onChange={(e) => setFilterQ(e.target.value)}
					className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm text-[color:var(--text-h)]"
					placeholder="Filtrar por código, difunto, tumba o sección"
				/>
				<div className="client-ledger-toolbar__count">{filteredItems.length} visibles</div>
			</div>

			{loading && <div className="text-sm text-[color:var(--text)]">Cargando…</div>}
			{error && <div className="text-sm text-red-600">{error}</div>}

			{!loading && !error && items.length === 0 && (
				<div className="text-sm text-[color:var(--text)]">No tienes reservas registradas.</div>
			)}

			{!loading && !error && items.length > 0 && filteredItems.length === 0 && (
				<div className="text-sm text-[color:var(--text)]">Sin resultados.</div>
			)}

			{filteredItems.length > 0 && (
				<div className="client-ledger-table overflow-x-auto">
					<table className="min-w-full text-left text-sm">
						<thead className="bg-[color:var(--surface-2)] text-xs text-[color:var(--text)]">
							<tr>
								<th className="px-3 py-2 font-medium">ID</th>
								<th className="px-3 py-2 font-medium">Código</th>
								<th className="px-3 py-2 font-medium">Tumba</th>
								<th className="px-3 py-2 font-medium">Sección</th>
								<th className="px-3 py-2 font-medium">Lugar</th>
								<th className="px-3 py-2 font-medium">Número</th>
								<th className="px-3 py-2 font-medium">Nombre</th>
								<th className="px-3 py-2 font-medium">Desde</th>
								<th className="px-3 py-2 font-medium">Hasta</th>
								<th className="px-3 py-2 font-medium">Estado</th>
								<th className="px-3 py-2 font-medium">Pendiente</th>
								<th className="px-3 py-2 font-medium">Fecha</th>
								<th className="px-3 py-2 font-medium"></th>
							</tr>
						</thead>
						<tbody>
							{filteredItems.map((r) => {
								const price = Number(r.price_cents || 0)
								const paid = Number(r.paid_cents || 0)
								const pending = Number(r.pending_cents || 0)
								const due = Number(r.due_cents || 0)
								const paidDone = r.status === 'confirmed' && price > 0 && paid >= price
								const pendingValidation = r.status === 'confirmed' && !paidDone && pending > 0
								const pendingPay = r.status === 'confirmed' && !paidDone && !pendingValidation && due > 0
								return (
									<tr key={r.id} className="border-t border-[color:var(--border)]">
										<td className="px-3 py-2 text-[color:var(--text)]">{r.id}</td>
										<td className="px-3 py-2 text-[color:var(--text)]"><span className="client-code-pill">{r.reservation_code || '—'}</span></td>
										<td className="px-3 py-2 text-[color:var(--text)]"><span className="font-semibold text-[color:var(--text-h)]">{r.grave_code || '—'}</span></td>
										<td className="px-3 py-2 text-[color:var(--text)]">{r.sector_name || '—'}</td>
										<td className="px-3 py-2 text-[color:var(--text)]">{r.row_number ?? '—'}</td>
										<td className="px-3 py-2 text-[color:var(--text)]">{r.col_number ?? '—'}</td>
										<td className="px-3 py-2 text-[color:var(--text)]">{r.deceased_full_name || '—'}</td>
										<td className="px-3 py-2 text-[color:var(--text)]">{formatDate(r.reserved_from)}</td>
										<td className="px-3 py-2 text-[color:var(--text)]">{formatDate(r.reserved_to)}</td>
										<td className="px-3 py-2 text-[color:var(--text)]">
											<span className={'client-status-chip ' + (paidDone ? 'client-status-chip--ok' : pendingPay || pendingValidation ? 'client-status-chip--warn' : '')}>
												{paidDone ? 'Pagado' : pendingValidation ? 'Pendiente validación' : pendingPay ? 'Pendiente pagar' : prettyStatus(r.status)}
											</span>
										</td>
										<td className="px-3 py-2 text-[color:var(--text)]">
											{pendingPay ? formatMoney(due, 'PEN') : pendingValidation ? formatMoney(pending, 'PEN') : '—'}
										</td>
										<td className="px-3 py-2 text-[color:var(--text)]">{formatDateTime(r.created_at)}</td>
										<td className="px-3 py-2">
											{pendingPay && r.reservation_code ? (
												<button
													onClick={() => onPayReservation?.(r.reservation_code)}
													className="rounded-md bg-[color:var(--accent)] px-3 py-2 text-xs font-semibold text-[color:var(--on-accent)]"
												>
													Pagar
												</button>
											) : null}
										</td>
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
			)}
		</div>
	)
}
