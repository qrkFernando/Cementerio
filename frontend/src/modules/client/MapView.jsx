import { useMemo, useState } from 'react'
import { Cemetery3DView } from './Cemetery3DView'

function recordKey(r) {
	const id = r?.id
	if (id != null) return `resv-${id}`
	if (r?.reservation_code) return `rsv-${r.reservation_code}`
	if (r?.grave_code) return `grave-${r.grave_code}`
	if (r?.deceased_full_name) return `name-${r.deceased_full_name}`
	return ''
}

export function MapView({ selected, markers = [], onSelect }) {
	const [gmOpen, setGmOpen] = useState(false)
	const [gmEverOpened, setGmEverOpened] = useState(false)

	const displayName = useMemo(() => {
		if (!selected) return ''
		return selected.deceased_full_name || `${selected.last_name || ''} ${selected.first_name || ''}`.trim() || ''
	}, [selected])

	const coords = useMemo(() => {
		const lat = selected?.latitude != null ? Number(selected.latitude) : null
		const lng = selected?.longitude != null ? Number(selected.longitude) : null
		return {
			lat: Number.isFinite(lat) ? lat : null,
			lng: Number.isFinite(lng) ? lng : null,
		}
	}, [selected])

	const hasCoords = coords.lat != null && coords.lng != null
	const mapHref = hasCoords ? `https://www.google.com/maps?q=${encodeURIComponent(`${coords.lat},${coords.lng}`)}` : null
	const embedSrc = hasCoords
		? `https://www.google.com/maps?q=${encodeURIComponent(`${coords.lat},${coords.lng}`)}&z=18&output=embed`
		: null

	function toggleGm() {
		setGmOpen((v) => {
			const next = !v
			if (next) setGmEverOpened(true)
			return next
		})
	}

	return (
		<div className="client-map-view">
			{/* Encabezado fuera del mapa */}
			<div className="client-map-view__header">
				<div className="client-map-selected-card">
					<div className="ui-kicker">Mapa</div>
					<div className="mt-0.5 text-base font-semibold text-[color:var(--text-h)]">Mapa del cementerio</div>
					{selected ? (
						<div className="mt-1 text-xs text-[color:var(--text)]">
							<span className="font-medium text-[color:var(--text-h)]">{displayName || '—'}</span>
							{selected.grave_code ? ` · Tumba ${selected.grave_code}` : ''}
							{selected.sector_name ? ` · ${selected.sector_name}` : ''}
							{selected.row_number != null ? ` / Fila ${selected.row_number}` : ''}
							{selected.col_number != null ? ` / Col ${selected.col_number}` : ''}
							{hasCoords ? (
								<a
									href={mapHref}
									target="_blank"
									rel="noreferrer"
									className="ml-2 inline-flex h-7 items-center rounded-md bg-[color:var(--accent)] px-2 text-xs font-medium text-[color:var(--on-accent)]"
								>
									Google Maps
								</a>
							) : null}
						</div>
					) : (
						<div className="mt-1 text-xs text-[color:var(--text)]">
							Selecciona un difunto en <span className="font-medium text-[color:var(--text-h)]">Búsqueda</span> para ver su ubicación.
						</div>
					)}
				</div>

				<div className="client-map-help">
					<span>Arrastra para rotar</span>
					<span>Scroll para zoom</span>
					<span>Clic para explorar</span>
				</div>
			</div>

			{/* Google Maps embebido (on-demand) */}
			{selected ? (
				<div className="client-map-google-card">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<div className="ui-kicker">Ubicación</div>
							<div className="mt-0.5 text-base font-semibold text-[color:var(--text-h)]">Google Maps</div>
							<div className="mt-1 text-xs text-[color:var(--text)]">
								{hasCoords ? (
									<>
										Coordenadas: <span className="font-medium text-[color:var(--text-h)]">{coords.lat}, {coords.lng}</span>
									</>
								) : (
									<>Este difunto aún no tiene coordenadas registradas.</>
								)}
							</div>
						</div>

						<div className="flex items-center justify-end gap-2">
							<button
								type="button"
								onClick={toggleGm}
								disabled={!hasCoords}
								className={
									'inline-flex h-10 items-center rounded-md border px-3 text-sm font-medium disabled:opacity-50 ' +
									(gmOpen
										? 'border-[color:var(--accent-border)] bg-[color:var(--accent-bg)] text-[color:var(--text-h)]'
										: 'border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-h)] hover:bg-[color:var(--hover)]')
								}
							>
								{gmOpen ? 'Ocultar mapa' : 'Mostrar mapa'}
							</button>
							{hasCoords && mapHref ? (
								<a
									href={mapHref}
									target="_blank"
									rel="noreferrer"
									className="inline-flex h-10 items-center rounded-md bg-[color:var(--accent)] px-3 text-sm font-medium text-[color:var(--on-accent)]"
								>
									Abrir
								</a>
							) : null}
						</div>
					</div>

					{gmEverOpened && hasCoords && embedSrc ? (
						<div className={gmOpen ? 'mt-3' : 'mt-3 hidden'}>
							<div className="overflow-hidden rounded-md border border-[color:var(--border)] bg-[color:var(--surface-2)]">
								<iframe
									title="Ubicación en Google Maps"
									src={embedSrc}
									className="block h-[320px] w-full"
									loading="lazy"
									referrerPolicy="no-referrer-when-downgrade"
									allowFullScreen
								/>
							</div>
							<div className="mt-2 text-xs text-[color:var(--text)]">
								Tip: si no ves el pin exacto, usa <span className="font-medium text-[color:var(--text-h)]">Abrir</span>.
							</div>
						</div>
					) : null}
				</div>
			) : null}

			{/* Mapa 3D (reemplaza la imagen) */}
			<div className="client-map-canvas-wrap">
				<Cemetery3DView variant="immersive" markers={markers} selected={selected} onSelect={onSelect} />
			</div>
		</div>
	)
}
