import { useEffect, useMemo, useRef, useState } from 'react'

function recordKey(r) {
	const id = r?.id
	if (id != null) return `resv-${id}`
	if (r?.reservation_code) return `rsv-${r.reservation_code}`
	if (r?.grave_code) return `grave-${r.grave_code}`
	if (r?.deceased_full_name) return `name-${r.deceased_full_name}`
	return 'unknown'
}

function clamp(n, min, max) {
	return Math.max(min, Math.min(max, n))
}

function asName(r) {
	const grave = String(r?.grave_code || r?.code || '').trim()
	if (grave) return `Tumba ${grave}`
	return (
		r?.deceased_full_name ||
		r?.deceased_name ||
		r?.deceasedFullName ||
		`${r?.last_name || ''} ${r?.first_name || ''}`.trim() ||
		'Difunto'
	)
}

function toYearsLabel(r) {
	const born = r?.born_year != null ? Number(r.born_year) : null
	const died = r?.died_year != null ? Number(r.died_year) : null
	if (Number.isFinite(born) && Number.isFinite(died)) return `${born}–${died}`
	return ''
}

function stableSeedFromString(input) {
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

export function Cemetery3DView({ markers = [], selected = null, onSelect, variant = 'card' }) {
	const canvasRef = useRef(null)
	const rootRef = useRef(null)
	const rafRef = useRef(0)
	const cleanupRef = useRef(null)
	const pickedKeyRef = useRef('')
	const controlsRef = useRef({ reset: null, toggleFog: null })

	const isImmersive = variant === 'immersive'

	const [uiError, setUiError] = useState('')
	const [picked, setPicked] = useState(null)
	const [fogOn, setFogOn] = useState(isImmersive)

	const pickedLabel = useMemo(() => {
		const r = picked?.record || null
		if (!r) return null
		return {
			name: asName(r),
			years: toYearsLabel(r),
			grave: r?.grave_code ? String(r.grave_code) : '',
			sector: r?.sector_name ? String(r.sector_name) : '',
			row: r?.row_number != null ? String(r.row_number) : '',
			col: r?.col_number != null ? String(r.col_number) : '',
		}
	}, [picked])

	useEffect(() => {
		setPicked((prev) => {
			if (!selected) return prev
			const key = recordKey(selected)
			const next = markers.find((m) => String(m?.id || '') === String(key))
			return next || prev
		})
	}, [markers, selected])

	useEffect(() => {
		pickedKeyRef.current = picked ? String(picked?.id || '') : ''
		try {
			controlsRef.current?.requestRender?.()
		} catch {
			// ignore
		}
	}, [picked])

	useEffect(() => {
		let cancelled = false
		setUiError('')

		async function init() {
			const canvas = canvasRef.current
			const root = rootRef.current
			if (!canvas || !root) return

			// En Jest/JSDOM evitamos tocar WebGL/canvas para no generar ruido.
			const isJest =
				typeof process !== 'undefined' &&
				process?.env &&
				(process.env.JEST_WORKER_ID != null || process.env.NODE_ENV === 'test')
			if (isJest) return

			// Si ya había una instancia anterior (por rerender/StrictMode), limpiarla primero.
			try {
				cleanupRef.current?.()
			} catch {
				// ignore
			}

			const THREE = await import('three')
			if (cancelled) return

			function cssVar(name, fallback = '') {
				try {
					const v = getComputedStyle(document.documentElement).getPropertyValue(name)
					return (v || '').trim() || fallback
				} catch {
					return fallback
				}
			}

			function themedGreen(baseCss) {
				// Derivamos un verde claro desde un color del tema (ej. --az4), rotando el hue.
				// Esto mantiene coherencia con la paleta sin introducir “colores arbitrarios” en CSS.
				const c = new THREE.Color(baseCss)
				const hsl = { h: 0, s: 0, l: 0 }
				c.getHSL(hsl)
				c.setHSL((hsl.h + 0.33) % 1, 0.38, 0.72)
				return c
			}

			function makeNoiseTexture({ size = 256, base = '#ffffff', speckle = 0.08, lines = false } = {}) {
				const cnv = document.createElement('canvas')
				cnv.width = size
				cnv.height = size
				const ctx = cnv.getContext('2d')
				ctx.fillStyle = base
				ctx.fillRect(0, 0, size, size)
				const img = ctx.getImageData(0, 0, size, size)
				const d = img.data
				for (let i = 0; i < d.length; i += 4) {
					const n = (Math.random() - 0.5) * 255 * speckle
					d[i] = clamp(d[i] + n, 0, 255)
					d[i + 1] = clamp(d[i + 1] + n, 0, 255)
					d[i + 2] = clamp(d[i + 2] + n, 0, 255)
				}
				ctx.putImageData(img, 0, 0)

				if (lines) {
					ctx.globalAlpha = 0.14
					ctx.strokeStyle = 'rgba(0,0,0,0.35)'
					ctx.lineWidth = 1
					for (let i = 0; i < size; i += 6) {
						ctx.beginPath()
						ctx.moveTo(i + (Math.random() - 0.5) * 2, 0)
						ctx.lineTo(i + (Math.random() - 0.5) * 2, size)
						ctx.stroke()
					}
					ctx.globalAlpha = 1
				}

				const tex = new THREE.CanvasTexture(cnv)
				tex.wrapS = THREE.RepeatWrapping
				tex.wrapT = THREE.RepeatWrapping
				tex.colorSpace = THREE.SRGBColorSpace
				tex.needsUpdate = true
				return tex
			}

			let renderer
			try {
				// Importante: NO llamar canvas.getContext manualmente.
				// Si lo hacemos, podemos dejar un contexto incompatible y romper el renderer.
				renderer = new THREE.WebGLRenderer({ canvas, antialias: !isImmersive, alpha: true })
			} catch {
				setUiError('No se pudo crear WebGL. Activa aceleración por hardware o prueba otro navegador.')
				return
			}
			const dprCap = isImmersive ? 1.25 : 2
			renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap))
			renderer.shadowMap.enabled = !isImmersive
			if (!isImmersive) renderer.shadowMap.type = THREE.PCFShadowMap
			if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace

			const scene = new THREE.Scene()
			// Fondo: claro (default) o nocturno (inmersivo)
			const bgBase = new THREE.Color(cssVar('--surface-2', '#eefbf2'))
			const bgGreen = themedGreen(cssVar('--az4', '#4ade80'))
			if (isImmersive) {
				const night = new THREE.Color(cssVar('--az1', '#052e1f'))
				scene.background = night.clone().lerp(bgGreen, 0.08)
			} else {
				scene.background = bgBase.clone().lerp(bgGreen, 0.22)
			}

			const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 250)
			let theta = 0
			let phi = 0.35
			let radius = isImmersive ? 22 : 26
			let targetTheta = 0
			let targetPhi = 0.35
			let targetRadius = isImmersive ? 22 : 26
			let isRunning = false
			let needsRender = true

			let fogEnabled = isImmersive
			try {
				const fogColor = scene.background ? scene.background.clone() : new THREE.Color('#050a08')
				scene.fog = new THREE.FogExp2(fogColor.getHex(), fogEnabled ? 0.045 : 0.0)
			} catch {
				// ignore
			}

			const sun = new THREE.DirectionalLight(0xffffff, isImmersive ? 1.1 : 1.32)
			sun.position.set(12, 18, 10)
			sun.castShadow = !isImmersive
			if (!isImmersive) {
				sun.shadow.mapSize.set(2048, 2048)
				sun.shadow.camera.near = 0.5
				sun.shadow.camera.far = 80
				sun.shadow.camera.left = -25
				sun.shadow.camera.right = 25
				sun.shadow.camera.top = 25
				sun.shadow.camera.bottom = -25
			}
			scene.add(sun)

			const hemi = new THREE.HemisphereLight(
				bgBase.clone().lerp(bgGreen, isImmersive ? 0.12 : 0.25),
				bgGreen.clone().multiplyScalar(isImmersive ? 0.42 : 0.65),
				isImmersive ? 0.78 : 0.92,
			)
			scene.add(hemi)
			scene.add(new THREE.AmbientLight(0xffffff, isImmersive ? 0.24 : 0.38))

			// Césped y follaje más verdes (vivos) manteniendo un look claro.
			const grassA = themedGreen(cssVar('--az4', '#4ade80'))
			grassA.setHSL(0.33, 0.56, 0.56)
			const grassB = themedGreen(cssVar('--az2', '#064e3b')).lerp(grassA, 0.72)
			grassB.setHSL(0.33, 0.46, 0.48)
			const soil = grassB.clone().offsetHSL(0.0, 0.06, -0.18)
			const path = new THREE.Color(cssVar('--surface', '#ffffff')).lerp(new THREE.Color(cssVar('--surface-2', '#f0f4ff')), 0.55)
			const pathEdge = new THREE.Color(cssVar('--border', 'rgba(26,58,143,0.13)')).lerp(grassB, 0.35)
			const stone = new THREE.Color(cssVar('--surface', '#ffffff')).lerp(new THREE.Color(cssVar('--surface-2', '#f0f4ff')), 0.22)
			const stoneDark = stone.clone().offsetHSL(0, 0, -0.12)
			const metal = new THREE.Color(cssVar('--az1', '#052e1f')).lerp(new THREE.Color(cssVar('--az2', '#064e3b')), 0.35)

			const texSize = isImmersive ? 128 : 256
			const grassTex = makeNoiseTexture({ size: texSize, base: grassA.getStyle(), speckle: 0.06, lines: true })
			grassTex.repeat.set(8, 8)
			const gravelTex = makeNoiseTexture({ size: texSize, base: path.getStyle(), speckle: 0.1, lines: false })
			gravelTex.repeat.set(10, 10)

			const groundMat = new THREE.MeshStandardMaterial({ color: grassB, roughness: 0.98, metalness: 0.0, map: grassTex, bumpMap: grassTex, bumpScale: 0.06 })
			const soilMat = new THREE.MeshStandardMaterial({ color: soil, roughness: 1.0, metalness: 0.0 })
			const pathMat = new THREE.MeshStandardMaterial({ color: path, roughness: 0.98, metalness: 0.0, map: gravelTex, bumpMap: gravelTex, bumpScale: 0.04 })
			const pathEdgeMat = new THREE.MeshStandardMaterial({ color: pathEdge, roughness: 0.95, metalness: 0.0 })
			const stoneMat = new THREE.MeshStandardMaterial({ color: stone, roughness: 0.88, metalness: 0.02 })
			const stoneDarkMat = new THREE.MeshStandardMaterial({ color: stoneDark, roughness: 0.9, metalness: 0.02 })
			const metalMat = new THREE.MeshStandardMaterial({ color: metal, roughness: 0.65, metalness: 0.25 })
			const shadowMat = new THREE.MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0.12, roughness: 1.0, metalness: 0.0 })

			const seg = isImmersive ? 56 : 120
			const groundGeo = new THREE.PlaneGeometry(74, 74, seg, seg)
			// Relieve suave para que no se vea “plano”
			try {
				const pos = groundGeo.attributes.position
				for (let i = 0; i < pos.count; i++) {
					const x = pos.getX(i)
					const z = pos.getY(i)
					const n =
						(Math.sin((x + 11.1) * 0.22) + Math.cos((z - 7.7) * 0.24)) * 0.03 +
						(Math.sin((x + z) * 0.12) * 0.02)
					pos.setZ(i, n)
				}
				pos.needsUpdate = true
				groundGeo.computeVertexNormals()
			} catch {
				// ignore
			}
			const ground = new THREE.Mesh(groundGeo, groundMat)
			ground.rotation.x = -Math.PI / 2
			ground.receiveShadow = true
			scene.add(ground)

			// Senderos con volumen + bordes
			function addPath(w, d, x, z) {
				const body = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), pathMat)
				body.position.set(x, 0.035, z)
				body.receiveShadow = true
				scene.add(body)
				const edgeL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.045, d + 0.12), pathEdgeMat)
				edgeL.position.set(x - w / 2 - 0.06, 0.028, z)
				edgeL.receiveShadow = true
				scene.add(edgeL)
				const edgeR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.045, d + 0.12), pathEdgeMat)
				edgeR.position.set(x + w / 2 + 0.06, 0.028, z)
				edgeR.receiveShadow = true
				scene.add(edgeR)
				return { body, edgeL, edgeR }
			}

			// Layout tipo cementerio “real”: camino principal desde el portón hacia una capilla al fondo,
			// más un cruce/placita central.
			const bx = 19.5
			const bz = 14.5
			const mainPathW = 4.2
			const mainPathD = bz * 2 - 4.2
			const mainPath = addPath(mainPathW, mainPathD, 0, 0.6)
			const crossPath = addPath(18.5, 3.6, 0, -2.8)
			const plaza = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.055, 6.8), pathMat)
			plaza.position.set(0, 0.034, -6.8)
			plaza.receiveShadow = true
			scene.add(plaza)

			const gravestones = []
			const clickables = []
			const graveById = new Map()

			function markerToXZ(m, seed) {
				// markers vienen en % (0..100). Pasamos a un área cómoda.
				const mx = Number.isFinite(m?.x) ? Number(m.x) : 50
				const my = Number.isFinite(m?.y) ? Number(m.y) : 50
				const nx = (clamp(mx, 0, 100) - 50) / 50
				const nz = (clamp(my, 0, 100) - 50) / 50
				let x = nx * 14
				let z = nz * 10

				// Evitar que las tumbas queden sobre el camino principal/cruce.
				const mainHalf = mainPathW / 2
				if (Math.abs(x) < mainHalf + 0.9) {
					const side = stable01((seed ?? 0) ^ 0x27d4eb2d) < 0.5 ? -1 : 1
					x = side * (mainHalf + 2.6)
				}
				const crossZ = -2.8
				if (Math.abs(z - crossZ) < 2.3 && Math.abs(x) < 10.2) {
					const dir = stable01((seed ?? 0) ^ 0x165667b1) < 0.5 ? -1 : 1
					z = crossZ + dir * 3.2
				}

				// Mantener dentro del perímetro
				x = clamp(x, -bx + 2.5, bx - 2.5)
				z = clamp(z, -bz + 2.5, bz - 5.2)
				return { x, z }
			}

			function makeGrave(m, idx) {
				const g = new THREE.Group()
				g.userData = { marker: m }

				const seed = stableSeedFromString(String(m?.id || idx))
				const style = seed % 5

				// Acento: solo en rango verde/menta para mantener el look “claro y vivo”.
				const greenHue = 0.33 + stable01(seed) * 0.12 // ~ 120º a 163º
				const accent = new THREE.Color().setHSL(greenHue % 1, 0.42, 0.62)
				const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.62, metalness: 0.02 })

				// Base del lote (concreto) + tierra
				const plot = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.10, 3.15), stoneDarkMat)
				plot.position.y = 0.05
				plot.receiveShadow = true
				g.add(plot)

				const soilPatch = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 2.75), soilMat)
				soilPatch.position.set(0, 0.09, -0.05)
				soilPatch.receiveShadow = true
				g.add(soilPatch)

				// Sombra suave (fake) para “asentar” la tumba (sin oscurecer mucho)
				const contact = new THREE.Mesh(new THREE.CircleGeometry(1.1, 28), shadowMat)
				contact.rotation.x = -Math.PI / 2
				contact.position.y = 0.011
				g.add(contact)

				function makeHeadstoneRounded(w, h, t) {
					const shape = new THREE.Shape()
					const r = Math.min(w, h) * 0.22
					shape.moveTo(-w / 2, 0)
					shape.lineTo(-w / 2, h - r)
					shape.quadraticCurveTo(-w / 2, h, -w / 2 + r, h)
					shape.lineTo(w / 2 - r, h)
					shape.quadraticCurveTo(w / 2, h, w / 2, h - r)
					shape.lineTo(w / 2, 0)
					shape.lineTo(-w / 2, 0)
					const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 2, steps: 1 })
					geo.translate(0, 0, -t / 2)
					return geo
				}

				if (style === 0) {
					// Cruz
					const stem = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.25, 0.16), stoneMat)
					stem.position.set(0, 0.78, -1.2)
					stem.castShadow = true
					g.add(stem)
					const arm = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 0.16), stoneDarkMat)
					arm.position.set(0, 1.17, -1.2)
					arm.castShadow = true
					g.add(arm)
					const plate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.26, 0.06), accentMat)
					plate.position.set(0, 0.58, -1.07)
					plate.castShadow = true
					g.add(plate)
				} else if (style === 1) {
					// Lápida redondeada con base
					const base = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.22, 0.52), stoneDarkMat)
					base.position.set(0, 0.22, -1.18)
					base.castShadow = true
					g.add(base)
					const head = new THREE.Mesh(makeHeadstoneRounded(0.92, 1.35, 0.18), stoneMat)
					head.position.set(0, 0.32, -1.2)
					head.castShadow = true
					g.add(head)
					const badge = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.22, 0.06), accentMat)
					badge.position.set(0, 0.88, -1.05)
					badge.castShadow = true
					g.add(badge)
				} else if (style === 2) {
					// Obelisco con aro
					const pts = []
					pts.push(new THREE.Vector2(0.0, 0))
					pts.push(new THREE.Vector2(0.34, 0))
					pts.push(new THREE.Vector2(0.28, 0.76))
					pts.push(new THREE.Vector2(0.14, 1.55))
					pts.push(new THREE.Vector2(0.0, 1.8))
					const obel = new THREE.Mesh(new THREE.LatheGeometry(pts, 10), stoneMat)
					obel.rotation.y = Math.PI / 8
					obel.position.set(0, 0.18, -1.22)
					obel.castShadow = true
					g.add(obel)
					const ring = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.075, 12, 28), accentMat)
					ring.position.set(0, 0.96, -1.22)
					ring.rotation.x = Math.PI / 2
					ring.castShadow = true
					g.add(ring)
				} else if (style === 3) {
					// Losa horizontal + cabecera
					const slab = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.16, 1.75), stoneMat)
					slab.position.set(0, 0.18, -0.75)
					slab.castShadow = true
					g.add(slab)
					const head = new THREE.Mesh(makeHeadstoneRounded(0.82, 0.98, 0.16), stoneDarkMat)
					head.position.set(0, 0.24, -1.34)
					head.castShadow = true
					g.add(head)
					const badge = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.22, 0.06), accentMat)
					badge.position.set(0, 0.58, -1.2)
					badge.castShadow = true
					g.add(badge)
				} else {
					// Doble lápida (familia)
					const base = new THREE.Mesh(new THREE.BoxGeometry(1.20, 0.18, 0.62), stoneDarkMat)
					base.position.set(0, 0.20, -1.18)
					base.castShadow = true
					g.add(base)
					const left = new THREE.Mesh(makeHeadstoneRounded(0.52, 1.15, 0.14), stoneMat)
					left.position.set(-0.30, 0.30, -1.18)
					left.castShadow = true
					g.add(left)
					const right = new THREE.Mesh(makeHeadstoneRounded(0.52, 1.15, 0.14), stoneMat)
					right.position.set(0.30, 0.30, -1.18)
					right.castShadow = true
					g.add(right)
					const cap = new THREE.Mesh(new THREE.BoxGeometry(1.10, 0.12, 0.16), accentMat)
					cap.position.set(0, 1.35, -1.18)
					cap.castShadow = true
					g.add(cap)
				}

				const { x, z } = markerToXZ(m, seed)
				g.position.set(x, 0, z)
				g.rotation.y = (stable01(seed ^ 0x9e3779b9) - 0.5) * 0.12
				g.rotation.z = (stable01(seed ^ 0x85ebca6b) - 0.5) * 0.02

				graveById.set(String(m?.id || ''), g)

				// Clickables: todas las meshes del grupo excepto la sombra de contacto.
				g.traverse((o) => {
					if (o.isMesh && o !== contact) {
						o.userData.parent = g
						clickables.push(o)
					}
				})

				gravestones.push(g)
				scene.add(g)
			}

			markers.forEach((m, i) => makeGrave(m, i))

			// Muros perimetrales + portón de entrada (estilo low-poly como la referencia)
			const walls = new THREE.Group()
			const wallMat = new THREE.MeshStandardMaterial({ color: stone.clone().offsetHSL(0, 0, -0.03), roughness: 0.92, metalness: 0.0 })
			const wallH = 2.25
			const wallT = 0.75
			const gateOpening = 4.6
			const gateZ = bz + wallT / 2
			const backZ = -bz - wallT / 2
			const sideX = bx + wallT / 2

			function addWallBox(w, h, d, x, y, z) {
				const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat)
				m.position.set(x, y, z)
				m.castShadow = true
				m.receiveShadow = true
				walls.add(m)
				return m
			}

			// Laterales
			addWallBox(wallT, wallH, bz * 2 + wallT * 2, sideX, wallH / 2, 0)
			addWallBox(wallT, wallH, bz * 2 + wallT * 2, -sideX, wallH / 2, 0)
			// Fondo completo
			addWallBox(bx * 2 + wallT * 2, wallH, wallT, 0, wallH / 2, backZ)
			// Frente con apertura del portón
			const frontW = bx * 2 + wallT * 2
			const leftW = (frontW - gateOpening) / 2
			addWallBox(leftW, wallH, wallT, -(gateOpening / 2 + leftW / 2), wallH / 2, gateZ)
			addWallBox(leftW, wallH, wallT, gateOpening / 2 + leftW / 2, wallH / 2, gateZ)

			// Pilares en esquinas
			const pillarMat = new THREE.MeshStandardMaterial({ color: stoneDark.clone().offsetHSL(0, 0.01, -0.06), roughness: 0.9, metalness: 0.02 })
			const pillarGeo = new THREE.BoxGeometry(1.0, 2.65, 1.0)
			const cornerPillars = [
				[bx + wallT / 2, gateZ],
				[-bx - wallT / 2, gateZ],
				[bx + wallT / 2, backZ],
				[-bx - wallT / 2, backZ],
			]
			cornerPillars.forEach(([x, z]) => {
				const p = new THREE.Mesh(pillarGeo, pillarMat)
				p.position.set(x, 1.325, z)
				p.castShadow = true
				p.receiveShadow = true
				walls.add(p)
			})

			scene.add(walls)

			// Portón (barras)
			const gate = new THREE.Group()
			const gPillarGeo = new THREE.BoxGeometry(0.95, 2.85, 0.95)
			const gPillarL = new THREE.Mesh(gPillarGeo, pillarMat)
			gPillarL.position.set(-gateOpening / 2, 1.425, gateZ)
			gPillarL.castShadow = true
			gate.add(gPillarL)
			const gPillarR = new THREE.Mesh(gPillarGeo, pillarMat)
			gPillarR.position.set(gateOpening / 2, 1.425, gateZ)
			gPillarR.castShadow = true
			gate.add(gPillarR)
			const gBeam = new THREE.Mesh(new THREE.BoxGeometry(gateOpening + 1.3, 0.28, 0.95), pillarMat)
			gBeam.position.set(0, 2.85, gateZ)
			gBeam.castShadow = true
			gate.add(gBeam)

			const barMat = new THREE.MeshStandardMaterial({ color: metal.clone().offsetHSL(0, 0, -0.08), roughness: 0.55, metalness: 0.35 })
			const barGeo = new THREE.BoxGeometry(0.08, 1.55, 0.08)
			const barCount = 18
			for (let i = 0; i < barCount; i++) {
				const t = (i + 0.5) / barCount
				const x = -gateOpening / 2 + t * gateOpening
				const b = new THREE.Mesh(barGeo, barMat)
				b.position.set(x, 0.9, gateZ)
				b.castShadow = true
				gate.add(b)
			}
			scene.add(gate)

			// Faroles a lo largo del camino principal
			const lamps = new THREE.Group()
			const postMat = new THREE.MeshStandardMaterial({ color: metal.clone().offsetHSL(0, 0, -0.06), roughness: 0.62, metalness: 0.22 })
			const lampHeadMat = new THREE.MeshStandardMaterial({
				color: new THREE.Color('#fff6d6'),
				emissive: new THREE.Color('#ffe2a8'),
				emissiveIntensity: 0.55,
				roughness: 0.65,
				metalness: 0.05,
			})
			const post = new THREE.CylinderGeometry(0.12, 0.14, 2.25, 10)
			const head = new THREE.BoxGeometry(0.38, 0.28, 0.38)
			const zList = [7.2, 3.2, -0.8, -4.8]
			zList.forEach((z) => {
				[-2.2, 2.2].forEach((x) => {
					const p = new THREE.Mesh(post, postMat)
					p.position.set(x, 1.125, z)
					p.castShadow = true
					lamps.add(p)
					const h = new THREE.Mesh(head, lampHeadMat)
					h.position.set(x, 2.35, z)
					h.castShadow = true
					lamps.add(h)
					const light = new THREE.PointLight(0xfff2c7, 0.32, 10.5, 2)
					light.position.set(x, 2.35, z)
					lamps.add(light)
				})
			})
			scene.add(lamps)

			// Capilla/mausoleo al fondo
			const chapel = new THREE.Group()
			const chapelX = -6.5
			const chapelZ = -bz + 3.6
			const baseGeo = new THREE.BoxGeometry(6.2, 2.55, 4.2)
			const baseMesh = new THREE.Mesh(baseGeo, stoneMat)
			baseMesh.position.set(chapelX, 1.275, chapelZ)
			baseMesh.castShadow = true
			baseMesh.receiveShadow = true
			chapel.add(baseMesh)
			const roofGeo = new THREE.ConeGeometry(3.9, 1.7, 4)
			const roofMat = new THREE.MeshStandardMaterial({ color: stoneDark.clone().offsetHSL(0, 0.02, -0.05), roughness: 0.9, metalness: 0.02 })
			const roof = new THREE.Mesh(roofGeo, roofMat)
			roof.position.set(chapelX, 3.2, chapelZ)
			roof.rotation.y = Math.PI / 4
			roof.castShadow = true
			chapel.add(roof)
			const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.1), new THREE.MeshStandardMaterial({ color: metal.clone().offsetHSL(0, 0.05, -0.1), roughness: 0.8, metalness: 0.15 }))
			door.position.set(chapelX, 0.95, chapelZ + 2.15)
			door.castShadow = true
			chapel.add(door)
			const steps = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 1.2), stoneDarkMat)
			steps.position.set(chapelX, 0.11, chapelZ + 2.9)
			steps.receiveShadow = true
			chapel.add(steps)
			scene.add(chapel)

			// Un pequeño monumento al centro
			const monument = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 1.6, 10), stoneDarkMat)
			monument.position.set(2.8, 0.8, -2.8)
			monument.castShadow = true
			monument.receiveShadow = true
			scene.add(monument)

			// Árboles low-poly alrededor del perímetro (tipo ciprés)
			const trees = new THREE.Group()
			const trunkMat = new THREE.MeshStandardMaterial({ color: soil.clone().offsetHSL(0, 0.08, -0.18), roughness: 0.95, metalness: 0.0 })
			const leafMat = new THREE.MeshStandardMaterial({ color: grassA.clone().offsetHSL(0, 0.10, -0.04), roughness: 0.92, metalness: 0.0 })
			const trunkGeo = new THREE.CylinderGeometry(0.10, 0.14, 1.1, 8)
			const leafGeo = new THREE.ConeGeometry(0.48, 1.75, 10)
			const positions = [
				[-bx - 1.5, -bz - 1.0],
				[bx + 1.5, -bz - 1.0],
				[-bx - 1.5, bz + 1.0],
				[bx + 1.5, bz + 1.0],
			]
			for (let i = 0; i < 10; i++) {
				const t = i / 9
				positions.push([-bx - 1.7, -bz + t * bz * 2])
				positions.push([bx + 1.7, -bz + t * bz * 2])
			}
			positions.forEach(([x, z], i) => {
				const s = 0.9 + stable01(i * 10007) * 0.35
				const trunk = new THREE.Mesh(trunkGeo, trunkMat)
				trunk.position.set(x, 0.55, z)
				trunk.castShadow = true
				trees.add(trunk)
				const leaf = new THREE.Mesh(leafGeo, leafMat)
				leaf.position.set(x, 1.65 * s, z)
				leaf.scale.setScalar(s)
				leaf.castShadow = true
				trees.add(leaf)
			})
			scene.add(trees)

			// Indicador de selección (aro)
			const ringColor = grassA.clone().offsetHSL(0, 0.08, 0.06)
			const ringEmissive = grassA.clone().offsetHSL(0, 0.12, -0.06)
			const selectRingMat = new THREE.MeshStandardMaterial({
				color: ringColor,
				emissive: ringEmissive,
				emissiveIntensity: 0.65,
				transparent: true,
				opacity: 0.65,
				roughness: 0.9,
				metalness: 0.0,
			})
			const selectRing = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.18, 40), selectRingMat)
			selectRing.rotation.x = -Math.PI / 2
			selectRing.position.y = 0.015
			selectRing.visible = false
			scene.add(selectRing)

			const raycaster = new THREE.Raycaster()
			const mouse = new THREE.Vector2()
			let isDragging = false
			let prev = { x: 0, y: 0 }

			function requestRender() {
				needsRender = true
				if (isRunning) return
				isRunning = true
				rafRef.current = window.requestAnimationFrame(loop)
			}

			function resize() {
				const w = root.clientWidth
				const h = root.clientHeight
				renderer.setSize(w, h, false)
				camera.aspect = w / h
				camera.updateProjectionMatrix()
				requestRender()
			}

			const ro = new ResizeObserver(() => resize())
			ro.observe(root)
			resize()

			function setFromEvent(e) {
				const rect = canvas.getBoundingClientRect()
				const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
				const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
				mouse.set(x, y)
			}

			function onDown(e) {
				isDragging = true
				prev = { x: e.clientX, y: e.clientY }
				requestRender()
			}
			function onUp() {
				isDragging = false
			}
			function onMove(e) {
				if (!isDragging) return
				const dx = e.clientX - prev.x
				const dy = e.clientY - prev.y
				targetTheta -= dx * 0.008
				targetPhi = clamp(targetPhi + dy * 0.006, 0.12, 1.1)
				prev = { x: e.clientX, y: e.clientY }
				requestRender()
			}
			function onWheel(e) {
				targetRadius = clamp(targetRadius + e.deltaY * 0.03, 8, isImmersive ? 48 : 52)
				requestRender()
			}

			controlsRef.current = {
				reset: () => {
					targetTheta = 0
					targetPhi = 0.35
					targetRadius = isImmersive ? 22 : 26
					requestRender()
				},
				toggleFog: () => {
					fogEnabled = !fogEnabled
					try {
						if (!scene.fog) {
							const fogColor = scene.background ? scene.background.clone() : new THREE.Color('#050a08')
							scene.fog = new THREE.FogExp2(fogColor.getHex(), fogEnabled ? 0.045 : 0.0)
						} else {
							scene.fog.density = fogEnabled ? 0.045 : 0.0
						}
					} catch {
						// ignore
					}
					requestRender()
					return fogEnabled
				},
				requestRender,
			}

			function onClick(e) {
				setFromEvent(e)
				raycaster.setFromCamera(mouse, camera)
				const hits = raycaster.intersectObjects(clickables)
				if (hits.length > 0) {
					const g = hits[0].object?.userData?.parent
					const m = g?.userData?.marker
					if (m) {
						pickedKeyRef.current = String(m?.id || '')
						setPicked(m)
						onSelect?.(m.record)
						requestRender()
						return
					}
				}
				pickedKeyRef.current = ''
				setPicked(null)
				requestRender()
			}

			canvas.addEventListener('mousedown', onDown)
			window.addEventListener('mouseup', onUp)
			window.addEventListener('mousemove', onMove)
			canvas.addEventListener('wheel', onWheel, { passive: true })
			canvas.addEventListener('click', onClick)

			function loop() {
				const speed = isImmersive ? 0.12 : 0.07
				theta += (targetTheta - theta) * speed
				phi += (targetPhi - phi) * speed
				radius += (targetRadius - radius) * speed
				camera.position.x = radius * Math.sin(theta) * Math.cos(phi)
				camera.position.y = radius * Math.sin(phi)
				camera.position.z = radius * Math.cos(theta) * Math.cos(phi)
				camera.lookAt(0, 0.9, 0)

				const moving =
					Math.abs(targetTheta - theta) > 0.0008 ||
					Math.abs(targetPhi - phi) > 0.0008 ||
					Math.abs(targetRadius - radius) > 0.002

				const key = pickedKeyRef.current
				if (key) {
					const g = graveById.get(String(key))
					if (g) {
						selectRing.visible = true
						selectRing.position.x = g.position.x
						selectRing.position.z = g.position.z
						selectRing.rotation.z += 0.004
					} else {
						selectRing.visible = false
					}
				} else {
					selectRing.visible = false
				}

				if (needsRender || moving || isDragging) {
					needsRender = false
					renderer.render(scene, camera)
				}

				if (needsRender || moving || isDragging) {
					rafRef.current = window.requestAnimationFrame(loop)
				} else {
					isRunning = false
				}
			}
			requestRender()

			cleanupRef.current = () => {
				try {
					window.cancelAnimationFrame(rafRef.current)
				} catch {
					// ignore
				}
				try {
					canvas.removeEventListener('mousedown', onDown)
					window.removeEventListener('mouseup', onUp)
					window.removeEventListener('mousemove', onMove)
					canvas.removeEventListener('wheel', onWheel)
					canvas.removeEventListener('click', onClick)
				} catch {
					// ignore
				}
				try {
					ro.disconnect()
				} catch {
					// ignore
				}
				try {
					const disposedGeos = new Set()
					const disposedMats = new Set()
					const disposedTex = new Set()
					function disposeMaterial(mat) {
						if (!mat || disposedMats.has(mat)) return
						disposedMats.add(mat)
						for (const k of Object.keys(mat)) {
							const v = mat[k]
							if (v && v.isTexture && typeof v.dispose === 'function' && !disposedTex.has(v)) {
								disposedTex.add(v)
								v.dispose()
							}
						}
						if (typeof mat.dispose === 'function') mat.dispose()
					}
					scene.traverse((o) => {
						if (o.isMesh) {
							const geo = o.geometry
							if (geo && typeof geo.dispose === 'function' && !disposedGeos.has(geo)) {
								disposedGeos.add(geo)
								geo.dispose()
							}
							const mat = o.material
							if (Array.isArray(mat)) mat.forEach(disposeMaterial)
							else disposeMaterial(mat)
						}
					})
				} catch {
					// ignore
				}
				try {
					renderer.dispose()
				} catch {
					// ignore
				}
				cleanupRef.current = null
			}
		}

		init().catch((e) => {
			if (cancelled) return
			setUiError(e?.message || 'No se pudo iniciar la vista 3D.')
		})

		return () => {
			cancelled = true
			try {
				cleanupRef.current?.()
			} catch {
				// ignore
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [markers, isImmersive])

	function onResetCam() {
		try {
			controlsRef.current?.reset?.()
		} catch {
			// ignore
		}
	}

	function onToggleFog() {
		try {
			const next = controlsRef.current?.toggleFog?.()
			setFogOn(!!next)
		} catch {
			// ignore
		}
	}

	if (isImmersive) {
		return (
			<div className="theme-dark overflow-hidden rounded-md border border-[color:var(--border)]" style={{ background: 'var(--nav-gradient)' }}>
				<div ref={rootRef} className="relative overflow-hidden bg-black/10">
					<canvas ref={canvasRef} className="block h-[72svh] w-full md:h-[78svh]" />

					{/* Overlay UI (estilo mapaInteractivo) */}
					<div className="pointer-events-none absolute inset-0">
						<div className="absolute left-0 right-0 top-0 flex items-start justify-between gap-3 px-4 py-4">
							<div className="text-xs tracking-[0.30em] uppercase text-[color:var(--text)]">
								<div className="text-sm tracking-[0.18em]">
									<span className="bg-[var(--btn-gradient)] bg-clip-text text-transparent">Cementerio</span>
								</div>
								<div className="mt-1 text-[color:var(--text-h)]">
									<span className="font-semibold">Campo Santo</span> · 3D
								</div>
							</div>

							<div className="text-right text-[11px] tracking-[0.22em] text-[color:var(--muted)]">
								Arrastra · Rotar
								<br />
								Scroll · Zoom
								<br />
								Clic · Explorar
							</div>
						</div>

						<div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-3 px-4 py-4">
							<div className="max-w-[320px] text-xs italic leading-6 text-[color:var(--muted)]">
								"La muerte no es nada.\nSolo pasé a la habitación de al lado."
							</div>
							<div className="pointer-events-auto flex items-center gap-2">
								<button
									type="button"
									onClick={onResetCam}
									className="h-9 rounded-md border border-[color:var(--border)] bg-black/25 px-3 text-xs font-medium tracking-[0.18em] text-[color:var(--text-h)] hover:bg-black/35"
								>
									↺ Reset
								</button>
								<button
									type="button"
									onClick={onToggleFog}
									className="h-9 rounded-md border border-[color:var(--border)] bg-black/25 px-3 text-xs font-medium tracking-[0.18em] text-[color:var(--text-h)] hover:bg-black/35"
								>
									☾ Niebla {fogOn ? 'On' : 'Off'}
								</button>
							</div>
						</div>

						{pickedLabel ? (
							<div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[120%]">
								<div className="rounded-md border border-[color:var(--border)] bg-black/55 px-4 py-3 text-center backdrop-blur">
									<div className="text-sm font-semibold text-[color:var(--text-h)]">{pickedLabel.name}</div>
									<div className="mt-1 text-[11px] tracking-[0.22em] text-[color:var(--muted)]">
										{pickedLabel.years || '—'}
									</div>
									<div className="mt-2 text-xs text-[color:var(--text)]">
										{pickedLabel.grave ? `Tumba ${pickedLabel.grave}` : ''}
										{pickedLabel.sector ? ` · ${pickedLabel.sector}` : ''}
										{pickedLabel.row ? ` · Fila ${pickedLabel.row}` : ''}
										{pickedLabel.col ? ` · Col ${pickedLabel.col}` : ''}
									</div>
								</div>
							</div>
						) : null}

						{uiError ? (
							<div className="absolute left-0 right-0 top-16 px-4 text-xs text-red-300">{uiError}</div>
						) : null}
					</div>
				</div>
			</div>
		)
	}

	return (
		<div className="ui-card rounded-md p-3">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<div className="ui-kicker">Mapa</div>
					<div className="mt-0.5 text-sm font-semibold text-[color:var(--text-h)]">Vista 3D (clara)</div>
					<div className="mt-1 text-xs text-[color:var(--text)]">Arrastra para rotar · Scroll para zoom · Clic en una tumba para ver el difunto.</div>
					{uiError ? <div className="mt-1 text-xs text-red-600">{uiError}</div> : null}
				</div>

				{pickedLabel ? (
					<div className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs text-[color:var(--text)]">
						<div className="font-semibold text-[color:var(--text-h)]">{pickedLabel.name}</div>
						<div className="mt-0.5">
							{pickedLabel.years ? <span className="ui-kicker">{pickedLabel.years}</span> : null}
							{pickedLabel.grave ? <span className={pickedLabel.years ? 'ml-2' : ''}>Tumba {pickedLabel.grave}</span> : null}
							{pickedLabel.sector ? <span className="ml-2">{pickedLabel.sector}</span> : null}
							{pickedLabel.row ? <span className="ml-2">Fila {pickedLabel.row}</span> : null}
							{pickedLabel.col ? <span className="ml-2">Col {pickedLabel.col}</span> : null}
						</div>
					</div>
				) : (
					<div className="text-xs text-[color:var(--text)]">{markers.length ? `${markers.length} difuntos en escena.` : 'Sin difuntos para mostrar.'}</div>
				)}
			</div>

			<div ref={rootRef} className="mt-3 overflow-hidden rounded-md border border-[color:var(--border)] bg-[color:var(--surface-2)]">
				<canvas ref={canvasRef} className="block h-[420px] w-full" />
			</div>
		</div>
	)
}
