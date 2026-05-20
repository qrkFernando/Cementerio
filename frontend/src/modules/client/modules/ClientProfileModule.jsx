import { useEffect, useMemo, useState } from 'react'
import { api } from '../../../lib/api'
import { Panel } from '../../layout/Panel'

function prettyGraveStatus(status) {
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

export function ClientProfileModule({ me, showLoggedOutMessage, onLogout, onMeRefresh }) {
	const [clientProfile, setClientProfile] = useState(null)
	const [reservations, setReservations] = useState([])
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState('')
	const [editOpen, setEditOpen] = useState(false)
	const [draft, setDraft] = useState({ username: '', full_name: '', document_id: '', phone: '' })
	const [saveError, setSaveError] = useState('')

	useEffect(() => {
		let cancelled = false
		async function load() {
			if (!me) return
			setLoading(true)
			setError('')
			try {
				const [profileRes, resvRes] = await Promise.all([
					api('/api/client/profile'),
					api('/api/client/reservations'),
				])

				if (!cancelled) {
					if (profileRes?.ok) {
						const next = profileRes.data?.client ?? null
						setClientProfile(next)
						setDraft({
								username: me?.username || '',
							full_name: next?.full_name || '',
							document_id: next?.document_id || '',
							phone: next?.phone || '',
						})
					} else {
						// Fallback si el endpoint no existe aún o falla.
						setClientProfile(null)
							setDraft({ username: me?.username || '', full_name: '', document_id: '', phone: '' })
					}

					if (resvRes?.ok) {
						setReservations(Array.isArray(resvRes.data?.reservations) ? resvRes.data.reservations : [])
					} else {
						setReservations([])
						setError(resvRes?.data?.error || 'No se pudieron cargar tus registros')
					}
				}
			} finally {
				if (!cancelled) setLoading(false)
			}
		}
		load()
		return () => {
			cancelled = true
		}
	}, [me?.id])

	async function saveProfile() {
		setSaving(true)
		setSaveError('')
		try {
			const payload = {
				username: String(draft.username || '').trim(),
				fullName: String(draft.full_name || '').trim(),
				documentId: String(draft.document_id || '').trim(),
				phone: String(draft.phone || '').trim(),
			}
			const result = await api('/api/client/profile', {
				method: 'PUT',
				body: JSON.stringify(payload),
			})
			if (!result.ok) {
				setSaveError(result.data?.error || 'No se pudo guardar')
				return
			}
			const next = result.data?.client ?? null
			setClientProfile(next)
			setDraft({
				username: payload.username,
				full_name: next?.full_name || payload.fullName || '',
				document_id: next?.document_id || payload.documentId || '',
				phone: next?.phone || payload.phone || '',
			})
			setEditOpen(false)
			// Refresca 'me' para que se vea el username en Navbar y en Perfil.
			try {
				await onMeRefresh?.()
			} catch {
				// ignore
			}
		} finally {
			setSaving(false)
		}
	}

	function displayUsername() {
		const u = String(me?.username || '').trim()
		if (u) return u
		const email = String(me?.email || '').trim()
		if (email.includes('@')) return email.split('@')[0]
		return email || 'Usuario'
	}

	const peopleFromSearch = useMemo(() => {
		// Coincide con lo que muestra la pestaña Búsqueda (reservas del cliente)
		return reservations
	}, [reservations])

	return (
		<Panel className="client-panel client-panel--profile">
			{me ? (
				<div className="client-profile-view">
					<div className="client-profile-hero">
						<div className="client-profile-hero__avatar">
								<svg
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<path d="M20 21a8 8 0 0 0-16 0" />
									<circle cx="12" cy="7" r="4" />
								</svg>
						</div>
						<div className="min-w-0">
							<div className="ui-kicker">Cuenta cliente</div>
							<div className="mt-1 truncate text-2xl font-semibold text-[color:var(--text-h)]">{displayUsername()}</div>
							<div className="mt-1 truncate text-sm text-[color:var(--text)]">{me.email}</div>
						</div>
						<div className="client-profile-hero__stats">
							<div><span>{peopleFromSearch.length}</span><small>personas</small></div>
							<div><span>{clientProfile?.phone ? 'Sí' : 'No'}</span><small>celular</small></div>
						</div>
					</div>

					{error ? <div className="text-sm text-red-600">{error}</div> : null}

					<div className="client-profile-layout">
						<div className="client-profile-card client-profile-card--account">
							<div className="client-profile-card__head">
								<div>
									<div className="ui-kicker">Datos</div>
									<div className="mt-1 text-base font-semibold text-[color:var(--text-h)]">Información de cuenta</div>
								</div>
								<button
									onClick={() => {
										setSaveError('')
										setDraft({
										username: me?.username || '',
											full_name: clientProfile?.full_name || '',
											document_id: clientProfile?.document_id || '',
											phone: clientProfile?.phone || '',
										})
										setEditOpen((v) => !v)
								}}
									type="button"
									className="rounded-md border border-[color:var(--border)] px-3 py-2 text-sm font-semibold text-[color:var(--text-h)] hover:bg-[color:var(--hover)]"
								>
									{editOpen ? 'Cancelar' : 'Editar'}
								</button>
							</div>
							<div className="client-profile-fields">
								<div className="client-profile-field">
									<span>Usuario</span>
									<strong>{me.username || '—'}</strong>
								</div>
								<div className="client-profile-field">
									<span>Correo</span>
									<strong>{me.email}</strong>
								</div>
								<div className="client-profile-field">
									<span>Rol</span>
									<strong>{me.role}</strong>
								</div>
								{!editOpen ? (
									<>
										<div className="client-profile-field">
											<span>Nombre</span>
											<strong>{clientProfile?.full_name || '—'}</strong>
										</div>
										<div className="client-profile-field">
											<span>DNI</span>
											<strong>{clientProfile?.document_id || '—'}</strong>
										</div>
										<div className="client-profile-field">
											<span>Celular</span>
											<strong>{clientProfile?.phone || '—'}</strong>
										</div>
								</>
								) : (
									<div className="client-profile-edit">
										<div>
											<label className="block text-xs text-[color:var(--text)]">Usuario</label>
											<input
												value={draft.username}
												onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))}
												className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm text-[color:var(--text-h)]"
												placeholder="Tu usuario"
												autoComplete="username"
												maxLength={24}
											/>
											<div className="mt-1 text-[11px] text-[color:var(--muted)]">2–24 caracteres.</div>
										</div>
										<div>
											<label className="block text-xs text-[color:var(--text)]">Nombre</label>
											<input
												value={draft.full_name}
												onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))}
												className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm text-[color:var(--text-h)]"
												placeholder="Tu nombre"
												autoComplete="name"
											/>
										</div>
										<div>
											<label className="block text-xs text-[color:var(--text)]">DNI</label>
											<input
												value={draft.document_id}
												onChange={(e) => setDraft((d) => ({ ...d, document_id: e.target.value }))}
												className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm text-[color:var(--text-h)]"
												placeholder="Documento"
												autoComplete="off"
											/>
										</div>
										<div>
											<label className="block text-xs text-[color:var(--text)]">Celular</label>
											<input
												value={draft.phone}
												onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
												className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm text-[color:var(--text-h)]"
												placeholder="Número"
												autoComplete="tel"
											/>
										</div>

										{saveError ? <div className="text-sm text-red-600">{saveError}</div> : null}
										<div className="flex justify-end">
											<button
												onClick={() => saveProfile()}
												type="button"
												disabled={saving}
												className="rounded-md bg-[color:var(--accent)] px-3 py-2 text-sm font-medium text-[color:var(--on-accent)] disabled:opacity-50"
											>
												{saving ? 'Guardando…' : 'Guardar'}
											</button>
										</div>
									</div>
								)}
							</div>
						</div>

						<div className="client-profile-card">
							<div className="client-profile-card__head">
								<div>
									<div className="ui-kicker">Búsqueda</div>
									<div className="mt-1 text-base font-semibold text-[color:var(--text-h)]">Personas asociadas</div>
								</div>
								{loading ? <div className="text-xs text-[color:var(--text)]">Cargando…</div> : null}
							</div>
							{!loading && peopleFromSearch.length === 0 ? (
								<div className="mt-2 text-sm text-[color:var(--text)]">Aún no hay registros.</div>
							) : null}
							{peopleFromSearch.length > 0 ? (
								<div className="client-profile-people">
									{peopleFromSearch.slice(0, 12).map((it) => (
										<div key={`prof-resv-${it.id}`} className="client-profile-person">
											<div className="client-profile-person__avatar" aria-hidden="true">
												{String(it.deceased_full_name || '?').slice(0, 1).toUpperCase()}
											</div>
											<div className="min-w-0">
												<div className="truncate text-sm font-semibold text-[color:var(--text-h)]">{it.deceased_full_name || '—'}</div>
												<div className="mt-1 text-xs text-[color:var(--text)]">Reserva: {it.reservation_code || '—'}</div>
												<div className="mt-1 text-xs text-[color:var(--muted)]">Tumba: {it.grave_code || '—'} · {prettyGraveStatus(it.grave_status)}</div>
											</div>
										</div>
									))}
									{peopleFromSearch.length > 12 ? (
										<div className="text-xs text-[color:var(--text)]">Mostrando 12 de {peopleFromSearch.length}.</div>
									) : null}
								</div>
							) : null}
						</div>
					</div>

				</div>
			) : showLoggedOutMessage ? (
				<div className="text-sm text-[color:var(--text)]">Inicia sesión o regístrate desde la barra superior.</div>
			) : (
				<div className="text-sm text-[color:var(--text)]">—</div>
			)}
		</Panel>
	)
}
