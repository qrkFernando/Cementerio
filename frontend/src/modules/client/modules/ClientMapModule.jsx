import { useEffect, useMemo, useState } from 'react'
import { Panel } from '../../layout/Panel'
import { api } from '../../../lib/api'
import { MapView } from '../MapView'

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
	// LCG simple en 32-bit para obtener un número en [0,1)
	let x = seed >>> 0
	x = (Math.imul(1664525, x) + 1013904223) >>> 0
	return x / 2 ** 32
}

function recordKey(r) {
	// SearchView usa `it.id` como id de reserva
	const id = r?.id
	if (id != null) return `resv-${id}`
	if (r?.reservation_code) return `rsv-${r.reservation_code}`
	if (r?.grave_code) return `grave-${r.grave_code}`
	if (r?.deceased_full_name) return `name-${r.deceased_full_name}`
	return 'unknown'
}


export function ClientMapModule({ me, selected, onSelect }) {
	const [cemOpen, setCemOpen] = useState(false)
	const [cemEverOpened, setCemEverOpened] = useState(false)
	const [cemLoading, setCemLoading] = useState(false)
	const [cemError, setCemError] = useState('')
	const [cemLocation, setCemLocation] = useState(null)
	const [cemPinnedEmbedSrc, setCemPinnedEmbedSrc] = useState(null)
	const [cemPinnedHref, setCemPinnedHref] = useState(null)

	const [loading, setLoading] = useState(false)
	const [items, setItems] = useState([])
	const [error, setError] = useState('')

	const cemeteryCoords = useMemo(() => {
		const lat = cemLocation?.latitude != null ? Number(cemLocation.latitude) : null
		const lng = cemLocation?.longitude != null ? Number(cemLocation.longitude) : null
		return {
			lat: Number.isFinite(lat) ? lat : null,
			lng: Number.isFinite(lng) ? lng : null,
		}
	}, [cemLocation])

	const cemeteryLabel = useMemo(() => {
		const name = String(cemLocation?.name || '').trim()
		const address = String(cemLocation?.address || '').trim()
		return {
			name: name || 'Cementerio',
			address: address || '',
		}
	}, [cemLocation])

	async function loadCemeteryLocationOnce() {
		if (cemLocation || cemLoading) return cemLocation
		setCemLoading(true)
		setCemError('')
		try {
			const res = await api('/api/public/cemetery-location')
			if (!res.ok) {
				setCemError(res.data?.error || 'No se pudo cargar la ubicación del cementerio.')
				return null
			}
			const next = res.data?.location || null
			setCemLocation(next)
			return next
		} finally {
			setCemLoading(false)
		}
	}

	function pinEmbedFromLocation(loc) {
		const lat = loc?.latitude != null ? Number(loc.latitude) : null
		const lng = loc?.longitude != null ? Number(loc.longitude) : null
		const hasCoords = Number.isFinite(lat) && Number.isFinite(lng)
		const address = String(loc?.address || '').trim()
		const q = hasCoords ? `${lat},${lng}` : address
		if (!q) {
			setCemPinnedEmbedSrc(null)
			setCemPinnedHref(null)
			return
		}
		setCemPinnedHref(`https://www.google.com/maps?q=${encodeURIComponent(q)}`)
		setCemPinnedEmbedSrc(`https://www.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed`)
	}

	async function toggleCemeteryMap() {
		const next = !cemOpen
		setCemOpen(next)
		if (!next) return
		if (!cemEverOpened) setCemEverOpened(true)
		const loc = (await loadCemeteryLocationOnce()) || cemLocation || null
		// Pinea el embed para evitar que cambie/re-cargue mientras el usuario navega.
		pinEmbedFromLocation(loc)
	}

	useEffect(() => {
		let cancelled = false
		async function load() {
			if (!me) {
				setItems([])
				setError('')
				return
			}
			setLoading(true)
			setError('')
			const res = await api('/api/client/reservations')
			if (cancelled) return
			if (!res.ok) {
				setItems([])
				setError('No se pudo cargar tus difuntos.')
				setLoading(false)
				return
			}
			const raw = Array.isArray(res.data?.reservations) ? res.data.reservations : []
			setItems(raw)
			setLoading(false)
		}
		load()
		return () => {
			cancelled = true
		}
	}, [me])

	const grouped = useMemo(() => {
		// 1 por difunto cuando haya nombre; si no, 1 por reserva.
		const by = new Map()
		for (const r of items) {
			const name = String(r?.deceased_full_name || '').trim()
			const key = name ? `name:${name.toLowerCase()}` : recordKey(r)
			if (!by.has(key)) by.set(key, r)
		}
		return Array.from(by.values())
	}, [items])

	const markers = useMemo(() => {
		return grouped.map((r) => {
			const id = recordKey(r)
			const seed = makeStableSeed(id)
			const x = 10 + stable01(seed) * 80
			const y = 18 + stable01(seed ^ 0x9e3779b9) * 70
			const hue = Math.floor(stable01(seed ^ 0x7f4a7c15) * 300)
			return { id, record: r, x, y, hue }
		})
	}, [grouped])

	return (
		<Panel className="client-map-panel p-0">
			<div className="client-map-hero">
				<div className="client-map-hero__badge" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<path d="M20 10c0 4.5-5 10-8 12-3-2-8-7.5-8-12a8 8 0 1 1 16 0Z" />
						<circle cx="12" cy="10" r="3" />
					</svg>
				</div>
				<div className="min-w-0">
					<div className="ui-kicker">Mapa</div>
					<div className="mt-1 text-xl font-semibold text-[color:var(--text-h)]">Ubicación y parcelas</div>
					<div className="mt-1 text-sm text-[color:var(--text)]">Explora el cementerio, revisa tus registros y abre la ubicación general cuando la necesites.</div>
				</div>
				<div className="client-map-hero__stats">
					<div>
						<span>{grouped.length}</span>
						<small>registros</small>
					</div>
					<div>
						<span>{markers.length}</span>
						<small>marcadores</small>
					</div>
				</div>
			</div>

			<div className="client-map-general">
				<div className="client-map-location-card">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<div className="ui-kicker">Ubicación</div>
							<div className="mt-0.5 text-base font-semibold text-[color:var(--text-h)]">Mapa general del cementerio</div>
							<div className="mt-1 text-xs text-[color:var(--text)]">
								{cemLocation ? (
									<>
										<span className="font-medium text-[color:var(--text-h)]">{cemeteryLabel.name}</span>
										{cemeteryLabel.address ? ` · ${cemeteryLabel.address}` : ''}
										{cemeteryCoords.lat != null && cemeteryCoords.lng != null
											? ` · ${cemeteryCoords.lat}, ${cemeteryCoords.lng}`
											: ''}
									</>
								) : (
									<>Muéstralo cuando lo necesites (no consume API si está oculto).</>
								)}
							</div>
							{cemError ? <div className="mt-1 text-xs text-red-600">{cemError}</div> : null}
						</div>

						<div className="flex items-center justify-end gap-2">
							<button
								type="button"
								onClick={toggleCemeteryMap}
								className={
									'inline-flex h-10 items-center rounded-md border px-3 text-sm font-medium ' +
									(cemOpen
										? 'border-[color:var(--accent-border)] bg-[color:var(--accent-bg)] text-[color:var(--text-h)]'
										: 'border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-h)] hover:bg-[color:var(--hover)]')
								}
							>
								{cemOpen ? 'Ocultar mapa' : cemLoading ? 'Cargando…' : 'Mostrar mapa'}
							</button>
							{cemPinnedHref ? (
								<a
									href={cemPinnedHref}
									target="_blank"
									rel="noreferrer"
									className="inline-flex h-10 items-center rounded-md bg-[color:var(--accent)] px-3 text-sm font-medium text-[color:var(--on-accent)]"
								>
									Abrir
								</a>
							) : null}
						</div>
					</div>

					{cemEverOpened && cemPinnedEmbedSrc ? (
						<div className={cemOpen ? 'mt-3' : 'mt-3 hidden'}>
							<div className="overflow-hidden rounded-md border border-[color:var(--border)] bg-[color:var(--surface-2)]">
								<iframe
									title="Mapa general del cementerio"
									src={cemPinnedEmbedSrc}
									className="block h-[320px] w-full"
									loading="lazy"
									referrerPolicy="no-referrer-when-downgrade"
									allowFullScreen
								/>
							</div>
							<div className="mt-2 text-xs text-[color:var(--text)]">
								Se carga una sola vez y luego solo se oculta.
							</div>
						</div>
					) : cemEverOpened && cemOpen ? (
						<div className="mt-3 text-sm text-[color:var(--text)]">
							Aún no está configurada la ubicación general del cementerio.
						</div>
					) : null}
				</div>
			</div>

			<div className="client-map-layout">
				{/* Lista lateral */}
				<div className="client-map-sidebar">
					<div className="client-map-sidebar__head">
						<div>
							<div className="text-sm font-semibold text-[color:var(--text-h)]">Difuntos</div>
							<div className="mt-1 text-xs text-[color:var(--text)]">Marcados en el mapa con un color.</div>
						</div>
						<div className="client-map-sidebar__count">{grouped.length}</div>
					</div>

					{!me ? (
						<div className="mt-3 text-sm text-[color:var(--text)]">Inicia sesión para ver tus difuntos.</div>
					) : null}
					{me && loading ? <div className="mt-3 text-sm text-[color:var(--text)]">Cargando…</div> : null}
					{me && error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

					{me && !loading && !error ? (
						<div className="client-map-person-list">
							{grouped.length === 0 ? (
								<div className="text-sm text-[color:var(--text)]">Aún no tienes difuntos registrados en tu cuenta.</div>
							) : (
								grouped.map((r) => {
									const id = recordKey(r)
									const marker = markers.find((m) => m.id === id)
									const hue = marker?.hue ?? 0
									const name = r?.deceased_full_name || r?.deceased_name || r?.deceasedFullName || '—'
									const active = selected && recordKey(selected) === id
									return (
										<button
											key={id || name}
											type="button"
											onClick={() => onSelect?.(r)}
											className={
												'client-map-person ' +
												(active
													? 'client-map-person--active'
													: '')
											}
										>
											<span
												className="client-map-person__dot"
												style={{ filter: `hue-rotate(${hue}deg) saturate(1.2)` }}
												aria-hidden="true"
											/>
											<span className="min-w-0 flex-1">
												<span className="block truncate font-semibold text-[color:var(--text-h)]">{name}</span>
												<span className="mt-0.5 block truncate text-[11px] text-[color:var(--muted)]">
													{r?.grave_code ? `Tumba ${r.grave_code}` : 'Sin tumba'}{r?.sector_name ? ` · ${r.sector_name}` : ''}
												</span>
											</span>
										</button>
									)
								})
							)}
						</div>
					) : null}
				</div>

				{/* Mapa */}
				<div className="client-map-stage">
					<MapView selected={selected} markers={markers} onSelect={onSelect} />
				</div>
			</div>
		</Panel>
	)
}
