import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import graveCardImg from '../../assets/tumba_disponible.webp'
import mausoleoImg from '../../assets/mausoleo_gotico.webp'
import { Panel } from '../layout/Panel'
import { Cemetery3DView } from '../client/Cemetery3DView'

function makeStableSeed(input) {
	const s = String(input ?? '')
	let h = 2166136261
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i)
		h = Math.imul(h, 16777619)
	}
	return h >>> 0
}

function stable01(seed) {
	let x = seed >>> 0
	x = (Math.imul(1664525, x) + 1013904223) >>> 0
	return x / 2 ** 32
}

function formatMoney(cents, currency = 'PEN') {
	const amount = Number(cents || 0) / 100
	try {
		return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
	} catch {
		return `${amount.toFixed(2)} ${currency}`
	}
}

function starsFor(value) {
	const v = Number(value)
	const n = Number.isFinite(v) ? Math.max(0, Math.min(5, Math.round(v))) : 0
	return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n)
}

function FeaturedCemeteriesPanel({ branches, loading, error }) {
	const list = Array.isArray(branches) ? branches : []
	return (
		<div className="ui-card rounded-md p-4 text-left">
			<div className="flex items-center justify-between gap-2">
				<div>
					<div className="text-sm font-semibold text-[color:var(--text-h)]">Sedes registradas</div>
					<div className="mt-0.5 text-xs text-[color:var(--muted)]">Calificación (1–5) y comentarios por sede</div>
				</div>
				<div className="rounded-full border border-[color:var(--accent-border)] bg-[color:var(--accent-bg)] px-3 py-1 text-xs font-semibold text-[color:var(--text-h)]">
					Encuesta
				</div>
			</div>

			{error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
			{loading ? <div className="mt-3 text-sm text-[color:var(--text)]">Cargando sedes…</div> : null}
			{!loading && !error && list.length === 0 ? (
				<div className="mt-3 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-3 text-sm text-[color:var(--text)]">
					No hay sedes registradas.
				</div>
			) : null}

			{!loading && list.length > 0 ? (
				<div className="mt-3 max-h-[320px] space-y-3 overflow-auto pr-1">
					{list.map((b) => {
						const avg = Number(b.avg_rating || 0)
						const count = Number(b.reviews_count || 0)
						const comments = Array.isArray(b.recent_comments) ? b.recent_comments : []
						return (
							<div key={b.id} className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-2)] p-3">
								<div className="flex items-start justify-between gap-2">
									<div className="text-sm font-semibold text-[color:var(--text-h)]">{b.name}</div>
									<div className="text-right text-xs text-[color:var(--muted)]">{count} reseñas</div>
								</div>
								<div className="mt-1 text-xs text-[color:var(--text)]">
									<span className="font-semibold text-[color:var(--text-h)]">Calificación:</span>{' '}
									<span className="font-semibold text-[color:var(--text-h)]">{starsFor(avg)}</span>{' '}
									<span className="text-[color:var(--muted)]">({avg ? avg.toFixed(2) : '0.00'} / 5)</span>
								</div>

								{comments.length > 0 ? (
									<div className="mt-2 space-y-2">
										<div className="text-[11px] font-semibold tracking-wide text-[color:var(--muted)]">COMENTARIOS RECIENTES</div>
										{comments.slice(0, 2).map((c, idx) => (
											<div key={idx} className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs text-[color:var(--text)]">
												<div className="flex items-center justify-between gap-2">
													<div className="font-medium text-[color:var(--text-h)]">⭐ {c?.rating ?? '—'}</div>
													<div className="text-[11px] text-[color:var(--muted)]">{String(c?.updated_at || '').slice(0, 10)}</div>
												</div>
												<div className="mt-1">{c?.comment}</div>
											</div>
										))}
									</div>
								) : (
									<div className="mt-2 text-xs text-[color:var(--muted)]">Aún no hay comentarios para esta sede.</div>
								)}
							</div>
						)
					})}
				</div>
			) : null}
		</div>
	)
}

function StarRatingInput({ value, onChange, disabled }) {
	const v = Number(value)
	const current = Number.isFinite(v) ? Math.max(1, Math.min(5, Math.trunc(v))) : 5
	return (
		<div className="flex flex-wrap gap-2">
			{[1, 2, 3, 4, 5].map((n) => {
				const active = n <= current
				return (
					<button
						key={n}
						type="button"
						disabled={disabled}
						onClick={() => onChange?.(n)}
						className={
							'rounded-full border px-3 py-1 text-xs font-semibold transition ' +
							(active
								? 'border-[color:var(--accent-border)] bg-[color:var(--accent-bg)] text-[color:var(--text-h)]'
								: 'border-[color:var(--border)] bg-transparent text-[color:var(--muted)] hover:bg-[color:var(--surface-2)]')
						}
					>
						{n} ★
					</button>
				)
			})}
		</div>
	)
}

export function HomeView({
	me,
	onLogin,
	onGoToMyReservations,
	onGoToSearch,
	onGoToGraveStatus,
	onGoToPayments,
	onPayReservation: _onPayReservation,
}) {
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

	const branchStorageKey = 'ui.client.branchId'
	const [branches, setBranches] = useState([])
	const [branchesLoading, setBranchesLoading] = useState(false)
	const [branchesError, setBranchesError] = useState('')
	const [branchesSummaryError, setBranchesSummaryError] = useState('')
	const [activeBranchId, setActiveBranchId] = useState(() => safeStorageGet(branchStorageKey) || '')
	const activeBranchIdN = useMemo(() => {
		const n = Number(activeBranchId)
		return Number.isFinite(n) && n > 0 ? n : null
	}, [activeBranchId])
	useEffect(() => {
		if (activeBranchId != null) safeStorageSet(branchStorageKey, String(activeBranchId))
	}, [activeBranchId])

	const [available, setAvailable] = useState([])
	const [loading, setLoading] = useState(false)
	const [msg, setMsg] = useState('')
	const [error, setError] = useState('')
	const [lastReservation, setLastReservation] = useState(null)

	function formatReservationStatus(s) {
		const v = String(s || '').toLowerCase()
		if (v === 'confirmed') return 'Confirmada'
		if (v === 'pending') return 'Pendiente'
		if (!v) return 'Pendiente'
		return v
	}

	const [creatingId, setCreatingId] = useState(null)
	const [reserveOpen, setReserveOpen] = useState(false)
	const [reserveStep, setReserveStep] = useState(1)
	const [reserveCreated, setReserveCreated] = useState(false)

	const [reviewBranchId, setReviewBranchId] = useState(null)
	const [reviewBranchName, setReviewBranchName] = useState('')
	const [reviewExisting, setReviewExisting] = useState(null)
	const [reviewLoading, setReviewLoading] = useState(false)
	const [reviewSaving, setReviewSaving] = useState(false)
	const [reviewError, setReviewError] = useState('')
	const [reviewRating, setReviewRating] = useState(5)
	const [reviewComment, setReviewComment] = useState('')
	const [reviewSaved, setReviewSaved] = useState(false)

	const [mapSectors, setMapSectors] = useState([])
	const [mapSectorId, setMapSectorId] = useState(null)
	const [mapGraves, setMapGraves] = useState([])
	const [mapLoading, setMapLoading] = useState(false)
	const [mapError, setMapError] = useState('')

	const [deceasedFirstName, setDeceasedFirstName] = useState('')
	const [deceasedLastName, setDeceasedLastName] = useState('')
	const [reservedFrom, setReservedFrom] = useState('')
	const [reservedTo, setReservedTo] = useState('')
	const [reserveFormError, setReserveFormError] = useState('')
	const [selectedGraveId, setSelectedGraveId] = useState(null)
	const [selectedGraveTypeId, setSelectedGraveTypeId] = useState(null)

	const selectedGrave = useMemo(() => {
		if (!selectedGraveId) return null
		return mapGraves.find((g) => g.id === selectedGraveId) || null
	}, [mapGraves, selectedGraveId])

	const home3dMarkers = useMemo(() => {
		const src = Array.isArray(available) && available.length ? available : Array.isArray(mapGraves) ? mapGraves : []
		const list = src.slice(0, 14)
		const rows = list.map((g) => Number(g?.row_number)).filter((n) => Number.isFinite(n))
		const cols = list.map((g) => Number(g?.col_number)).filter((n) => Number.isFinite(n))
		const rowMax = rows.length ? Math.max(...rows) : 0
		const colMax = cols.length ? Math.max(...cols) : 0

		return list.map((g, i) => {
			const code = String(g?.code || g?.grave_code || g?.id || i)
			const id = `grave-${code}`
			const seed = makeStableSeed(id)

			const r = Number(g?.row_number)
			const c = Number(g?.col_number)
			let x = 10 + stable01(seed) * 80
			let y = 18 + stable01(seed ^ 0x9e3779b9) * 70
			if (Number.isFinite(r) && Number.isFinite(c) && rowMax > 1 && colMax > 1) {
				x = 10 + ((c - 1) / (colMax - 1)) * 80
				y = 18 + ((r - 1) / (rowMax - 1)) * 70
			}

			const hue = Math.floor(stable01(seed ^ 0x7f4a7c15) * 140) // rango más cercano a verde
			return {
				id,
				record: {
					grave_code: g?.code || g?.grave_code || '',
					sector_name: g?.sector_name || '',
					row_number: g?.row_number,
					col_number: g?.col_number,
					branch_name: g?.branch_name || '',
					status: g?.status || g?.grave_status || '',
				},
				x,
				y,
				hue,
			}
		})
	}, [available, mapGraves])

	function getSectorShortName(name) {
		const s = String(name || '').trim()
		if (!s) return '—'
		return s.length <= 2 ? s : s.slice(0, 2)
	}

	function computeCellState(g) {
		if (!g) return 'maintenance'
		if (g.has_burial || g.grave_status === 'occupied') return 'occupied'
		if (g.active_reservation_status === 'confirmed' || g.grave_status === 'reserved') return 'confirmed'
		if (g.active_reservation_status === 'pending') return 'pending'
		if (g.grave_status === 'maintenance' || g.is_enabled === false) return 'maintenance'
		return 'available'
	}

	function getTypeSubtitle(name) {
		const n = String(name || '')
			.trim()
			.toLowerCase()
			.normalize('NFD')
			.replace(/\p{Diacritic}/gu, '')
		if (!n) return ''
		if (n.includes('estandar') || n.includes('estándar')) return 'Individual · Mantenimiento básico'
		if (n.includes('premium')) return 'Individual · Jardín + flores mensuales'
		if (n.includes('familiar')) return 'Hasta 4 personas · Mausoleo'
		if (n.includes('columbario')) return 'Nicho para urnas · Cremación'
		return ''
	}

	const typeCards = useMemo(() => {
		// Agrupa tipos existentes en el sector, usando precio mínimo disponible por tipo
		const byId = new Map()
		for (const g of mapGraves) {
			const typeId = g?.grave_type_id
			if (typeId == null) continue
			const key = String(typeId)
			const state = computeCellState(g)
			const isAvailable = state === 'available'
			const price = Number(g?.price_cents ?? 0)
			const prev = byId.get(key)
			if (!prev) {
				byId.set(key, {
					id: key,
					name: g?.grave_type_name || '—',
					minAvailablePriceCents: isAvailable ? (Number.isFinite(price) ? price : null) : null,
					availableCount: isAvailable ? 1 : 0,
				})
				continue
			}
			prev.availableCount += isAvailable ? 1 : 0
			if (isAvailable && Number.isFinite(price)) {
				if (prev.minAvailablePriceCents == null || price < prev.minAvailablePriceCents) {
					prev.minAvailablePriceCents = price
				}
			}
		}
		return Array.from(byId.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)))
	}, [mapGraves])

	const mapCols = useMemo(() => {
		const cols = mapGraves.map((g) => g.col_number).filter((n) => Number.isFinite(n))
		const max = cols.length ? Math.max(...cols) : 0
		return Math.max(max, 0)
	}, [mapGraves])

	function displayCellNumber(g) {
		const r = Number(g?.row_number)
		const c = Number(g?.col_number)
		if (!Number.isFinite(r) || !Number.isFinite(c) || !Number.isFinite(mapCols) || mapCols <= 0) return ''
		return String((r - 1) * mapCols + c)
	}

	async function loadBranches() {
		setBranchesLoading(true)
		setBranchesError('')
		setBranchesSummaryError('')
		try {
			const result = await api('/api/client/branches')
			if (!result.ok) {
				setBranchesError(result.data?.error || 'No se pudieron cargar las sucursales')
				setBranches([])
				return
			}
			const baseList = Array.isArray(result.data?.branches) ? result.data.branches : []
			let list = baseList
			try {
				const summary = await api('/api/client/branches/summary')
				if (summary.ok) {
					const summaryList = Array.isArray(summary.data?.branches) ? summary.data.branches : []
					const byId = new Map(summaryList.map((b) => [String(b.id), b]))
					list = baseList.map((b) => ({ ...b, ...(byId.get(String(b.id)) || null) }))
				} else {
					setBranchesSummaryError(summary.data?.error || 'No se pudo cargar el resumen de reseñas')
				}
			} catch {
				setBranchesSummaryError('No se pudo cargar el resumen de reseñas')
			}
			setBranches(list)
			if (activeBranchIdN == null && list.length > 0) {
				setActiveBranchId(String(list[0].id))
			}
		} finally {
			setBranchesLoading(false)
		}
	}

	async function loadAvailable(branchIdOverride) {
		setLoading(true)
		setError('')
		try {
			const branchId = branchIdOverride != null ? Number(branchIdOverride) : activeBranchIdN
			const params = new URLSearchParams()
			if (branchId != null) params.set('branchId', String(branchId))
			const qs = params.toString() ? `?${params.toString()}` : ''
			const result = await api(`/api/client/available-graves${qs}`)
			if (!result.ok) {
				setError(result.data?.error || 'No se pudieron cargar las tumbas disponibles')
				setAvailable([])
				return
			}
			setAvailable(Array.isArray(result.data?.graves) ? result.data.graves : [])
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		loadBranches()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	useEffect(() => {
		// Al cambiar de sucursal, recarga listado + mapa (y resetea selección)
		setSelectedGraveId(null)
		setSelectedGraveTypeId(null)
		setMapSectorId(null)
		loadAvailable(activeBranchIdN)
		loadGraveMap(null, activeBranchIdN)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeBranchIdN])

	async function loadGraveMap(nextSectorId, branchIdOverride) {
		setMapLoading(true)
		setMapError('')
		try {
			const branchId = branchIdOverride != null ? Number(branchIdOverride) : activeBranchIdN
			const params = new URLSearchParams()
			if (nextSectorId) params.set('sectorId', String(nextSectorId))
			if (branchId != null) params.set('branchId', String(branchId))
			const qs = params.toString() ? `?${params.toString()}` : ''
			const result = await api(`/api/client/grave-map${qs}`)
			if (!result.ok) {
				setMapError(result.data?.error || 'No se pudo cargar el mapa de tumbas')
				setMapSectors([])
				setMapSectorId(null)
				setMapGraves([])
				return
			}
			const sectors = Array.isArray(result.data?.sectors) ? result.data.sectors : []
			const sectorId = result.data?.sectorId ?? null
			const graves = Array.isArray(result.data?.graves) ? result.data.graves : []
			setMapSectors(sectors)
			setMapSectorId(sectorId)
			setMapGraves(graves)
		} finally {
			setMapLoading(false)
		}
	}

	async function openReserveModal(prefillGrave) {
		setMsg('')
		setError('')
		setReserveFormError('')
		setReserveStep(1)
		setReserveCreated(false)
		setReviewBranchId(null)
		setReviewBranchName('')
		setReviewExisting(null)
		setReviewError('')
		setReviewRating(5)
		setReviewComment('')
		setReviewSaved(false)
		setReserveOpen(true)
		const prefillBranchId = prefillGrave?.branch_id != null ? Number(prefillGrave.branch_id) : null
		if (prefillBranchId != null && prefillBranchId !== activeBranchIdN) {
			setActiveBranchId(String(prefillBranchId))
		}
		setSelectedGraveId(prefillGrave?.id ?? null)
		setSelectedGraveTypeId(null)

		const prefillSectorId = prefillGrave?.sector_id != null ? Number(prefillGrave.sector_id) : null
		await loadGraveMap(prefillSectorId ?? mapSectorId, prefillBranchId ?? activeBranchIdN)
	}

	const canReserve = useMemo(() => {
		const full = `${String(deceasedFirstName || '').trim()} ${String(deceasedLastName || '').trim()}`.trim()
		return !!selectedGraveId && !!full && creatingId == null && !reserveCreated
	}, [creatingId, deceasedFirstName, deceasedLastName, reserveCreated, selectedGraveId])

	const confirmHint = useMemo(() => {
		if (creatingId != null) return ''
		if (reserveCreated) return 'La reserva ya fue creada. Puedes dejar una reseña o finalizar.'
		if (!me) return 'Inicia sesión para confirmar la reserva.'
		const full = `${String(deceasedFirstName || '').trim()} ${String(deceasedLastName || '').trim()}`.trim()
		if (!full) return 'Completa nombre y apellido del difunto.'
		if (!selectedGraveId) return 'Selecciona una parcela disponible en el mapa.'
		return ''
	}, [creatingId, deceasedFirstName, deceasedLastName, me, reserveCreated, selectedGraveId])

	function getBranchName(branchId) {
		const n = Number(branchId)
		if (!Number.isFinite(n) || n <= 0) return ''
		const found = Array.isArray(branches) ? branches.find((b) => Number(b.id) === n) : null
		return found?.name || ''
	}

	async function loadMyReview(branchId) {
		setReviewLoading(true)
		setReviewError('')
		setReviewSaved(false)
		try {
			if (!me) {
				setReviewExisting(null)
				setReviewRating(5)
				setReviewComment('')
				return
			}
			const r = await api(`/api/client/branches/${branchId}/review`)
			if (!r.ok) {
				setReviewExisting(null)
				setReviewError(r.data?.error || 'No se pudo cargar tu reseña')
				return
			}
			const review = r.data?.review || null
			setReviewExisting(review)
			setReviewRating(review?.rating ?? 5)
			setReviewComment(review?.comment ?? '')
		} finally {
			setReviewLoading(false)
		}
	}

	async function saveMyReview() {
		const branchId = reviewBranchId
		if (branchId == null) return
		setReviewSaving(true)
		setReviewError('')
		setReviewSaved(false)
		try {
			const r = await api(`/api/client/branches/${branchId}/review`, {
				method: 'PUT',
				body: JSON.stringify({
					rating: reviewRating,
					comment: reviewComment,
				}),
			})
			if (!r.ok) {
				setReviewError(r.data?.error || 'No se pudo guardar la reseña')
				return
			}
			setReviewExisting(r.data?.review || null)
			setReviewSaved(true)
			// refresca el panel de sedes
			loadBranches()
		} finally {
			setReviewSaving(false)
		}
	}

	async function finishReserveFlow() {
		setReserveOpen(false)
		setReserveStep(1)
		setReserveCreated(false)
		setReserveFormError('')
		setError('')
		setSelectedGraveId(null)
		setSelectedGraveTypeId(null)
		setReviewBranchId(null)
		setReviewBranchName('')
		setReviewExisting(null)
		setReviewError('')
		setReviewSaved(false)
		try {
			await loadAvailable(activeBranchIdN)
			await loadGraveMap(mapSectorId, activeBranchIdN)
		} catch {
			// ignore
		}
	}

	async function submitReserve(e) {
		e?.preventDefault?.()
		setMsg('')
		setError('')
		setReserveFormError('')

		if (!me) {
			setReserveFormError('Inicia sesión para reservar.')
			onLogin?.()
			return
		}

		if (!selectedGraveId) {
			setReserveFormError('Selecciona una parcela en el mapa')
			setReserveStep(2)
			return
		}

		const deceasedFullName = `${String(deceasedFirstName || '').trim()} ${String(deceasedLastName || '').trim()}`.trim()
		if (!deceasedFullName) {
			setReserveFormError('Ingresa el nombre y apellido del difunto')
			setReserveStep(1)
			return
		}

		if (reservedFrom && reservedTo) {
			try {
				if (new Date(reservedFrom).getTime() > new Date(reservedTo).getTime()) {
					setReserveFormError('La fecha “Desde” no puede ser mayor que “Hasta”')
					return
				}
			} catch {
				// ignoramos parse errors y dejamos que backend valide si hace falta
			}
		}

		const snapshot = {
			grave: selectedGrave
				? {
					id: selectedGrave.id,
					code: selectedGrave.code,
					branch_name: selectedGrave.branch_name,
					sector_name: selectedGrave.sector_name,
					row_number: selectedGrave.row_number,
					col_number: selectedGrave.col_number,
					price_cents: selectedGrave.price_cents,
				}
				: null,
			deceasedFullName: deceasedFullName,
			reservedFrom: reservedFrom || null,
			reservedTo: reservedTo || null,
		}

		setCreatingId(selectedGraveId)
		try {
			const result = await api('/api/client/reservations', {
				method: 'POST',
				body: JSON.stringify({
					graveId: selectedGraveId,
					deceasedFullName,
					reservedFrom: reservedFrom || null,
					reservedTo: reservedTo || null,
				}),
			})
			if (!result.ok) {
				setError(result.data?.error || 'No se pudo crear la reserva')
				return
			}

			const code = result.data?.reservation?.reservation_code
			setLastReservation({
				code: code || null,
				status: result.data?.reservation?.status || 'pending',
				grave: snapshot.grave,
				deceasedFullName: snapshot.deceasedFullName,
				reservedFrom: snapshot.reservedFrom,
				reservedTo: snapshot.reservedTo,
			})
			setMsg(code ? `Reserva creada (${code}) — queda pendiente de aprobación.` : 'Reserva creada — queda pendiente de aprobación.')
			try {
				// Te manda al inicio para que veas el resumen de la reserva.
				window.scrollTo({ top: 0, behavior: 'smooth' })
			} catch {
				// ignore
			}
			setReserveCreated(true)
			const branchId = selectedGrave?.branch_id != null ? Number(selectedGrave.branch_id) : activeBranchIdN
			if (branchId != null) {
				setReviewBranchId(branchId)
				setReviewBranchName(selectedGrave?.branch_name || getBranchName(branchId) || '')
				await loadMyReview(branchId)
				setReserveStep(4)
			}
		} finally {
			setCreatingId(null)
		}
	}

	return (
		<div className="space-y-6">
			{/* Cabecera (separada del Navbar) */}
			<header
				className="theme-dark -mx-3 overflow-hidden border-b border-[color:var(--border)] sm:-mx-4 lg:-mx-6"
				style={{ background: 'var(--nav-gradient)' }}
			>
				<div className="relative">
					<img
						src={mausoleoImg}
						alt=""
						className="h-[44svh] w-full object-cover opacity-30 md:h-[52svh] lg:h-[58svh]"
						loading="lazy"
					/>
					<div className="absolute inset-0 bg-black/35" aria-hidden="true" />

					<div className="relative px-3 py-8 sm:px-4 lg:px-6">
						<div className="grid gap-4 md:grid-cols-[1fr_380px] md:items-center">
							<div>
								<div className="text-[11px] tracking-[0.18em] uppercase text-white/80">Inicio</div>
								<div className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--text-h)] md:text-3xl">
									Reserva y seguimiento
								</div>
								<div className="mt-2 text-sm text-[color:var(--text)]">
									Reserva una tumba, busca un difunto, revisa el estado de la parcela y gestiona tus reservas y pagos.
								</div>
							</div>

							{reserveStep === 4 ? (
								<div className="space-y-3">
									<div className="ui-card ui-card--tight">
										<div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--text-h)]">
											<span className="inline-block h-2 w-2 rounded-full bg-[color:var(--accent)]" />
											Reseña de la sede
										</div>
										<div className="mt-2 text-xs text-[color:var(--muted)]">
											{reviewBranchName ? (
												<>
													Sede: <span className="font-semibold text-[color:var(--text-h)]">{reviewBranchName}</span>
												</>
											) : (
												'Califica la sede donde acabas de reservar.'
											)}
										</div>
										{reviewLoading ? <div className="mt-3 text-sm text-[color:var(--text)]">Cargando tu reseña…</div> : null}
										{reviewExisting ? (
											<div className="mt-3 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-[color:var(--text)]">
												Ya tienes una reseña guardada. Si deseas, actualízala y vuelve a guardar.
											</div>
										) : null}
										{reviewError ? <div className="mt-3 text-sm text-red-600">{reviewError}</div> : null}
										{reviewSaved ? (
											<div className="mt-3 rounded-md border border-[color:var(--accent-border)] bg-[color:var(--accent-bg)] px-3 py-2 text-xs font-medium text-[color:var(--text-h)]">
												Reseña guardada.
											</div>
										) : null}

										<div className="mt-3">
											<div className="text-xs text-[color:var(--muted)]">Calificación (1–5)</div>
											<div className="mt-2">
												<StarRatingInput value={reviewRating} onChange={setReviewRating} disabled={reviewLoading || reviewSaving} />
											</div>
										</div>

										<div className="mt-3">
											<label className="block text-xs text-[color:var(--text)]">Comentario (opcional)</label>
											<textarea
												value={reviewComment}
												onChange={(e) => setReviewComment(e.target.value)}
												rows={4}
												placeholder="Cuéntanos cómo fue tu experiencia…"
												className="mt-1 w-full resize-none rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm text-[color:var(--text-h)]"
												disabled={reviewLoading || reviewSaving}
											/>
										</div>

										<div className="mt-3 flex flex-col gap-2 sm:flex-row">
											<button
												type="button"
												onClick={() => void saveMyReview()}
												disabled={reviewLoading || reviewSaving || reviewBranchId == null}
												className="w-full rounded-md bg-[color:var(--accent)] px-3 py-2.5 text-sm font-semibold text-[color:var(--on-accent)] disabled:opacity-50"
											>
												{reviewSaving ? 'Guardando…' : 'Guardar reseña'}
											</button>
											<button
												type="button"
												onClick={() => void finishReserveFlow()}
												className="w-full rounded-md border border-[color:var(--border)] px-3 py-2.5 text-sm font-medium text-[color:var(--text-h)] hover:bg-[color:var(--hover)]"
											>
												Finalizar
											</button>
										</div>
										<div className="mt-2 text-xs text-[color:var(--muted)]">
											Si prefieres, puedes omitir la reseña y finalizar.
										</div>
									</div>
								</div>
							) : (
								<div className="space-y-3">
									<div className="rounded-xl border border-white/15 bg-white/10 p-4 text-left text-white backdrop-blur">
										<div className="flex flex-wrap items-center justify-between gap-2">
											<div className="text-sm font-semibold">Accesos rápidos</div>
											<div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
												{loading ? '—' : `${available.length} disponibles`}
											</div>
										</div>
										<div className="mt-3 grid gap-2 sm:grid-cols-2">
											<button
												type="button"
												onClick={() => openReserveModal(null)}
												className="h-10 rounded-md bg-[color:var(--accent)] px-3 text-sm font-semibold text-[color:var(--on-accent)] ring-1 ring-[color:var(--accent-border)] shadow-[var(--shadow)]"
											>
												Reservar tumba
											</button>
											<button
												type="button"
												onClick={() => (me ? onGoToMyReservations?.() : onLogin?.())}
												className="h-10 rounded-md border border-white/20 bg-white/10 px-3 text-sm font-medium text-white hover:bg-white/15"
											>
												{me ? 'Ver mis reservas' : 'Iniciar sesión'}
											</button>
										</div>
										{lastReservation?.code ? (
											<div className="mt-3 text-xs text-white/80">
												Última reserva: <span className="font-semibold text-white">{lastReservation.code}</span> · {formatReservationStatus(lastReservation.status)}
											</div>
										) : null}
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			</header>

			{/* Accesos rápidos (separado de la cabecera) */}
			<div className="ui-card rounded-md p-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div>
						<div className="ui-kicker">Accesos</div>
						<div className="mt-0.5 text-sm font-semibold text-[color:var(--text-h)]">Acciones rápidas</div>
					</div>
					<div className="text-xs text-[color:var(--muted)]">{loading ? '—' : `${available.length} tumbas disponibles`}</div>
				</div>
				<div className="mt-3 flex flex-wrap gap-2">
					<button
						type="button"
						onClick={() => onGoToSearch?.()}
						className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-h)] hover:bg-[color:var(--hover)]"
					>
						Buscar difunto
					</button>
					<button
						type="button"
						onClick={() => onGoToGraveStatus?.()}
						className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-h)] hover:bg-[color:var(--hover)]"
					>
						Ver estado
					</button>
					<button
						type="button"
						onClick={() => onGoToMyReservations?.()}
						className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-h)] hover:bg-[color:var(--hover)]"
					>
						Reservas
					</button>
					<button
						type="button"
						onClick={() => onGoToPayments?.()}
						className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-h)] hover:bg-[color:var(--hover)]"
					>
						Pagos
					</button>
				</div>
			</div>

			{/* Mapa 3D inmersivo (Inicio) */}
			<div className="-mx-3 sm:-mx-4 lg:-mx-6">
				<Cemetery3DView markers={home3dMarkers} variant="immersive" />
			</div>

			{/* Camposantos destacados (separado de la cabecera) */}
			<FeaturedCemeteriesPanel branches={branches} loading={branchesLoading} error={branchesError || branchesSummaryError} />

			<Panel className="client-available-panel p-0 overflow-hidden">
				<div className="p-4">
					{lastReservation ? (
						<div className="mb-3 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-3 text-sm text-[color:var(--text)]">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="text-sm font-semibold text-[color:var(--text-h)]">
									Tu reserva {lastReservation.code ? `(${lastReservation.code})` : ''}
								</div>
								<button
									type="button"
									onClick={() => {
										setLastReservation(null)
										setMsg('')
									}}
									className="rounded-md border border-[color:var(--border)] bg-transparent px-2 py-1 text-xs text-[color:var(--text-h)] hover:bg-[color:var(--hover)]"
								>
									Ocultar
								</button>
							</div>
							<div className="mt-1 text-xs text-[color:var(--muted)]">Estado actual: {formatReservationStatus(lastReservation.status)}</div>
							<div className="mt-2 grid gap-2 text-xs md:grid-cols-3">
								<div>
									<div className="text-[color:var(--muted)]">Difunto</div>
									<div className="font-medium text-[color:var(--text-h)]">{lastReservation.deceasedFullName || '—'}</div>
								</div>
								<div>
									<div className="text-[color:var(--muted)]">Desde</div>
									<div className="font-medium text-[color:var(--text-h)]">{lastReservation.reservedFrom || '—'}</div>
								</div>
								<div>
									<div className="text-[color:var(--muted)]">Hasta</div>
									<div className="font-medium text-[color:var(--text-h)]">{lastReservation.reservedTo || '—'}</div>
								</div>
							</div>
							{lastReservation.grave ? (
								<div className="mt-2 grid gap-2 text-xs md:grid-cols-4">
									<div>
										<div className="text-[color:var(--muted)]">Sucursal</div>
										<div className="font-medium text-[color:var(--text-h)]">{lastReservation.grave.branch_name || '—'}</div>
									</div>
									<div>
										<div className="text-[color:var(--muted)]">Tumba</div>
										<div className="font-medium text-[color:var(--text-h)]">{lastReservation.grave.code || '—'}</div>
									</div>
									<div>
										<div className="text-[color:var(--muted)]">Sección</div>
										<div className="font-medium text-[color:var(--text-h)]">{lastReservation.grave.sector_name || '—'}</div>
									</div>
									<div>
										<div className="text-[color:var(--muted)]">Ubicación</div>
										<div className="font-medium text-[color:var(--text-h)]">
											Fila {lastReservation.grave.row_number ?? '—'} · Col {lastReservation.grave.col_number ?? '—'}
										</div>
									</div>
								</div>
							) : null}
							<div className="mt-3 flex flex-wrap items-center gap-2">
								<button
									type="button"
									onClick={() => onGoToMyReservations?.()}
									className="rounded-md bg-[color:var(--accent)] px-3 py-2 text-xs font-medium text-[color:var(--on-accent)]"
								>
									Ir a Mis reservas
								</button>
								<div className="text-xs text-[color:var(--muted)]">Ahí podrás ver si ya fue confirmada.</div>
							</div>
						</div>
					) : null}
					{msg && <div className="mb-3 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--text)]">{msg}</div>}
					{error && <div className="mb-3 text-sm text-red-600">{error}</div>}

					<div className="client-available-head">
						<div className="flex min-w-0 items-center gap-3">
							<div className="client-available-head__icon" aria-hidden="true">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<path d="M4 19h16" />
									<path d="M6 19V8a6 6 0 0 1 12 0v11" />
									<path d="M8 11h8" />
									<path d="M9 15h6" />
								</svg>
							</div>
							<div className="min-w-0">
								<div className="ui-kicker">Reservas</div>
								<div className="ui-title text-lg font-semibold md:text-xl">Tumbas disponibles</div>
								<div className="mt-1 text-xs text-[color:var(--muted)]">Elige una parcela y completa la reserva en el panel guiado.</div>
							</div>
						</div>
							<div className="client-available-tools">
								{Array.isArray(branches) && branches.length > 0 ? (
									<select
										value={activeBranchId}
										onChange={(e) => setActiveBranchId(e.target.value)}
										disabled={branchesLoading}
										className="client-available-select h-10 rounded-md border border-[color:var(--border)] bg-transparent px-3 text-xs text-[color:var(--text-h)] disabled:opacity-50"
										aria-label="Sucursal"
									>
										{branches.map((b) => (
											<option key={b.id} value={String(b.id)}>
												{b.name}
											</option>
										))}
									</select>
								) : null}
								<div className="client-available-count">
									<span>{available.length}</span>
									<small>disponibles</small>
								</div>
							</div>
					</div>
						{branchesError ? <div className="mt-2 text-xs text-red-600">{branchesError}</div> : null}

					{loading && <div className="mt-4 text-sm text-[color:var(--text)]">Cargando…</div>}
					{!loading && available.length === 0 && (
						<div className="mt-4 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-3 text-sm text-[color:var(--text)]">
							No hay tumbas disponibles por ahora.
						</div>
					)}

					{!loading && available.length > 0 && (
						<div className="client-grave-grid mt-4">
							{available.map((g) => (
								<div key={g.id} className="ui-card ui-card--grave client-grave-card group overflow-hidden">
									<div className="client-grave-card__media">
										<img
											src={graveCardImg}
											alt="Tumba disponible"
											className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
											loading="lazy"
										/>
										<div className="client-grave-card__overlay" />
										<div className="client-grave-card__status">Disponible</div>
										<div className="client-grave-card__media-code">{g.code}</div>
									</div>

									<div className="client-grave-card__body">
										<div className="flex items-start justify-between gap-3">
											<div className="min-w-0">
												<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">Parcela</div>
												<div className="mt-0.5 truncate text-xl font-semibold tracking-tight text-[color:var(--text-h)]">{g.code}</div>
											</div>
											<div className="client-grave-card__price">
												{formatMoney(g.price_cents, 'PEN')}
											</div>
										</div>

										<div className="client-grave-card__facts">
											<div className="client-grave-card__fact">
												<span>Sección</span>
												<strong>{g.sector_name || '—'}</strong>
											</div>
											<div className="client-grave-card__fact">
												<span>Fila</span>
												<strong>{g.row_number ?? '—'}</strong>
											</div>
											<div className="client-grave-card__fact">
												<span>Col</span>
												<strong>{g.col_number ?? '—'}</strong>
											</div>
										</div>

										<button
											type="button"
											onClick={() => openReserveModal(g)}
											className="client-grave-card__button bg-[color:var(--accent)] text-[color:var(--on-accent)]"
										>
											<span>{me ? 'Reservar parcela' : 'Ver y reservar'}</span>
											<span aria-hidden="true">→</span>
										</button>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</Panel>

			{reserveOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
					<div className="max-h-[calc(100vh-2rem)] w-full max-w-6xl overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl">
						<div className="theme-dark px-4 py-3" style={{ background: 'linear-gradient(90deg, var(--az1), var(--az2))' }}>
							<div className="flex items-center justify-between gap-3">
								<div>
									<div className="text-sm font-semibold text-white">Nueva reserva</div>
									<div className="mt-0.5 text-xs text-white/75">Completa los datos y selecciona una parcela disponible.</div>
								</div>
								<button
									type="button"
									onClick={() => setReserveOpen(false)}
									className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15"
								>
									Cerrar
								</button>
							</div>
							<div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
								{[1, 2, 3, 4].map((step) => (
									<button
										key={step}
										type="button"
										disabled={step === 4 && !reserveCreated}
										onClick={() => setReserveStep(step)}
										className={
											'rounded-full px-3 py-1 transition disabled:opacity-50 ' +
											(reserveStep === step
												? 'bg-white text-[color:var(--az2)]'
												: 'bg-white/15 text-white/80 hover:bg-white/20')
										}
									>
										{step} · {step === 1 ? 'Datos' : step === 2 ? 'Parcela' : step === 3 ? 'Confirmar' : 'Reseña'}
									</button>
								))}
							</div>
						</div>

						<div
							className="grid gap-4 overflow-y-auto p-4 md:grid-cols-[1fr_360px] md:items-start"
							style={{ maxHeight: 'calc(100vh - 2rem - 98px)' }}
						>
							<div className="space-y-3">
								<div className="ui-card ui-card--tight">
									<div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--text-h)]">
										<span className="inline-block h-2 w-2 rounded-full bg-[color:var(--accent)]" />
										Datos del difunto
									</div>
									<form onSubmit={submitReserve} className="mt-3 space-y-3">
										<div className="grid gap-2 md:grid-cols-2">
											<div>
												<label className="block text-xs text-[color:var(--text)]">Nombre</label>
												<input
													value={deceasedFirstName}
													onChange={(e) => setDeceasedFirstName(e.target.value)}
													className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm text-[color:var(--text-h)]"
													placeholder="Ej: Juan"
													autoFocus
												/>
											</div>
											<div>
												<label className="block text-xs text-[color:var(--text)]">Apellido</label>
												<input
													value={deceasedLastName}
													onChange={(e) => setDeceasedLastName(e.target.value)}
													className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm text-[color:var(--text-h)]"
													placeholder="Ej: Pérez"
												/>
											</div>
										</div>
										<div className="grid gap-2 md:grid-cols-2">
											<div>
												<label className="block text-xs text-[color:var(--text)]">Desde (opcional)</label>
												<input
													type="date"
													value={reservedFrom}
													onChange={(e) => setReservedFrom(e.target.value)}
													className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm text-[color:var(--text-h)]"
												/>
											</div>
											<div>
												<label className="block text-xs text-[color:var(--text)]">Hasta (opcional)</label>
												<input
													type="date"
													value={reservedTo}
													onChange={(e) => setReservedTo(e.target.value)}
													className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm text-[color:var(--text-h)]"
												/>
											</div>
										</div>
									</form>
								</div>

								<div className="ui-card ui-card--tight">
									<div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--text-h)]">
										<span className="inline-block h-2 w-2 rounded-full bg-[color:var(--accent)]" />
										Selecciona el sector
									</div>
									{Array.isArray(branches) && branches.length > 0 ? (
										<div className="mt-3 grid gap-2 md:grid-cols-[1fr_260px] md:items-center">
											<div className="text-xs text-[color:var(--muted)]">Sucursal activa</div>
											<select
												value={activeBranchId}
												onChange={async (e) => {
													const next = e.target.value
													setActiveBranchId(next)
													setSelectedGraveId(null)
													setSelectedGraveTypeId(null)
													await loadGraveMap(null, Number(next))
												}}
												disabled={branchesLoading}
												className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm text-[color:var(--text-h)] disabled:opacity-50"
												aria-label="Sucursal"
											>
												{branches.map((b) => (
													<option key={b.id} value={String(b.id)}>
														{b.name}
													</option>
												))}
											</select>
										</div>
									) : null}
									<div className="mt-3 ui-sector-grid">
										{mapSectors.map((s) => (
											<button
												type="button"
												key={s.id}
												data-active={String(mapSectorId) === String(s.id) ? 'true' : 'false'}
												className="ui-sector-btn"
												onClick={async () => {
													setMapSectorId(s.id)
													setSelectedGraveId(null)
													await loadGraveMap(s.id, activeBranchIdN)
													setReserveStep(2)
												}}
											>
												<span className="ui-sector-btn__code">{getSectorShortName(s.name)}</span>
												<span className="ui-sector-btn__label">{s.name}</span>
											</button>
										))}
									</div>

									<div className="mt-4">
											<div className="text-xs text-[color:var(--muted)]">Tipo de parcela</div>
											{typeCards.length === 0 ? (
												<div className="mt-2 text-sm text-[color:var(--text)]">No hay tipos configurados en este sector.</div>
											) : (
												<div className="mt-2 grid gap-2 sm:grid-cols-2">
													{typeCards.map((t) => {
														const active = String(selectedGraveTypeId || '') === String(t.id)
														const disabled = t.availableCount <= 0
														const subtitle = getTypeSubtitle(t.name)
														return (
															<button
																key={t.id}
																type="button"
																disabled={disabled}
																onClick={() => {
																	setSelectedGraveTypeId(t.id)
																	setSelectedGraveId(null)
																	setReserveFormError('')
																	setReserveStep(2)
																}}
																className={
																	'w-full rounded-xl border px-3 py-3 text-left transition ' +
																	(active
																		? 'border-[color:var(--accent)] bg-[color:var(--surface-2)]'
																		: 'border-[color:var(--border)] bg-transparent hover:bg-[color:var(--surface-2)]') +
																	(disabled ? ' opacity-50' : '')
																}
															>
																<div className="flex items-start justify-between gap-2">
																	<div className="text-sm font-semibold text-[color:var(--text-h)]">{t.name}</div>
																	<div className="text-sm font-semibold text-[color:var(--text-h)]">
																		{t.minAvailablePriceCents != null ? formatMoney(t.minAvailablePriceCents, 'PEN') : '—'}
																	</div>
																</div>
																{subtitle && <div className="mt-1 text-xs text-[color:var(--muted)]">{subtitle}</div>}
																{!subtitle && <div className="mt-1 text-xs text-[color:var(--muted)]">{t.availableCount} disponibles</div>}
															</button>
														)
												})}
												</div>
											)}

										<div className="text-xs text-[color:var(--muted)]">Mapa del sector — haz clic para seleccionar</div>
										{mapLoading && <div className="mt-2 text-sm text-[color:var(--text)]">Cargando mapa…</div>}
										{mapError && <div className="mt-2 text-sm text-red-600">{mapError}</div>}
										{!mapLoading && !mapError && (
												<div className="mt-3 overflow-x-auto pb-2">
													<div
														className="ui-grave-grid"
														style={{ gridTemplateColumns: `repeat(${Math.max(mapCols || 6, 1)}, var(--cell-w))` }}
													>
													{mapGraves.map((g) => {
														const state = computeCellState(g)
																const typeOk =
																	selectedGraveTypeId == null || String(g.grave_type_id || '') === String(selectedGraveTypeId)
																const selectable = state === 'available' && typeOk
														const isSelected = selectedGraveId === g.id
														return (
															<button
																key={g.id}
																type="button"
																className="ui-grave-cell"
																data-state={state}
																data-selected={isSelected ? 'true' : 'false'}
																disabled={!selectable}
																title={g.code}
																	onClick={() => {
																		if (!selectable) return
																		setSelectedGraveId(g.id)
																		if (g.grave_type_id != null) setSelectedGraveTypeId(String(g.grave_type_id))
																		setReserveStep(3)
																	}}
															>
																{displayCellNumber(g) || '•'}
															</button>
														)
													})}
													</div>

												<div className="ui-grave-legend">
													<div className="ui-grave-legend__item">
														<span
															className="ui-grave-legend__swatch"
															style={{ background: 'color-mix(in oklab, var(--az4) 16%, var(--surface))' }}
														/>
														Disponible
													</div>
													<div className="ui-grave-legend__item">
														<span
															className="ui-grave-legend__swatch"
															style={{ background: 'color-mix(in oklab, var(--az4) 22%, var(--surface))' }}
														/>
														Pendiente
													</div>
													<div className="ui-grave-legend__item">
														<span
															className="ui-grave-legend__swatch"
															style={{ background: 'color-mix(in oklab, var(--az3) 85%, var(--surface))' }}
														/>
														Confirmada
													</div>
													<div className="ui-grave-legend__item">
														<span
															className="ui-grave-legend__swatch"
															style={{ background: 'color-mix(in oklab, var(--az1) 92%, var(--surface))' }}
														/>
														Ocupada
													</div>
													<div className="ui-grave-legend__item">
														<span
															className="ui-grave-legend__swatch"
															style={{ background: 'color-mix(in oklab, var(--az2) 42%, var(--surface))' }}
														/>
														Seleccionada
													</div>
												</div>
												<div className="mt-2 text-xs text-[color:var(--text)]">
													<span className="text-[color:var(--muted)]">Seleccionada:</span>{' '}
													<span className="font-medium text-[color:var(--text-h)]">{selectedGrave?.code || '—'}</span>
												</div>
											</div>
										)}
									</div>
								</div>
							</div>

						<div className="ui-card overflow-hidden p-0">
							<div className="px-4 py-3" style={{ background: 'linear-gradient(90deg, var(--az1), var(--az2))' }}>
								<div className="text-sm font-semibold text-white">Resumen de reserva</div>
							</div>
							<div className="p-4">
																<div className="flex items-center justify-between py-2 text-sm">
																	<span className="text-[color:var(--muted)]">Titular</span>
																	<span className="font-medium text-[color:var(--text-h)]">{me?.email || '—'}</span>
																</div>
								<div className="flex items-center justify-between border-t border-[color:var(--border)] py-2 text-sm">
									<span className="text-[color:var(--muted)]">Sector</span>
									<span className="font-medium text-[color:var(--text-h)]">
										{selectedGrave?.sector_name || mapSectors.find((s) => String(s.id) === String(mapSectorId))?.name || '—'}
									</span>
								</div>
								<div className="flex items-center justify-between border-t border-[color:var(--border)] py-2 text-sm">
									<span className="text-[color:var(--muted)]">Parcela</span>
									<span className="font-medium text-[color:var(--text-h)]">{selectedGrave ? selectedGrave.code : '— seleccionar'}</span>
								</div>
								<div className="flex items-center justify-between border-t border-[color:var(--border)] py-2 text-sm">
									<span className="text-[color:var(--muted)]">Tipo</span>
									<span className="font-medium text-[color:var(--text-h)]">{selectedGrave?.grave_type_name || '—'}</span>
								</div>
								<div className="mt-3 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-3">
									<div className="flex items-center justify-between">
										<span className="text-sm font-medium text-[color:var(--text)]">Total estimado</span>
										<span className="text-lg font-semibold text-[color:var(--text-h)]">{formatMoney(selectedGrave?.price_cents || 0, 'PEN')}</span>
									</div>
									<div className="mt-1 text-xs text-[color:var(--muted)]">Se crea como pendiente hasta aprobación del administrador.</div>
								</div>

								{reserveCreated && lastReservation ? (
									<div className="mt-3 rounded-md border border-[color:var(--accent-border)] bg-[color:var(--accent-bg)] px-3 py-3 text-sm text-[color:var(--text-h)]">
										<div className="font-semibold">Reserva creada</div>
										<div className="mt-1 text-xs text-[color:var(--muted)]">
											Código: <span className="font-semibold text-[color:var(--text-h)]">{lastReservation.code || '—'}</span> · Estado:{' '}
											<span className="font-semibold text-[color:var(--text-h)]">{formatReservationStatus(lastReservation.status)}</span>
										</div>
									</div>
								) : null}

								{reserveFormError && <div className="mt-3 text-sm text-red-600">{reserveFormError}</div>}
								{error && <div className="mt-2 text-sm text-red-600">{error}</div>}

																{!reserveCreated ? (
																	<button
																		onClick={(e) => submitReserve(e)}
																		disabled={!canReserve}
																		className="mt-3 w-full rounded-md bg-[color:var(--accent)] px-3 py-3 text-sm font-medium text-[color:var(--on-accent)] disabled:opacity-50"
																		type="button"
																	>
																		{creatingId != null ? 'Reservando…' : me ? 'Confirmar reserva' : 'Iniciar sesión para reservar'}
																	</button>
																) : null}
								{!canReserve && confirmHint && <div className="mt-2 text-xs text-[color:var(--muted)]">{confirmHint}</div>}
							</div>
						</div>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
