let googleMapsLoaderPromise = null

/**
 * Carga Google Maps JavaScript API (incluye Places) una sola vez por sesión.
 * La API key termina en el navegador; protégela con restricciones de HTTP referrer.
 */
export function loadGoogleMaps(apiKey) {
	if (typeof window === 'undefined') {
		return Promise.reject(new Error('Google Maps solo está disponible en el navegador'))
	}
	const trimmedKey = String(apiKey || '').trim()
	if (!trimmedKey) {
		return Promise.reject(new Error('Falta API key de Google Maps'))
	}

	if (window.google?.maps?.places && typeof window.google?.maps?.Map === 'function') return Promise.resolve(window.google)
	if (googleMapsLoaderPromise) return googleMapsLoaderPromise

	googleMapsLoaderPromise = (async () => {
		const existing = document.querySelector('script[data-gmaps-sdk="1"]')
		if (existing) {
			await new Promise((resolve, reject) => {
				// Si ya terminó de cargar, continuamos.
				if (window.google?.maps) {
					resolve(true)
					return
				}
				existing.addEventListener('load', () => resolve(true), { once: true })
				existing.addEventListener('error', () => reject(new Error('No se pudo cargar Google Maps')), { once: true })
			})
		} else {
			await new Promise((resolve, reject) => {
				const script = document.createElement('script')
				script.async = true
				script.defer = true
				script.dataset.gmapsSdk = '1'
				script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(trimmedKey)}&loading=async&libraries=places&v=weekly`
				script.onload = () => resolve(true)
				script.onerror = () => reject(new Error('No se pudo cargar Google Maps'))
				document.head.appendChild(script)
			})
		}

		const google = window.google
		if (!google?.maps) throw new Error('Google Maps cargó, pero no está disponible')

		// Con `loading=async`, el bootstrap puede terminar antes de que las clases
		// (p.ej. Map) estén listas; importLibrary garantiza que estén disponibles.
		if (typeof google.maps.importLibrary === 'function') {
			await google.maps.importLibrary('maps')
			await google.maps.importLibrary('places')
		}

		if (typeof google.maps.Map !== 'function') {
			throw new Error('Google Maps no está listo (Map no disponible)')
		}

		return google
	})()

	return googleMapsLoaderPromise
}
