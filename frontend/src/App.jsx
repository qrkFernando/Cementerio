import { useEffect, useMemo, useState } from 'react'
import { api } from './lib/api'
import { AdminPanel } from './modules/admin/AdminPanel'
import { AuthPanel } from './modules/auth/AuthPanel'
import { ClientPanel } from './modules/client/ClientPanel'
import { Footer } from './modules/layout/Footer'
import { Navbar } from './modules/layout/Navbar'
import { Panel } from './modules/layout/Panel'
import { TabButton } from './modules/layout/TabButton'

function WhatsAppConsultButton() {
  const phone = import.meta.env.VITE_WHATSAPP_PHONE || '992006050'
  const message = 'Hola, quisiera hacer una consulta sobre reservas en el cementerio.'
  const href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`

  return (
    <a
      className="whatsapp-float"
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Consultar por WhatsApp"
    >
      <span className="whatsapp-float__icon" aria-hidden="true">
        <svg viewBox="0 0 32 32" focusable="false">
          <path d="M16.02 3.2c-7 0-12.7 5.57-12.7 12.43 0 2.18.58 4.31 1.69 6.18L3.2 28.8l7.24-1.85a12.95 12.95 0 0 0 5.58 1.26c7 0 12.7-5.58 12.7-12.44S23.02 3.2 16.02 3.2Zm0 22.9c-1.82 0-3.6-.47-5.15-1.37l-.37-.22-4.28 1.1 1.08-4.08-.25-.4a10.17 10.17 0 0 1-1.6-5.5c0-5.7 4.75-10.33 10.57-10.33s10.57 4.63 10.57 10.33S21.84 26.1 16.02 26.1Zm5.8-7.73c-.32-.16-1.9-.92-2.2-1.02-.29-.1-.5-.16-.72.16-.21.31-.82 1.02-1.01 1.23-.18.2-.37.23-.69.08-.32-.16-1.34-.49-2.56-1.55a9.42 9.42 0 0 1-1.77-2.16c-.18-.31-.02-.48.14-.64.14-.14.32-.37.48-.55.16-.18.21-.31.32-.52.1-.21.05-.39-.03-.55-.08-.16-.72-1.7-.98-2.33-.26-.61-.52-.53-.72-.54h-.61c-.21 0-.55.08-.85.39-.29.31-1.11 1.06-1.11 2.6s1.14 3.02 1.3 3.23c.16.21 2.25 3.36 5.44 4.71.76.32 1.35.51 1.81.65.76.24 1.45.21 2 .13.61-.09 1.9-.76 2.16-1.49.27-.73.27-1.36.19-1.49-.08-.13-.29-.21-.61-.36Z" />
        </svg>
      </span>
      <span className="whatsapp-float__copy">
        <span>Consulta rápida</span>
        <strong>WhatsApp</strong>
      </span>
    </a>
  )
}

export default function App() {
  const [me, setMe] = useState(null)
  const [bootLoading, setBootLoading] = useState(true)
  const [bootError, setBootError] = useState('')

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

  function safeStorageGetJSON(key, fallback) {
    const raw = safeStorageGet(key)
    if (!raw) return fallback
    try {
      return JSON.parse(raw)
    } catch {
      return fallback
    }
  }

  function safeStorageSetJSON(key, value) {
    safeStorageSet(key, JSON.stringify(value))
  }

  const [activeTab, setActiveTab] = useState(() => safeStorageGet('ui.activeTab') || 'home')
  const [clientActiveTab, setClientActiveTab] = useState(() => safeStorageGet('ui.clientActiveTab') || 'home')
  const [authOpen, setAuthOpen] = useState(false)

	const [paymentIntent, setPaymentIntent] = useState(null)

  const [notifications, setNotifications] = useState([])

  const [clientSearchSeed, setClientSearchSeed] = useState({ q: '', ts: 0 })
  const [clientReservationsSeed, setClientReservationsSeed] = useState({ q: '', ts: 0 })
  const [clientPaymentsSeed, setClientPaymentsSeed] = useState({ q: '', ts: 0 })

  const meKey = useMemo(() => {
    if (!me) return 'anon'
    return String(me.id ?? me.user_id ?? me.email ?? 'user')
  }, [me])

  function pushNotification(next) {
    if (!next?.id) return
    setNotifications((prev) => {
      if (prev.some((n) => n.id === next.id)) return prev
      return [next, ...prev].slice(0, 5)
    })
  }

  const [clientSelected, setClientSelected] = useState(null)
  const clientSelectedKey = useMemo(() => {
    if (!clientSelected) return ''
    return `${clientSelected.deceased_id}-${clientSelected.grave_id || 'none'}`
  }, [clientSelected])

  const clientTabs = useMemo(() => {
    const base = [
      { id: 'home', label: 'Inicio' },
      { id: 'search', label: 'Búsqueda' },
      { id: 'map', label: 'Mapa' },
      { id: 'graveStatus', label: 'Estado' },
      { id: 'reservations', label: 'Mis reservas' },
      { id: 'payments', label: 'Pagos' },
      { id: 'profile', label: 'Perfil' },
    ]
    return base
  }, [])

  useEffect(() => {
    safeStorageSet('ui.activeTab', activeTab)
  }, [activeTab])

  useEffect(() => {
    safeStorageSet('ui.clientActiveTab', clientActiveTab)
  }, [clientActiveTab])

  useEffect(() => {
    let cancelled = false
    let intervalId = null

    async function checkForUpdates() {
      if (!me) return
      const reservationsKey = `ui.client.seen.${meKey}.reservations.v1`
      const paymentsKey = `ui.client.seen.${meKey}.payments.v1`
      const prevReservations = safeStorageGetJSON(reservationsKey, null)
      const prevPayments = safeStorageGetJSON(paymentsKey, null)

      const [resv, pays] = await Promise.all([api('/api/client/reservations'), api('/api/client/payments')])
      if (cancelled) return
      if (!resv.ok || !pays.ok) return

      const reservations = Array.isArray(resv.data?.reservations) ? resv.data.reservations : []
      const payments = Array.isArray(pays.data?.payments) ? pays.data.payments : []

      const nextReservations = {}
      for (const r of reservations) {
        const id = r?.id
        if (id == null) continue
        nextReservations[String(id)] = {
          status: r?.status || null,
          grave_status: r?.grave_status || null,
        }
      }

      const nextPayments = {}
      for (const p of payments) {
        const id = p?.id
        if (id == null) continue
        nextPayments[String(id)] = { status: p?.status || null }
      }

      const hadBaseline = Boolean(prevReservations && prevPayments)
      if (!hadBaseline) {
        safeStorageSetJSON(reservationsKey, nextReservations)
        safeStorageSetJSON(paymentsKey, nextPayments)
        return
      }

      for (const r of reservations) {
        const id = r?.id
        if (id == null) continue
        const key = String(id)
        const prev = prevReservations?.[key]
        const prevStatus = prev?.status || null
        const prevGraveStatus = prev?.grave_status || null
        const curStatus = r?.status || null
        const curGraveStatus = r?.grave_status || null
        const code = r?.reservation_code
        const graveCode = r?.grave_code
        const name = r?.deceased_full_name

        if (prevStatus !== 'confirmed' && curStatus === 'confirmed') {
          pushNotification({
            id: `resv-confirmed-${key}`,
            title: 'Reserva confirmada',
            message: `Tu reserva${code ? ` ${code}` : ''} fue confirmada. Ya puedes pagar.`,
            action: { label: 'Ir a Pagos', tabId: 'payments' },
          })
        }

        if (prevGraveStatus !== 'occupied' && curGraveStatus === 'occupied') {
          pushNotification({
            id: `burial-registered-${key}`,
            title: 'Entierro registrado',
            message: `${name ? `${name}: ` : ''}la tumba${graveCode ? ` ${graveCode}` : ''} ya figura como ocupada.`,
            action: { label: 'Ver estado', tabId: 'graveStatus' },
          })
        }
      }

      for (const p of payments) {
        const id = p?.id
        if (id == null) continue
        const key = String(id)
        const prev = prevPayments?.[key]
        const prevStatus = prev?.status || null
        const curStatus = p?.status || null
        if (prevStatus !== 'paid' && curStatus === 'paid') {
          const code = p?.reservation_code
          pushNotification({
            id: `payment-paid-${key}`,
            title: 'Pago confirmado',
            message: `Tu pago${code ? ` de la reserva ${code}` : ''} fue confirmado y registrado.`,
            action: { label: 'Ver pagos', tabId: 'payments' },
          })
        }
      }

      safeStorageSetJSON(reservationsKey, nextReservations)
      safeStorageSetJSON(paymentsKey, nextPayments)
    }

    if (me?.role === 'client') {
      checkForUpdates()
      intervalId = window.setInterval(() => {
        checkForUpdates()
      }, 30000)
    }

    return () => {
      cancelled = true
      if (intervalId) window.clearInterval(intervalId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, meKey])

	const isStaff = me?.role === 'admin' || me?.role === 'employee'

  const tabs = useMemo(() => {
    if (me?.role === 'admin') {
      return [
        { id: 'admin', label: 'Administrador' },
        { id: 'client', label: 'Vista cliente' },
      ]
    }
    if (me?.role === 'employee') {
			return [{ id: 'admin', label: 'Administrador' }]
		}
    return clientTabs
  }, [me?.role, clientTabs])

  function isLikelyReservationCode(q) {
    const s = String(q || '').trim()
    if (!s) return false
    return /\bRSV[-\w]+\b/i.test(s)
  }

  function wantsPayments(q) {
    const s = String(q || '').toLowerCase()
    return s.includes('pago') || s.includes('pagos') || s.includes('pendiente') || s.includes('pagado')
  }

  function wantsReservations(q) {
    const s = String(q || '').toLowerCase()
    return s.includes('reserva') || s.includes('reservas') || isLikelyReservationCode(q)
  }

  function applyGlobalSearch(rawQuery) {
    const q = String(rawQuery || '').trim()
    if (!q) return

    if (wantsPayments(q)) {
      goToClientTab('payments')
      setClientPaymentsSeed({ q, ts: Date.now() })
      return
    }

    if (wantsReservations(q)) {
      goToClientTab('reservations')
      setClientReservationsSeed({ q, ts: Date.now() })
      return
    }

    goToClientTab('search')
    setClientSearchSeed({ q, ts: Date.now() })
  }

  async function loadMe() {
    const result = await api('/api/auth/me')
    if (result.ok) setMe(result.data.user)
    else setMe(null)
  }

  useEffect(() => {
    ;(async () => {
      setBootLoading(true)
      setBootError('')
      try {
        await loadMe()
      } catch {
        setBootError('No se pudo cargar la sesión')
      } finally {
        setBootLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    // Si se pierde el rol admin, evita quedarse en tab admin.
    if (activeTab === 'admin' && !isStaff) setActiveTab('search')
  }, [activeTab, me?.role])

  useEffect(() => {
    if (me?.role === 'admin') {
			setActiveTab((prev) => (prev === 'admin' || prev === 'client' ? prev : 'admin'))
			setClientActiveTab((prev) => (clientTabs.some((t) => t.id === prev) ? prev : 'home'))
    }
    if (me?.role === 'employee') {
      setActiveTab('admin')
    }
  }, [me?.role, clientTabs])

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' })
    setMe(null)
    setAuthOpen(false)
    setNotifications([])
  }

  function openLogin() {
    setAuthOpen(true)
  }

  function goToPaymentsWithReservation(reservationCode) {
    if (!reservationCode) return
    setPaymentIntent({ reservationCode: String(reservationCode), ts: Date.now() })
    if (me?.role === 'admin') {
      setActiveTab('client')
      setClientActiveTab('payments')
    } else {
      setActiveTab('payments')
    }
  }

  function goToClientTab(tabId) {
    if (!tabId) return
    if (me?.role === 'admin') {
      setActiveTab('client')
      setClientActiveTab(tabId)
    } else {
      setActiveTab(tabId)
    }
  }


  function dismissNotification(id) {
    if (!id) return
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  return (
    <div className="min-h-[100svh] flex flex-col">
      <Navbar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => {
          setActiveTab(id)
				if (id === 'client') {
					setClientActiveTab((prev) => (prev ? prev : 'home'))
				}
        }}
        me={me}
        onSearch={applyGlobalSearch}
        notifications={notifications}
        onNotificationAction={(tabId, notificationId) => {
          goToClientTab(tabId)
          dismissNotification(notificationId)
        }}
        onNotificationDismiss={(notificationId) => dismissNotification(notificationId)}
        onNotificationClear={() => setNotifications([])}
        onLogin={() => openLogin()}
        onLogout={logout}
      />

      <main className="mx-auto w-full max-w-[92rem] flex-1 px-3 py-4 sm:px-4 lg:px-6">
        {bootLoading && <p className="mt-6 text-sm text-[color:var(--text)]">Cargando…</p>}
        {bootError && <p className="mt-6 text-sm text-red-600">{bootError}</p>}

        <AuthPanel
          open={!bootLoading && authOpen && !me}
          onClose={() => setAuthOpen(false)}
          onLoggedIn={(user) => {
            setMe(user)
            setAuthOpen(false)
          }}
        />

        {!bootLoading && (
          <div>
            {isStaff ? (
              <>
                {activeTab === 'admin' && (
                  <Panel>
						<AdminPanel me={me} />
                  </Panel>
                )}

                {activeTab === 'client' && me?.role === 'admin' && (
                  <>
                    <ClientPanel
                      me={me}
                      clientTabs={clientTabs}
                      activeTab={clientActiveTab}
                      onTabChange={setClientActiveTab}
                      showTabHeader
                      requireLoginForSearch={false}
                      clientSelected={clientSelected}
                      clientSelectedKey={clientSelectedKey}
                      onSelect={(it) => setClientSelected(it)}
                      onLogin={() => openLogin()}
                      onLogout={logout}
                      onMeRefresh={loadMe}
                      onPayReservation={(code) => goToPaymentsWithReservation(code)}
                      paymentIntent={paymentIntent}
                      onPaymentIntentHandled={() => setPaymentIntent(null)}
						searchSeed={clientSearchSeed}
						reservationsSeed={clientReservationsSeed}
						paymentsSeed={clientPaymentsSeed}
                    />
                  </>
                )}
              </>
            ) : (
              <>
                <ClientPanel
                  me={me}
                  clientTabs={clientTabs}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  showTabHeader={false}
                  requireLoginForSearch
                  clientSelected={clientSelected}
                  clientSelectedKey={clientSelectedKey}
                  onSelect={(it) => setClientSelected(it)}
                  onLogin={() => openLogin()}
                  onLogout={logout}
                  onMeRefresh={loadMe}
                  onPayReservation={(code) => goToPaymentsWithReservation(code)}
                  paymentIntent={paymentIntent}
                  onPaymentIntentHandled={() => setPaymentIntent(null)}
					searchSeed={clientSearchSeed}
					reservationsSeed={clientReservationsSeed}
					paymentsSeed={clientPaymentsSeed}
                />

                {activeTab === 'admin' && me?.role === 'admin' && (
                  <Panel>
                    <AdminPanel />
                  </Panel>
                )}
              </>
            )}
          </div>
        )}
      </main>

      <Footer />
      <WhatsAppConsultButton />
    </div>
  )
}
