import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'

function prettyStatus(status) {
	if (!status) return '—'
	const s = String(status)
	const map = {
		available: 'Disponible',
		occupied: 'Ocupada',
		reserved: 'Reservada',
		maintenance: 'Mantenimiento',
	}
	return map[s] || s
}

function prettyReservationStatus(status) {
	if (!status) return '—'
	const s = String(status)
	const map = {
		confirmed: 'Aprobada',
		pending: 'Pendiente',
		rejected: 'Rechazada',
		cancelled: 'Anulada',
		canceled: 'Anulada',
	}
	return map[s] || s
}

function prettyPaymentStatus(status) {
	if (!status) return '—'
	const s = String(status)
	const map = {
		paid: 'Pagado',
		pending: 'Pendiente',
		void: 'Anulado',
	}
	return map[s] || s
}

function StatusPill({ children, tone = 'neutral' }) {
	const base =
		'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors '
	const toneClass =
		tone === 'accent'
			? 'border-[color:var(--accent-border)] bg-[color:var(--accent-bg)] text-[color:var(--text-h)]'
			: 'border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text)]'
	return <span className={base + toneClass}>{children}</span>
}

function recordKey(r) {
	const id = r?.id
	if (id != null) return `resv-${id}`
	if (r?.reservation_code) return `rsv-${r.reservation_code}`
	if (r?.grave_code) return `grave-${r.grave_code}`
	if (r?.deceased_full_name) return `name-${r.deceased_full_name}`
	return ''
}

export function GraveStatusView({ me, selected, onGoToMap }) {
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState('')
	const [reservations, setReservations] = useState([])
	const [payments, setPayments] = useState([])

	useEffect(() => {
		let cancelled = false
		async function load() {
			if (!me) {
				setReservations([])
				setPayments([])
				setError('')
				return
			}
			setLoading(true)
			setError('')
			try {
				const [resv, pays] = await Promise.all([api('/api/client/reservations'), api('/api/client/payments')])
				if (cancelled) return
				if (!resv.ok) {
					setError(resv.data?.error || 'No se pudieron cargar tus reservas')
					setReservations([])
					setPayments([])
					return
				}
				if (!pays.ok) {
					setError(pays.data?.error || 'No se pudieron cargar tus pagos')
					setReservations(Array.isArray(resv.data?.reservations) ? resv.data.reservations : [])
					setPayments([])
					return
				}
				setReservations(Array.isArray(resv.data?.reservations) ? resv.data.reservations : [])
				setPayments(Array.isArray(pays.data?.payments) ? pays.data.payments : [])
			} finally {
				if (!cancelled) setLoading(false)
			}
		}
		load()
		return () => {
			cancelled = true
		}
	}, [me])

	const paymentByReservationCode = useMemo(() => {
		const map = new Map()
		for (const p of payments) {
			const code = String(p?.reservation_code || '').trim()
			if (!code) continue
			const prev = map.get(code)
			// si existe un 'paid', priorizarlo
			if (!prev) map.set(code, p)
			else if (prev.status !== 'paid' && p?.status === 'paid') map.set(code, p)
		}
		return map
	}, [payments])

	const rows = useMemo(() => {
		const list = Array.isArray(reservations) ? [...reservations] : []
		// Orden simple: más recientes primero por id si existe
		list.sort((a, b) => {
			const ai = Number(a?.id)
			const bi = Number(b?.id)
			if (Number.isFinite(ai) && Number.isFinite(bi)) return bi - ai
			return 0
		})
		return list
	}, [reservations])

	if (!me) {
		return <div className="text-sm text-[color:var(--text)]">Inicia sesión para consultar el estado.</div>
	}

	if (loading) {
		return <div className="text-sm text-[color:var(--text)]">Cargando…</div>
	}

	if (error) {
		return <div className="text-sm text-red-600">{error}</div>
	}

	if (!rows.length) {
		return <div className="text-sm text-[color:var(--text)]">Aún no tienes registros.</div>
	}

	const selectedKey = selected ? recordKey(selected) : ''

	return (
		<div className="client-status-view">
			<div className="client-section-heading">
				<div>
					<div className="ui-kicker">Seguimiento</div>
					<h2 className="mt-1 text-lg font-semibold text-[color:var(--text-h)]">Estado actual</h2>
				</div>
				<div className="client-section-heading__meta">{rows.length} registros</div>
			</div>
			<div className="client-status-list">
				{rows.map((r) => {
					const key = recordKey(r)
					const isActive = selectedKey && key && selectedKey === key
					const displayName =
						r.deceased_full_name || `${r.last_name || ''} ${r.first_name || ''}`.trim() || '—'
					const reservationStatus = prettyReservationStatus(r.status)
					const graveStatus = prettyStatus(r.grave_status)
					const pay = paymentByReservationCode.get(String(r.reservation_code || '').trim())
					const payStatus = pay ? prettyPaymentStatus(pay.status) : '—'
					const hasPayment = Boolean(pay)
					const isPaid = pay?.status === 'paid'

					return (
						<div
							key={key || String(r.id || Math.random())}
							className={
								'client-status-card ' +
								(isActive ? 'client-status-card--active' : '')
							}
						>
							<div className="client-status-card__head">
								<div className="client-record-card__avatar" aria-hidden="true">
									{String(displayName || '?').slice(0, 1).toUpperCase()}
								</div>
								<div className="min-w-0">
									<div className="ui-kicker">Difunto</div>
									<div className="mt-0.5 truncate text-base font-semibold text-[color:var(--text-h)]">{displayName}</div>
									<div className="mt-1 text-xs text-[color:var(--muted)]">{r.reservation_code || 'Reserva sin código'}</div>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<StatusPill tone="accent">Reserva: {reservationStatus}</StatusPill>
									<StatusPill tone={isPaid ? 'accent' : 'neutral'}>
										Pago: {hasPayment ? payStatus : 'Sin registro'}
									</StatusPill>
								</div>
							</div>

							<div className="client-status-card__body">
								<div className="client-info-tile">
									<span>Tumba</span>
									<strong>{r.grave_code || '—'}</strong>
									<small>Estado: {graveStatus}</small>
								</div>
								<div className="client-info-tile">
									<span>Ubicación</span>
									<strong>{r.sector_name || '—'}</strong>
									<small>
										{r.row_number != null ? `Fila ${r.row_number}` : 'Fila —'}
										{r.col_number != null ? ` / Col ${r.col_number}` : ' / Col —'}
									</small>
								</div>
							</div>

							<div className="client-status-steps">
								<div className="client-status-step client-status-step--done">
									<span />
									Reserva
								</div>
								<div className={'client-status-step ' + (hasPayment ? 'client-status-step--done' : '')}>
									<span />
									Pago
								</div>
								<div className={'client-status-step ' + (String(r.grave_status || '') === 'occupied' ? 'client-status-step--done' : '')}>
									<span />
									Parcela
								</div>
							</div>

							<div className="client-status-card__footer">
								<div>
									<div className="ui-kicker">Mapa</div>
									<div className="mt-1 text-xs text-[color:var(--muted)]">Revisa la ubicación visual de esta parcela.</div>
								</div>
								<button
									type="button"
									onClick={() => onGoToMap?.()}
									className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs font-medium text-[color:var(--text-h)] hover:bg-[color:var(--hover)]"
								>
									Ver mapa
								</button>
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}
