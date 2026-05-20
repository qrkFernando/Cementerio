import { TabButton } from '../layout/TabButton'

import { ClientGraveStatusModule } from './modules/ClientGraveStatusModule'
import { ClientHomeModule } from './modules/ClientHomeModule'
import { ClientMapModule } from './modules/ClientMapModule'
import { ClientPaymentsModule } from './modules/ClientPaymentsModule'
import { ClientProfileModule } from './modules/ClientProfileModule'
import { ClientReservationsModule } from './modules/ClientReservationsModule'
import { ClientSearchModule } from './modules/ClientSearchModule'

const TAB_META = {
	home: { code: 'IN', title: 'Inicio', text: 'Reserva y seguimiento desde un solo lugar.' },
	search: { code: 'BU', title: 'Búsqueda', text: 'Encuentra registros, difuntos y ubicaciones asociadas.' },
	map: { code: 'MP', title: 'Mapa', text: 'Explora la ubicación visual de tus registros.' },
	graveStatus: { code: 'ES', title: 'Estado', text: 'Consulta el avance de reserva, pago y parcela.' },
	reservations: { code: 'RS', title: 'Reservas', text: 'Revisa tus solicitudes y acciones pendientes.' },
	payments: { code: 'PG', title: 'Pagos', text: 'Gestiona comprobantes y pagos de reservas.' },
	profile: { code: 'PE', title: 'Perfil', text: 'Mantén tus datos de contacto actualizados.' },
}

export function ClientPanel({
	me,
	clientTabs,
	activeTab,
	onTabChange,
	showTabHeader,
	requireLoginForSearch,
	clientSelected,
	clientSelectedKey,
	onSelect,
	onLogin,
	onLogout,
	onMeRefresh,
	onPayReservation,
	paymentIntent,
	onPaymentIntentHandled,
	searchSeed,
	reservationsSeed,
	paymentsSeed,
}) {
	const activeMeta = TAB_META[activeTab] || TAB_META.home

	return (
		<div className="client-shell">
			{showTabHeader ? (
				<div className="client-tabs-shell">
					<div className="client-tabs-shell__header">
						<div>
							<div className="ui-kicker">Vista cliente</div>
							<div className="mt-1 text-sm font-semibold text-[color:var(--text-h)]">Servicios y seguimiento</div>
						</div>
						<div className="client-tabs-shell__badge">{activeMeta.code}</div>
					</div>
					<div className="client-tabs">
						{clientTabs.map((t) => (
							<TabButton key={t.id} active={activeTab === t.id} onClick={() => onTabChange(t.id)}>
								<span className="client-tab-button__code">{TAB_META[t.id]?.code || t.label.slice(0, 2)}</span>
								<span>{t.label}</span>
							</TabButton>
						))}
					</div>
				</div>
			) : null}

			{activeTab !== 'home' && activeTab !== 'map' ? (
				<div className="client-module-hero">
					<div className="client-module-hero__badge">{activeMeta.code}</div>
					<div>
						<div className="text-xl font-semibold text-[color:var(--text-h)]">{activeMeta.title}</div>
						<div className="mt-1 text-sm text-[color:var(--text)]">{activeMeta.text}</div>
					</div>
				</div>
			) : null}

			<div className={activeTab === 'map' ? '' : 'client-module-surface'}>
				{activeTab === 'home' && (
					<ClientHomeModule
						me={me}
						onLogin={onLogin}
						onPayReservation={onPayReservation}
						onGoToMyReservations={() => onTabChange('reservations')}
						onGoToSearch={() => onTabChange('search')}
						onGoToGraveStatus={() => onTabChange('graveStatus')}
						onGoToPayments={() => onTabChange('payments')}
					/>
				)}

				{activeTab === 'search' && (
					<ClientSearchModule
						me={me}
						requireLogin={requireLoginForSearch}
						selectedKey={clientSelectedKey}
						onSelect={onSelect}
						onGoToMap={() => onTabChange('map')}
						searchSeed={searchSeed}
					/>
				)}


				{activeTab === 'map' && <ClientMapModule me={me} selected={clientSelected} onSelect={onSelect} />}

				{activeTab === 'graveStatus' && (
					<ClientGraveStatusModule me={me} selected={clientSelected} onGoToMap={() => onTabChange('map')} />
				)}

				{activeTab === 'reservations' && (
					<ClientReservationsModule
						me={me}
						onLogin={onLogin}
						onPayReservation={onPayReservation}
						filterSeed={reservationsSeed}
					/>
				)}

				{activeTab === 'payments' && (
					<ClientPaymentsModule
						me={me}
						onLogin={onLogin}
						intent={paymentIntent}
						onIntentHandled={onPaymentIntentHandled}
						filterSeed={paymentsSeed}
					/>
				)}

				{activeTab === 'profile' && (
					<ClientProfileModule
						me={me}
						showLoggedOutMessage={!me && !showTabHeader}
						onLogout={onLogout}
						onMeRefresh={onMeRefresh}
					/>
				)}
			</div>
		</div>
	)
}
