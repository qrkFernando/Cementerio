import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../../lib/api'
import { loadGoogleMaps } from '../../../lib/googleMaps'
import { Card, formatMoney, normalizeNumber } from '../ui'

export function AdminGravesModule({ branches, sectors, graveTypes, graves, onRefresh }) {
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

	function graveStatusUi(status) {
		switch (status) {
			case 'occupied':
				return { label: 'Ocupada', className: 'bg-[color:var(--az1)] text-white border-[color:var(--az1)]', dot: 'bg-[color:var(--az1)]' }
			case 'reserved':
				return { label: 'Reservada', className: 'bg-[color:var(--az3)] text-white border-[color:var(--az3)]', dot: 'bg-[color:var(--az3)]' }
			case 'maintenance':
				return { label: 'Mantenimiento', className: 'bg-[color:var(--surface-2)] text-[color:var(--text)] border-[color:var(--border)]', dot: 'bg-[color:var(--border)]' }
			case 'available':
			default:
				return { label: 'Disponible', className: 'bg-[color:var(--surface-2)] text-[color:var(--az2)] border-[color:var(--az4)]', dot: 'bg-[color:var(--az4)]' }
		}
	}

	const branchStorageKey = 'ui.admin.graves.branchId'
	const [activeBranchId, setActiveBranchId] = useState(() => safeStorageGet(branchStorageKey) || '')
	const activeBranchIdN = useMemo(() => {
		const n = Number(activeBranchId)
		return Number.isFinite(n) && n > 0 ? n : null
	}, [activeBranchId])
	useEffect(() => {
		if (activeBranchId != null) safeStorageSet(branchStorageKey, String(activeBranchId))
	}, [activeBranchId])
	useEffect(() => {
		if (activeBranchIdN != null) return
		if (!Array.isArray(branches) || branches.length === 0) return
		setActiveBranchId(String(branches[0].id))
	}, [activeBranchIdN, branches])

	const filteredSectors = useMemo(() => {
		if (activeBranchIdN == null) return sectors
		return sectors.filter((s) => Number(s.branch_id) === Number(activeBranchIdN))
	}, [sectors, activeBranchIdN])

	const filteredGraves = useMemo(() => {
		if (activeBranchIdN == null) return graves
		return graves.filter((g) => Number(g.branch_id) === Number(activeBranchIdN))
	}, [graves, activeBranchIdN])

	const [grRefreshLoading, setGrRefreshLoading] = useState(false)
	const gravesStorageKey = 'ui.admin.graves.seenMaxId'
	const [grSeenMaxId, setGrSeenMaxId] = useState(() => {
		const v = safeStorageGet(gravesStorageKey)
		const n = v != null ? Number(v) : null
		return Number.isFinite(n) ? n : null
	})
	const grCurrentMaxId = useMemo(() => {
		const ids = filteredGraves.map((g) => Number(g.id)).filter((n) => Number.isFinite(n))
		return ids.length ? Math.max(...ids) : 0
	}, [filteredGraves])
	useEffect(() => {
		if (grSeenMaxId == null && grCurrentMaxId > 0) {
			setGrSeenMaxId(grCurrentMaxId)
			safeStorageSet(gravesStorageKey, String(grCurrentMaxId))
		}
	}, [grCurrentMaxId, grSeenMaxId])
	useEffect(() => {
		if (grSeenMaxId != null) safeStorageSet(gravesStorageKey, String(grSeenMaxId))
	}, [grSeenMaxId])
	const grNewCount = useMemo(() => {
		if (grSeenMaxId == null) return 0
		return filteredGraves.filter((g) => Number(g.id) > Number(grSeenMaxId)).length
	}, [filteredGraves, grSeenMaxId])
	async function doRefreshGravesList() {
		setGrRefreshLoading(true)
		try {
			await onRefresh?.()
		} finally {
			setGrRefreshLoading(false)
		}
	}
	const [sectorName, setSectorName] = useState('')
	const [sectorLoading, setSectorLoading] = useState(false)
	const [sectorMsg, setSectorMsg] = useState('')
	const canCreateSector = useMemo(() => sectorName.trim().length >= 1 && activeBranchIdN != null, [sectorName, activeBranchIdN])

	const [graveSectorId, setGraveSectorId] = useState('')
	const [graveRow, setGraveRow] = useState('')
	const [graveCol, setGraveCol] = useState('')
	const [graveTypeId, setGraveTypeId] = useState('')
	const [graveStatus, setGraveStatus] = useState('available')
	const [gravePrice, setGravePrice] = useState('')
	const [graveEnabled, setGraveEnabled] = useState(true)
	const [graveNotes, setGraveNotes] = useState('')
	const [graveLoading, setGraveLoading] = useState(false)
	const [graveMsg, setGraveMsg] = useState('')
	const canCreateGrave = useMemo(() => !graveLoading, [graveLoading])

	async function createSector(e) {
		e?.preventDefault()
		setSectorLoading(true)
		setSectorMsg('')
		try {
			const result = await api('/api/admin/sectors', {
				method: 'POST',
				body: JSON.stringify({ name: sectorName, branchId: activeBranchIdN }),
			})
			if (!result.ok) {
				setSectorMsg(result.data?.error || 'No se pudo crear el sector')
				return
			}
			setSectorMsg('Sector creado')
			setSectorName('')
			await onRefresh?.()
		} finally {
			setSectorLoading(false)
		}
	}

	async function ensureDefaultSectors() {
		setSectorLoading(true)
		setSectorMsg('')
		try {
			for (const name of ['A', 'B', 'C', 'D']) {
				await api('/api/admin/sectors', { method: 'POST', body: JSON.stringify({ name, branchId: activeBranchIdN }) })
			}
			setSectorMsg('Sectores A–D listos')
			await onRefresh?.()
		} finally {
			setSectorLoading(false)
		}
	}

	async function createGrave(e) {
		e?.preventDefault()
		setGraveLoading(true)
		setGraveMsg('')
		try {
			const priceCents = gravePrice.trim() ? Math.round(Number(gravePrice) * 100) : 0
			if (!Number.isFinite(priceCents) || priceCents < 0) {
				setGraveMsg('Precio inválido')
				return
			}
			const body = {
				sectorId: graveSectorId ? Number(graveSectorId) : null,
				rowNumber: normalizeNumber(graveRow),
				colNumber: normalizeNumber(graveCol),
				graveTypeId: graveTypeId ? Number(graveTypeId) : null,
				status: graveStatus,
				priceCents,
				isEnabled: graveEnabled,
				notes: graveNotes.trim() ? graveNotes.trim() : null,
			}
			const result = await api('/api/admin/graves', {
				method: 'POST',
				body: JSON.stringify(body),
			})
			if (!result.ok) {
				setGraveMsg(result.data?.error || 'No se pudo crear la tumba')
				return
			}
			const code = result.data?.grave?.code
			setGraveMsg(code ? `Tumba creada: ${code}` : 'Tumba creada')
			setGraveRow('')
			setGraveCol('')
			setGravePrice('')
			setGraveEnabled(true)
			setGraveNotes('')
			await onRefresh?.()
		} finally {
			setGraveLoading(false)
		}
	}

	const [graveEditLoadingId, setGraveEditLoadingId] = useState(null)
	const [locEditId, setLocEditId] = useState(null)
	const [locLat, setLocLat] = useState('')
	const [locLng, setLocLng] = useState('')
	const [locSaving, setLocSaving] = useState(false)
	const [locMsg, setLocMsg] = useState('')
	const [locMapOpen, setLocMapOpen] = useState(false)
	const [locMapEverOpened, setLocMapEverOpened] = useState(false)
	const [locPreview, setLocPreview] = useState(null)

	const editingGrave = useMemo(() => {
		if (locEditId == null) return null
		return filteredGraves.find((gr) => Number(gr.id) === Number(locEditId)) || null
	}, [filteredGraves, locEditId])

	const locInputCoords = useMemo(() => {
		const lat = normalizeNumber(locLat)
		const lng = normalizeNumber(locLng)
		const hasBoth = lat != null && lng != null
		return { lat, lng, hasBoth }
	}, [locLat, locLng])

	function openLocationEditor(grave) {
		setLocEditId(grave?.id ?? null)
		setLocLat(grave?.latitude != null ? String(grave.latitude) : '')
		setLocLng(grave?.longitude != null ? String(grave.longitude) : '')
		setLocMsg('')
		setLocSaving(false)
		setLocMapOpen(false)
		setLocMapEverOpened(false)
		if (grave?.latitude != null && grave?.longitude != null) {
			const lat = Number(grave.latitude)
			const lng = Number(grave.longitude)
			setLocPreview(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null)
		} else {
			setLocPreview(null)
		}
	}

	function closeLocationEditor() {
		setLocEditId(null)
		setLocMsg('')
		setLocMapOpen(false)
		setLocMapEverOpened(false)
		setLocPreview(null)
	}

	function toggleLocationMapPreview() {
		setLocMapOpen((open) => {
			const next = !open
			if (next) {
				if (!locInputCoords.hasBoth) return open
				setLocPreview({ lat: locInputCoords.lat, lng: locInputCoords.lng })
				setLocMapEverOpened(true)
			}
			return next
		})
	}

	async function saveLocationForEditingGrave() {
		if (!editingGrave) return
		setLocMsg('')

		const { lat, lng } = locInputCoords
		const hasLat = lat != null
		const hasLng = lng != null
		if (hasLat !== hasLng) {
			setLocMsg('Completa latitud y longitud (o deja ambos vacíos).')
			return
		}
		if (lat != null && (lat < -90 || lat > 90)) {
			setLocMsg('Latitud inválida (rango: -90 a 90).')
			return
		}
		if (lng != null && (lng < -180 || lng > 180)) {
			setLocMsg('Longitud inválida (rango: -180 a 180).')
			return
		}

		const sectorId = editingGrave?.sector_id
		const rowNumber = editingGrave?.row_number
		const colNumber = editingGrave?.col_number
		if (sectorId == null || rowNumber == null || colNumber == null) {
			setLocMsg('Esta tumba no tiene sector/fila/columna; no se puede guardar ubicación.')
			return
		}

		setLocSaving(true)
		try {
			const result = await api(`/api/admin/graves/${editingGrave.id}`, {
				method: 'PATCH',
				body: JSON.stringify({
					sectorId: Number(sectorId),
					rowNumber: Number(rowNumber),
					colNumber: Number(colNumber),
					latitude: lat,
					longitude: lng,
				}),
			})
			if (!result.ok) {
				setLocMsg(result.data?.error || 'No se pudo guardar la ubicación.')
				return
			}
			setLocMsg('Ubicación guardada.')
			await onRefresh?.()
		} finally {
			setLocSaving(false)
		}
	}

	async function updateGraveStatus(graveId, status) {
		setGraveEditLoadingId(graveId)
		try {
			await api(`/api/admin/graves/${graveId}`, {
				method: 'PATCH',
				body: JSON.stringify({ status }),
			})
			await onRefresh?.()
		} finally {
			setGraveEditLoadingId(null)
		}
	}

	async function updateGravePublish(graveId, patch) {
		setGraveEditLoadingId(graveId)
		try {
			await api(`/api/admin/graves/${graveId}`, {
				method: 'PATCH',
				body: JSON.stringify(patch),
			})
			await onRefresh?.()
		} finally {
			setGraveEditLoadingId(null)
		}
	}

	// Grilla por sector (para crear filas/columnas y previsualizar)
	const [gridSectorId, setGridSectorId] = useState('')
	const [gridRows, setGridRows] = useState('')
	const [gridCols, setGridCols] = useState('')
	const [gridPrice, setGridPrice] = useState('')
	const [gridGraveTypeId, setGridGraveTypeId] = useState('')
	const [gridLoading, setGridLoading] = useState(false)
	const [gridMsg, setGridMsg] = useState('')

	const [mapLoading, setMapLoading] = useState(false)
	const [mapError, setMapError] = useState('')
	const [_mapSectors, setMapSectors] = useState([])
	const [_mapSectorId, setMapSectorId] = useState(null)
	const [mapGraves, setMapGraves] = useState([])

	// Ubicación general del cementerio (mapa general)
	const [cemName, setCemName] = useState('')
	const [cemAddress, setCemAddress] = useState('')
	const [cemLat, setCemLat] = useState('')
	const [cemLng, setCemLng] = useState('')
	const [cemLoading, setCemLoading] = useState(false)
	const [cemSaving, setCemSaving] = useState(false)
	const [cemMsg, setCemMsg] = useState('')
	const [cemPreviewOpen, setCemPreviewOpen] = useState(false)
	const [cemPreviewEverOpened, setCemPreviewEverOpened] = useState(false)
	const [cemPinnedHref, setCemPinnedHref] = useState(null)
	const [cemMapsLoading, setCemMapsLoading] = useState(false)
	const [cemMapsError, setCemMapsError] = useState('')
	const [cemMapsReady, setCemMapsReady] = useState(false)
	const [cemUseNewPlacesWidget, setCemUseNewPlacesWidget] = useState(false)
	const cemAddressInputRef = useRef(null)
	const cemPlaceWidgetHostRef = useRef(null)
	const cemPlaceWidgetRef = useRef(null)
	const cemMapDivRef = useRef(null)
	const cemMapRef = useRef(null)
	const cemMarkerRef = useRef(null)
	const cemAutocompleteRef = useRef(null)
	const cemGeocoderRef = useRef(null)
	const cemGmapsListenerCleanupRef = useRef(null)

	const cemCoords = useMemo(() => {
		const lat = normalizeNumber(cemLat)
		const lng = normalizeNumber(cemLng)
		return { lat, lng, hasBoth: lat != null && lng != null }
	}, [cemLat, cemLng])

	function pinCemeteryPreview(input) {
		const lat = input?.lat != null ? Number(input.lat) : null
		const lng = input?.lng != null ? Number(input.lng) : null
		const hasCoords = Number.isFinite(lat) && Number.isFinite(lng)
		const address = String(input?.address || '').trim()
		const q = hasCoords ? `${lat},${lng}` : address
		if (!q) {
			setCemPinnedHref(null)
			return
		}
		setCemPinnedHref(`https://www.google.com/maps?q=${encodeURIComponent(q)}`)
	}

	async function ensureCemeteryMapsReady() {
		if (cemMapsReady) return true
		if (cemMapsLoading) return false
		setCemMapsLoading(true)
		setCemMapsError('')
		try {
			const keyRes = await api('/api/admin/google-maps-key')
			if (!keyRes.ok) {
				if (keyRes.status === 401 || keyRes.status === 403) {
					setCemMapsError('Necesitas iniciar sesión con permisos para cargar Google Maps.')
				} else if (keyRes.status === 404) {
					setCemMapsError('Google Maps no está configurado. Define GOOGLE_MAPS_API_KEY en el backend (.env).')
				} else {
					setCemMapsError('No se pudo obtener la configuración de Google Maps.')
				}
				return false
			}
			await loadGoogleMaps(keyRes.data?.apiKey)
			setCemMapsReady(true)
			return true
		} catch (e) {
			setCemMapsError(e?.message || 'No se pudo cargar Google Maps.')
			return false
		} finally {
			setCemMapsLoading(false)
		}
	}

	function setCemeteryCoordsFromLatLng(lat, lng) {
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
		setCemLat(String(lat))
		setCemLng(String(lng))
		pinCemeteryPreview({ lat, lng, address: cemAddress.trim() })
	}

	async function reverseGeocodeCemetery(lat, lng) {
		try {
			const geocoder = cemGeocoderRef.current
			if (!geocoder || !window.google?.maps) return
			const res = await geocoder.geocode({ location: { lat, lng } })
			const formatted = res?.results?.[0]?.formatted_address
			if (formatted) {
				setCemAddress(String(formatted))
				pinCemeteryPreview({ lat, lng, address: formatted })
			}
		} catch {
			// ignore
		}
	}

	function syncCemeteryMapFromState() {
		const map = cemMapRef.current
		const marker = cemMarkerRef.current
		if (!map || !marker || !window.google?.maps) return
		const { lat, lng, hasBoth } = cemCoords
		if (!hasBoth) {
			marker.setMap(null)
			return
		}
		marker.setMap(map)
		marker.setPosition({ lat, lng })
		map.setCenter({ lat, lng })
	}

	async function initCemeteryMapsUi() {
		const ok = await ensureCemeteryMapsReady()
		if (!ok) return

		// Preferir el nuevo widget PlaceAutocompleteElement (Places API nueva), si está disponible.
		if (!cemPlaceWidgetRef.current && cemPlaceWidgetHostRef.current) {
			try {
				let PlaceAutocompleteElement = window.google?.maps?.places?.PlaceAutocompleteElement
				if (!PlaceAutocompleteElement && window.google?.maps?.importLibrary) {
					const placesLib = await window.google.maps.importLibrary('places')
					PlaceAutocompleteElement = placesLib?.PlaceAutocompleteElement || window.google?.maps?.places?.PlaceAutocompleteElement
				}
				if (!PlaceAutocompleteElement) throw new Error('PlaceAutocompleteElement no disponible')

				const widget = new PlaceAutocompleteElement({})
				widget.placeholder = 'Busca un lugar (Google Places)'
				widget.style.display = 'block'
				widget.style.width = '100%'
				// Montar dentro de un contenedor “controlado” por React.
				cemPlaceWidgetHostRef.current.innerHTML = ''
				cemPlaceWidgetHostRef.current.appendChild(widget)
				cemPlaceWidgetRef.current = widget
				setCemUseNewPlacesWidget(true)
				setTimeout(() => widget.focus?.(), 0)

				// Listener oficial: gmp-select devuelve placePrediction.
				widget.addEventListener('gmp-select', async (e) => {
					try {
						const placePrediction = e?.placePrediction || e?.detail?.placePrediction
						const place = placePrediction?.toPlace?.()
						if (!place?.fetchFields) return
						await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'viewport'] })
						const displayName = place.displayName ? String(place.displayName) : ''
						const formattedAddress = place.formattedAddress ? String(place.formattedAddress) : ''
						const loc = place.location || null
						const lat = typeof loc?.lat === 'function' ? loc.lat() : loc?.lat
						const lng = typeof loc?.lng === 'function' ? loc.lng() : loc?.lng

						if (displayName) setCemName(displayName)
						if (formattedAddress) setCemAddress(formattedAddress)
						if (Number.isFinite(lat) && Number.isFinite(lng)) {
							setCemLat(String(lat))
							setCemLng(String(lng))
							pinCemeteryPreview({ lat, lng, address: formattedAddress })
							const map = cemMapRef.current
							const marker = cemMarkerRef.current
							if (map && marker) {
								marker.setMap(map)
								marker.setPosition({ lat, lng })
								map.setCenter({ lat, lng })
								map.setZoom(16)
							}
						}
					} catch {
						// ignore
					}
				})
			} catch {
				// Si falla, seguimos con el fallback legacy.
			}
		}

		if (!cemAutocompleteRef.current && cemAddressInputRef.current && window.google?.maps?.places) {
			// Fallback legacy (puede estar deshabilitado para proyectos nuevos)
			if (!window.google.maps.places.Autocomplete) {
				// No disponible: dejamos el input como entrada manual.
			} else {
				const ac = new window.google.maps.places.Autocomplete(cemAddressInputRef.current, {
				fields: ['place_id', 'formatted_address', 'geometry', 'name', 'url'],
				types: ['geocode', 'establishment'],
				})
				cemAutocompleteRef.current = ac
				ac.addListener('place_changed', () => {
					const place = ac.getPlace?.()
					const name = place?.name ? String(place.name) : ''
					const address = place?.formatted_address ? String(place.formatted_address) : ''
					const lat = place?.geometry?.location?.lat?.()
					const lng = place?.geometry?.location?.lng?.()

					if (name) setCemName(name)
					if (address) setCemAddress(address)
					if (Number.isFinite(lat) && Number.isFinite(lng)) {
						setCemLat(String(lat))
						setCemLng(String(lng))
						pinCemeteryPreview({ lat, lng, address })
						const map = cemMapRef.current
						const marker = cemMarkerRef.current
						if (map && marker) {
							marker.setMap(map)
							marker.setPosition({ lat, lng })
							map.setCenter({ lat, lng })
							map.setZoom(16)
						}
					}

					if (place?.url) setCemPinnedHref(String(place.url))
				})
			}
		}

		if (!cemMapRef.current && cemMapDivRef.current && window.google?.maps) {
			try {
				const { lat, lng, hasBoth } = cemCoords
				const initialCenter = hasBoth ? { lat, lng } : { lat: -12.0464, lng: -77.0428 }
				const map = new window.google.maps.Map(cemMapDivRef.current, {
					center: initialCenter,
					zoom: hasBoth ? 16 : 13,
					mapTypeControl: false,
					streetViewControl: false,
					fullscreenControl: true,
				})
				cemMapRef.current = map
				const marker = new window.google.maps.Marker({
					map,
					position: hasBoth ? { lat, lng } : initialCenter,
					draggable: true,
				})
				if (!hasBoth) marker.setMap(null)
				cemMarkerRef.current = marker
				cemGeocoderRef.current = new window.google.maps.Geocoder()

				const onMapClick = map.addListener('click', (e) => {
					const nextLat = e?.latLng?.lat?.()
					const nextLng = e?.latLng?.lng?.()
					if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return
					setCemeteryCoordsFromLatLng(nextLat, nextLng)
					reverseGeocodeCemetery(nextLat, nextLng)
				})
				const onMarkerDrag = marker.addListener('dragend', (e) => {
					const nextLat = e?.latLng?.lat?.()
					const nextLng = e?.latLng?.lng?.()
					if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return
					setCemeteryCoordsFromLatLng(nextLat, nextLng)
					reverseGeocodeCemetery(nextLat, nextLng)
				})
				cemGmapsListenerCleanupRef.current = () => {
					try {
						onMapClick?.remove?.()
						onMarkerDrag?.remove?.()
					} catch {
						// ignore
					}
				}
			} catch (e) {
				setCemMapsError(e?.message || 'No se pudo inicializar el mapa de Google Maps.')
				return
			}
		}

		syncCemeteryMapFromState()
	}

	async function loadCemeteryLocation() {
		setCemLoading(true)
		setCemMsg('')
		try {
			const result = await api('/api/admin/cemetery-location')
			if (!result.ok) {
				setCemMsg(result.data?.error || 'No se pudo cargar la ubicación del cementerio.')
				return null
			}
			const loc = result.data?.location || null
			setCemName(loc?.name ? String(loc.name) : '')
			setCemAddress(loc?.address ? String(loc.address) : '')
			setCemLat(loc?.latitude != null ? String(loc.latitude) : '')
			setCemLng(loc?.longitude != null ? String(loc.longitude) : '')
			pinCemeteryPreview({
				lat: loc?.latitude,
				lng: loc?.longitude,
				address: loc?.address,
			})
			// Si el mapa ya está listo, sincronizar el pin.
			queueMicrotask(() => syncCemeteryMapFromState())
			return loc
		} finally {
			setCemLoading(false)
		}
	}

	async function saveCemeteryLocation(e) {
		e?.preventDefault()
		setCemMsg('')

		const name = cemName.trim() ? cemName.trim() : null
		const address = cemAddress.trim() ? cemAddress.trim() : null
		const { lat, lng } = cemCoords
		const hasLat = lat != null
		const hasLng = lng != null
		if (hasLat !== hasLng) {
			setCemMsg('Completa latitud y longitud (o deja ambos vacíos).')
			return
		}
		if (lat != null && (lat < -90 || lat > 90)) {
			setCemMsg('Latitud inválida (rango: -90 a 90).')
			return
		}
		if (lng != null && (lng < -180 || lng > 180)) {
			setCemMsg('Longitud inválida (rango: -180 a 180).')
			return
		}
		setCemSaving(true)
		try {
			const result = await api('/api/admin/cemetery-location', {
				method: 'PUT',
				body: JSON.stringify({
					name,
					address,
					latitude: lat,
					longitude: lng,
				}),
			})
			if (!result.ok) {
				setCemMsg(result.data?.error || 'No se pudo guardar la ubicación del cementerio.')
				return
			}
			setCemMsg('Ubicación del cementerio guardada.')
			pinCemeteryPreview({ lat, lng, address })
		} finally {
			setCemSaving(false)
		}
	}

	async function toggleCemeteryPreview() {
		const next = !cemPreviewOpen
		setCemPreviewOpen(next)
		if (!next) return
		if (!cemPreviewEverOpened) setCemPreviewEverOpened(true)
		await initCemeteryMapsUi()
		// Asegurar que el mapa se renderice bien al mostrarse.
		try {
			const map = cemMapRef.current
			if (map && window.google?.maps?.event?.trigger) {
				requestAnimationFrame(() => {
					window.google.maps.event.trigger(map, 'resize')
					syncCemeteryMapFromState()
				})
			}
		} catch {
			// ignore
		}
	}

	useEffect(() => {
		if (!cemPreviewEverOpened) return
		initCemeteryMapsUi()
		return () => {
			// no destruimos el SDK global; solo limpiamos listeners locales
			try {
				cemGmapsListenerCleanupRef.current?.()
			} catch {
				// ignore
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [cemPreviewEverOpened])

	useEffect(() => {
		if (!cemPreviewEverOpened) return
		syncCemeteryMapFromState()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [cemCoords.lat, cemCoords.lng, cemPreviewEverOpened])

	useEffect(() => {
		if (!gridSectorId && filteredSectors.length > 0) {
			setGridSectorId(String(filteredSectors[0].id))
		}
	}, [gridSectorId, filteredSectors])

	useEffect(() => {
		if (activeBranchIdN == null) return
		if (graveSectorId && !filteredSectors.some((s) => String(s.id) === String(graveSectorId))) {
			setGraveSectorId('')
		}
		if (gridSectorId && !filteredSectors.some((s) => String(s.id) === String(gridSectorId))) {
			setGridSectorId(filteredSectors[0] ? String(filteredSectors[0].id) : '')
		}
	}, [activeBranchIdN, filteredSectors, graveSectorId, gridSectorId])

	useEffect(() => {
		if (!gridSectorId) return
		loadAdminMap(Number(gridSectorId))
	}, [gridSectorId])

	const currentMaxRow = useMemo(() => {
		const rows = mapGraves.map((g) => Number(g.row_number)).filter((n) => Number.isFinite(n))
		return rows.length ? Math.max(...rows) : 0
	}, [mapGraves])

	const currentMaxCol = useMemo(() => {
		const cols = mapGraves.map((g) => Number(g.col_number)).filter((n) => Number.isFinite(n))
		return cols.length ? Math.max(...cols) : 0
	}, [mapGraves])

	const mapCols = useMemo(() => {
		return Math.max(currentMaxCol, 0)
	}, [currentMaxCol])

	function computeCellState(g) {
		if (!g) return 'maintenance'
		if (g.has_burial || g.grave_status === 'occupied') return 'occupied'
		if (g.active_reservation_status === 'confirmed' || g.grave_status === 'reserved') return 'confirmed'
		if (g.active_reservation_status === 'pending') return 'pending'
		if (g.grave_status === 'maintenance' || g.is_enabled === false) return 'maintenance'
		return 'available'
	}

	function displayCellNumber(g) {
		const r = Number(g?.row_number)
		const c = Number(g?.col_number)
		if (!Number.isFinite(r) || !Number.isFinite(c) || !Number.isFinite(mapCols) || mapCols <= 0) return ''
		return String((r - 1) * mapCols + c)
	}

	async function loadAdminMap(sectorId) {
		setMapLoading(true)
		setMapError('')
		try {
			const params = new URLSearchParams()
			params.set('sectorId', String(sectorId))
			if (activeBranchIdN != null) params.set('branchId', String(activeBranchIdN))
			const result = await api(`/api/admin/grave-map?${params.toString()}`)
			if (!result.ok) {
				setMapError(result.data?.error || 'No se pudo cargar el mapa')
				setMapSectors([])
				setMapSectorId(null)
				setMapGraves([])
				return
			}
			setMapSectors(Array.isArray(result.data?.sectors) ? result.data.sectors : [])
			setMapSectorId(result.data?.sectorId ?? null)
			setMapGraves(Array.isArray(result.data?.graves) ? result.data.graves : [])
		} finally {
			setMapLoading(false)
		}
	}

	async function generateGrid(e) {
		e?.preventDefault()
		setGridLoading(true)
		setGridMsg('')
		try {
			const sectorId = Number(gridSectorId)
			if (!Number.isFinite(sectorId)) {
				setGridMsg('Selecciona un sector')
				return
			}

			const rows = normalizeNumber(gridRows)
			const cols = normalizeNumber(gridCols)
			if (!Number.isFinite(rows) || rows < 1) {
				setGridMsg('Filas inválidas')
				return
			}
			if (!Number.isFinite(cols) || cols < 1) {
				setGridMsg('Columnas inválidas')
				return
			}

			const priceCents = gridPrice.trim() ? Math.round(Number(gridPrice) * 100) : 0
			if (!Number.isFinite(priceCents) || priceCents < 0) {
				setGridMsg('Precio inválido')
				return
			}

			const body = {
				rows,
				cols,
				priceCents,
				graveTypeId: gridGraveTypeId ? Number(gridGraveTypeId) : null,
				isEnabled: true,
			}
			const result = await api(`/api/admin/sectors/${sectorId}/grid`, {
				method: 'POST',
				body: JSON.stringify(body),
			})
			if (!result.ok) {
				setGridMsg(result.data?.error || 'No se pudo generar la grilla')
				return
			}
			setGridMsg(`Listo: +${result.data?.createdGraves ?? 0} parcelas creadas`) 
			await onRefresh?.()
			await loadAdminMap(sectorId)
		} finally {
			setGridLoading(false)
		}
	}

	return (
		<Card title="Gestionar tumbas">
			<form className="space-y-2" onSubmit={saveCemeteryLocation}>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<div className="text-xs text-[color:var(--text)]">Ubicación del cementerio (mapa general)</div>
					<div className="flex items-center justify-end gap-2">
						<button
							type="button"
							onClick={loadCemeteryLocation}
							disabled={cemLoading}
							className="inline-flex h-10 items-center rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 text-sm font-medium text-[color:var(--text-h)] hover:bg-[color:var(--hover)] disabled:opacity-50"
						>
							{cemLoading ? 'Cargando…' : 'Cargar'}
						</button>
						<button
							disabled={cemSaving}
							className="inline-flex h-10 items-center rounded-md bg-[color:var(--accent)] px-3 text-sm font-medium text-white disabled:opacity-50"
						>
							{cemSaving ? 'Guardando…' : 'Guardar'}
						</button>
						<button
							type="button"
							onClick={toggleCemeteryPreview}
							disabled={cemMapsLoading}
							className={
								'inline-flex h-10 items-center rounded-md border px-3 text-sm font-medium disabled:opacity-50 ' +
								(cemPreviewOpen
									? 'border-[color:var(--accent-border)] bg-[color:var(--accent-bg)] text-[color:var(--text-h)]'
									: 'border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-h)] hover:bg-[color:var(--hover)]')
							}
						>
							{cemPreviewOpen ? 'Ocultar mapa' : 'Abrir mapa'}
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

				<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
					<div className="space-y-2">
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
							<input
								value={cemName}
								onChange={(e) => setCemName(e.target.value)}
								className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
								placeholder="Nombre (autocompleta al seleccionar)"
							/>
							<div
								ref={cemPlaceWidgetHostRef}
								className="w-full"
								style={{ display: cemUseNewPlacesWidget ? 'block' : 'none' }}
								onMouseDown={() => initCemeteryMapsUi()}
							/>
							<input
								ref={cemAddressInputRef}
								value={cemAddress}
								onChange={(e) => setCemAddress(e.target.value)}
								onFocus={() => initCemeteryMapsUi()}
								className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
								style={{ display: cemUseNewPlacesWidget ? 'none' : 'block' }}
								placeholder="Busca un lugar (Google Places)"
								autoComplete="off"
							/>
						</div>
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
							<input
								value={cemLat}
								onChange={(e) => setCemLat(e.target.value)}
								className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
								placeholder="Latitud"
								inputMode="decimal"
							/>
							<input
								value={cemLng}
								onChange={(e) => setCemLng(e.target.value)}
								className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
								placeholder="Longitud"
								inputMode="decimal"
							/>
						</div>
						<div className="text-xs text-[color:var(--text)]">
							Tip: selecciona un lugar desde el autocomplete para autocompletar. También puedes hacer click en el mapa o arrastrar el pin.
						</div>
						{cemMapsError ? <div className="text-xs text-[color:var(--text)]">{cemMapsError}</div> : null}
						{cemMapsLoading ? <div className="text-xs text-[color:var(--text)]">Cargando Google Maps…</div> : null}
						{cemMsg ? <div className="text-xs text-[color:var(--text)]">{cemMsg}</div> : null}
					</div>

					{cemPreviewEverOpened ? (
						<div className={cemPreviewOpen ? '' : 'hidden'}>
							<div className="overflow-hidden rounded-md border border-[color:var(--border)] bg-[color:var(--surface-2)]">
								<div ref={cemMapDivRef} className="h-[420px] w-full" />
							</div>
							<div className="mt-2 text-xs text-[color:var(--text)]">Se carga una vez y luego solo se oculta.</div>
						</div>
					) : (
						<div className="hidden" />
					)}
				</div>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<div className="text-xs text-[color:var(--text)]">
						{cemPinnedHref ? 'Listo para mostrar en cliente.' : 'Guarda una dirección o coordenadas para habilitar el mapa.'}
					</div>
					<div className="text-xs text-[color:var(--text)]">{cemCoords.hasBoth ? `Pin: ${cemCoords.lat}, ${cemCoords.lng}` : 'Sin pin (puedes seleccionar un lugar o usar el mapa).'} </div>
				</div>
			</form>

			<form className="space-y-2" onSubmit={createSector}>
				<div className="space-y-2">
					<div className="text-xs text-[color:var(--text)]">Sucursal</div>
					{Array.isArray(branches) && branches.length > 0 ? (
						<select
							value={activeBranchId}
							onChange={(e) => setActiveBranchId(e.target.value)}
							className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
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
					<div className="text-xs text-[color:var(--text)]">
						Los sectores, grillas y el listado se filtran por sucursal.
					</div>
				</div>
				<div className="text-xs text-[color:var(--text)]">Crear sector</div>
				<div className="flex gap-2">
					<input
						value={sectorName}
						onChange={(e) => setSectorName(e.target.value)}
						className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
						placeholder="A"
					/>
					<button
						disabled={!canCreateSector || sectorLoading}
						className="rounded-md bg-[color:var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
					>
						{sectorLoading ? 'Creando…' : 'Crear'}
					</button>
				</div>
				<button
					type="button"
					onClick={ensureDefaultSectors}
					disabled={sectorLoading}
					className="w-full rounded-md border border-[color:var(--border)] px-3 py-2 text-sm text-[color:var(--text-h)] hover:bg-[color:var(--hover)] disabled:opacity-50"
				>
					Crear sectores A–D
				</button>
				{sectorMsg && <p className="text-xs text-[color:var(--text)]">{sectorMsg}</p>}
			</form>

			<form className="space-y-2" onSubmit={createGrave}>
				<div className="text-xs text-[color:var(--text)]">Crear tumba</div>
				<div className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--text)]">
					Código: <span className="font-medium text-[color:var(--text-h)]">se genera automáticamente</span> (t-0001, t-0002…)
				</div>
				<div className="grid grid-cols-3 gap-2">
					<select
						value={graveSectorId}
						onChange={(e) => setGraveSectorId(e.target.value)}
						className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
					>
						<option value="">Sector</option>
						{filteredSectors.map((s) => (
							<option key={s.id} value={String(s.id)}>
								{s.name}
							</option>
						))}
					</select>
					<input
						value={graveRow}
						onChange={(e) => setGraveRow(e.target.value)}
						className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
						placeholder="Fila"
						inputMode="numeric"
					/>
					<input
						value={graveCol}
						onChange={(e) => setGraveCol(e.target.value)}
						className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
						placeholder="Col"
						inputMode="numeric"
					/>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<input
						value={gravePrice}
						onChange={(e) => setGravePrice(e.target.value)}
						className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
						placeholder="Precio (PEN)"
						inputMode="decimal"
					/>
					<label className="flex items-center gap-2 rounded-md border border-[color:var(--border)] px-3 py-2 text-sm text-[color:var(--text)]">
						<input type="checkbox" checked={graveEnabled} onChange={(e) => setGraveEnabled(e.target.checked)} />
						Habilitado
					</label>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<select
						value={graveTypeId}
						onChange={(e) => setGraveTypeId(e.target.value)}
						className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
					>
						<option value="">Tipo</option>
						{graveTypes.map((t) => (
							<option key={t.id} value={String(t.id)}>
								{t.name}
							</option>
						))}
					</select>
					<select
						value={graveStatus}
						onChange={(e) => setGraveStatus(e.target.value)}
						className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
					>
						<option value="available">available</option>
						<option value="reserved">reserved</option>
						<option value="occupied">occupied</option>
						<option value="maintenance">maintenance</option>
					</select>
				</div>
				<input
					value={graveNotes}
					onChange={(e) => setGraveNotes(e.target.value)}
					className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
					placeholder="Notas (opcional)"
				/>
				<button
					disabled={!canCreateGrave || graveLoading}
					className="w-full rounded-md bg-[color:var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
				>
					{graveLoading ? 'Creando…' : 'Crear tumba'}
				</button>
				{graveMsg && <p className="text-xs text-[color:var(--text)]">{graveMsg}</p>}
			</form>

			<form className="space-y-2" onSubmit={generateGrid}>
				<div className="text-xs text-[color:var(--text)]">Grilla por sector (filas/columnas)</div>
				<div className="grid grid-cols-3 gap-2">
					<select
						value={gridSectorId}
						onChange={(e) => setGridSectorId(e.target.value)}
						className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
					>
						<option value="">Sector</option>
						{filteredSectors.map((s) => (
							<option key={s.id} value={String(s.id)}>
								{s.name}
							</option>
						))}
					</select>
					<input
						value={gridRows}
						onChange={(e) => setGridRows(e.target.value)}
						className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
						placeholder={currentMaxRow ? `Filas (actual ${currentMaxRow})` : 'Filas'}
						inputMode="numeric"
					/>
					<input
						value={gridCols}
						onChange={(e) => setGridCols(e.target.value)}
						className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
						placeholder={currentMaxCol ? `Cols (actual ${currentMaxCol})` : 'Cols'}
						inputMode="numeric"
					/>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<input
						value={gridPrice}
						onChange={(e) => setGridPrice(e.target.value)}
						className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
						placeholder="Precio por parcela (PEN)"
						inputMode="decimal"
					/>
					<select
						value={gridGraveTypeId}
						onChange={(e) => setGridGraveTypeId(e.target.value)}
						className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
					>
						<option value="">Tipo</option>
						{graveTypes.map((t) => (
							<option key={t.id} value={String(t.id)}>
								{t.name}
							</option>
						))}
					</select>
				</div>
				<button
					disabled={gridLoading || !gridSectorId}
					className="w-full rounded-md bg-[color:var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
				>
					{gridLoading ? 'Generando…' : 'Generar / agregar celdas'}
				</button>
				{gridMsg && <p className="text-xs text-[color:var(--text)]">{gridMsg}</p>}
			</form>

			<div className="text-xs text-[color:var(--text)]">Mapa (cuadro por cuadro)</div>
			<div className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-2)] p-3">
				{mapLoading && <div className="text-sm text-[color:var(--text)]">Cargando mapa…</div>}
				{mapError && <div className="text-sm text-red-600">{mapError}</div>}
				{!mapLoading && !mapError && mapGraves.length === 0 && (
					<div className="text-sm text-[color:var(--text)]">Aún no hay parcelas en este sector.</div>
				)}
				{!mapLoading && !mapError && mapGraves.length > 0 && (
					<div>
						<div
							className="ui-grave-grid"
							style={{ gridTemplateColumns: `repeat(${Math.max(mapCols || 6, 1)}, var(--cell-w))` }}
						>
							{mapGraves.map((g) => (
								<div key={g.id} className="ui-grave-cell" data-state={computeCellState(g)} title={g.code}>
									{displayCellNumber(g) || '•'}
								</div>
							))}
						</div>
						<div className="ui-grave-legend">
							<div className="ui-grave-legend__item">
								<span className="ui-grave-legend__swatch" style={{ background: 'color-mix(in oklab, var(--az4) 16%, var(--surface))' }} />
								Disponible
							</div>
							<div className="ui-grave-legend__item">
								<span className="ui-grave-legend__swatch" style={{ background: 'color-mix(in oklab, var(--az4) 22%, var(--surface))' }} />
								Reservada (pendiente)
							</div>
							<div className="ui-grave-legend__item">
								<span className="ui-grave-legend__swatch" style={{ background: 'color-mix(in oklab, var(--az3) 85%, var(--surface))' }} />
								Confirmada
							</div>
							<div className="ui-grave-legend__item">
								<span className="ui-grave-legend__swatch" style={{ background: 'color-mix(in oklab, var(--az1) 92%, var(--surface))' }} />
								Ingresado (ocupada)
							</div>
						</div>
					</div>
				)}
			</div>

			<div className="text-xs text-[color:var(--text)]">Últimas tumbas</div>
			<div className="flex items-center justify-between gap-2">
				<div className="text-xs text-[color:var(--text)]">Últimas tumbas</div>
				<div className="flex items-center gap-2">
					{grNewCount > 0 && (
						<span className="rounded-full bg-[color:var(--surface-2)] px-2 py-1 text-[11px] font-medium text-[color:var(--az2)]">
							Nuevos: {grNewCount}
						</span>
					)}
					<button
						type="button"
						onClick={() => setGrSeenMaxId(grCurrentMaxId || null)}
						disabled={filteredGraves.length === 0 || grCurrentMaxId === 0 || grNewCount === 0}
						className="rounded-md border border-[color:var(--border)] px-2 py-1 text-xs text-[color:var(--text-h)] hover:bg-[color:var(--hover)] disabled:opacity-50"
					>
						Marcar vistos
					</button>
					<button
						type="button"
						onClick={doRefreshGravesList}
						disabled={grRefreshLoading}
						className="rounded-md border border-[color:var(--border)] px-2 py-1 text-xs text-[color:var(--text-h)] hover:bg-[color:var(--hover)] disabled:opacity-50"
					>
						{grRefreshLoading ? 'Actualizando…' : 'Actualizar'}
					</button>
				</div>
			</div>
			<div className="flex flex-wrap gap-3 text-[11px] text-[color:var(--text)]">
				<div className="flex items-center gap-2">
					<span className={`inline-block h-2 w-2 rounded-full ${graveStatusUi('available').dot}`} />
					Disponible
				</div>
				<div className="flex items-center gap-2">
					<span className={`inline-block h-2 w-2 rounded-full ${graveStatusUi('reserved').dot}`} />
					Reservada
				</div>
				<div className="flex items-center gap-2">
					<span className={`inline-block h-2 w-2 rounded-full ${graveStatusUi('occupied').dot}`} />
					Ocupada
				</div>
				<div className="flex items-center gap-2">
					<span className="inline-block h-2 w-2 rounded-full bg-[color:var(--az4)]" style={{ opacity: 0.35 }} />
					Nuevo
				</div>
			</div>
			<div className="max-h-[420px] overflow-y-auto rounded-md border border-[color:var(--border)] md:max-h-[560px]">
				{filteredGraves.length === 0 ? (
					<div className="p-3 text-sm text-[color:var(--text)]">Sin tumbas.</div>
				) : (
					filteredGraves.slice(0, 200).map((g) => (
						<div
							key={g.id}
							className="border-b border-[color:var(--border)] p-3 last:border-b-0"
						>
							<div className="flex items-center justify-between gap-2">
								<div>
									<div className="text-sm font-medium text-[color:var(--text-h)]">
										<span className={Number(g.id) > Number(grSeenMaxId || 0) ? 'text-[color:var(--az2)]' : ''}>{g.code}</span>
										{Number(g.id) > Number(grSeenMaxId || 0) && (
											<span className="ml-2 rounded-full bg-[color:var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--az2)]">
												NUEVO
											</span>
										)}
									</div>
									<div className="text-xs text-[color:var(--text)]">
										{g.sector_name ? g.sector_name : '—'}
										{g.branch_name ? ` · ${g.branch_name}` : ''}
										{g.row_number != null ? ` / Fila ${g.row_number}` : ''}
										{g.col_number != null ? ` / Col ${g.col_number}` : ''} · {g.status}
										{g.latitude != null && g.longitude != null ? ` · ${g.latitude}, ${g.longitude}` : ''}
									</div>
									<div className="text-xs text-[color:var(--text)]">
										Precio:{' '}
										<span className="font-medium text-[color:var(--text-h)]">{formatMoney(g.price_cents, 'PEN')}</span> ·{' '}
										<span className={g.is_enabled === false ? 'text-red-600' : 'text-[color:var(--text)]'}>
											{g.is_enabled === false ? 'Deshabilitado' : 'Habilitado'}
										</span>
									</div>
								</div>
								<div className="flex flex-col items-end gap-2">
									<select
										value={g.status}
										onChange={(e) => updateGraveStatus(g.id, e.target.value)}
										disabled={graveEditLoadingId === g.id}
										className={
											'rounded-md border px-2 py-1 text-xs disabled:opacity-50 ' + graveStatusUi(g.status).className
										}
									>
										<option value="available">available</option>
										<option value="reserved">reserved</option>
										<option value="occupied">occupied</option>
										<option value="maintenance">maintenance</option>
									</select>
									<label className="flex items-center justify-end gap-2 text-xs text-[color:var(--text)]">
										<input
											type="checkbox"
											checked={g.is_enabled !== false}
											disabled={graveEditLoadingId === g.id}
											onChange={(e) => updateGravePublish(g.id, { isEnabled: e.target.checked })}
										/>
										Habilitado
									</label>
									<button
										type="button"
										onClick={() => {
											if (Number(locEditId) === Number(g.id)) closeLocationEditor()
											else openLocationEditor(g)
										}}
										className={
											'rounded-md border px-2 py-1 text-xs text-[color:var(--text-h)] hover:bg-[color:var(--hover)] ' +
											(Number(locEditId) === Number(g.id)
												? 'border-[color:var(--accent-border)] bg-[color:var(--accent-bg)]'
												: 'border-[color:var(--border)]')
										}
									>
										Ubicación
									</button>
								</div>
							</div>

							{Number(locEditId) === Number(g.id) ? (
								<div className="mt-3 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-2)] p-3">
									<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
										<div>
											<div className="text-xs font-semibold text-[color:var(--text-h)]">Ubicación (Google Maps)</div>
											<div className="mt-1 text-xs text-[color:var(--text)]">
												Edita lat/lng y guarda. La vista previa se carga solo si la abres.
											</div>
										</div>
										<div className="flex items-center justify-end gap-2">
											<button
												type="button"
												onClick={saveLocationForEditingGrave}
												disabled={locSaving || !editingGrave || Number(editingGrave?.id) !== Number(g.id)}
												className="inline-flex h-10 items-center rounded-md bg-[color:var(--accent)] px-3 text-sm font-medium text-[color:var(--on-accent)] disabled:opacity-50"
											>
												{locSaving ? 'Guardando…' : 'Guardar'}
											</button>
											<button
												type="button"
												onClick={closeLocationEditor}
												className="inline-flex h-10 items-center rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 text-sm font-medium text-[color:var(--text-h)] hover:bg-[color:var(--hover)]"
											>
												Cerrar
											</button>
										</div>
									</div>

									<div className="mt-3 grid grid-cols-2 gap-2">
										<input
											value={locLat}
											onChange={(e) => setLocLat(e.target.value)}
											className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
											placeholder="Latitud (ej. -12.0464)"
											inputMode="decimal"
										/>
										<input
											value={locLng}
											onChange={(e) => setLocLng(e.target.value)}
											className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
											placeholder="Longitud (ej. -77.0428)"
											inputMode="decimal"
										/>
									</div>
									{locMsg ? <div className="mt-2 text-xs text-[color:var(--text)]">{locMsg}</div> : null}

									<div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
										<div className="text-xs text-[color:var(--text)]">
											{locInputCoords.hasBoth
												? 'Tip: usa “Abrir” para verificar el pin exacto.'
												: 'Para ver el mapa, completa latitud y longitud.'}
										</div>
										<div className="flex items-center justify-end gap-2">
											<button
												type="button"
												onClick={toggleLocationMapPreview}
												disabled={!locInputCoords.hasBoth}
												className={
												'inline-flex h-10 items-center rounded-md border px-3 text-sm font-medium disabled:opacity-50 ' +
												(locMapOpen
													? 'border-[color:var(--accent-border)] bg-[color:var(--accent-bg)] text-[color:var(--text-h)]'
													: 'border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-h)] hover:bg-[color:var(--hover)]')
											}
											>
												{locMapOpen ? 'Ocultar mapa' : 'Mostrar mapa'}
											</button>
											{locInputCoords.hasBoth ? (
												<a
													href={`https://www.google.com/maps?q=${encodeURIComponent(`${locInputCoords.lat},${locInputCoords.lng}`)}`}
													target="_blank"
													rel="noreferrer"
													className="inline-flex h-10 items-center rounded-md bg-[color:var(--accent)] px-3 text-sm font-medium text-[color:var(--on-accent)]"
												>
													Abrir
												</a>
											) : null}
										</div>
									</div>

									{locMapEverOpened && locPreview ? (
										<div className={locMapOpen ? 'mt-3' : 'mt-3 hidden'}>
											<div className="overflow-hidden rounded-md border border-[color:var(--border)] bg-[color:var(--surface)]">
												<iframe
													title="Vista previa de ubicación en Google Maps"
													src={`https://www.google.com/maps?q=${encodeURIComponent(`${locPreview.lat},${locPreview.lng}`)}&z=18&output=embed`}
													className="block h-[280px] w-full"
													loading="lazy"
													referrerPolicy="no-referrer-when-downgrade"
													allowFullScreen
												/>
											</div>
											<div className="mt-2 text-xs text-[color:var(--text)]">
												Para evitar recargas, la vista previa se fija al momento de abrirla.
											</div>
										</div>
									) : null}
								</div>
							) : null}
						</div>
					))
				)}
			</div>
		</Card>
	)
}
