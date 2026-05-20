export function Card({ title, children }) {
	return (
		<section className="admin-card p-4">
			<div className="flex items-center justify-between gap-3">
				<h3 className="text-sm font-semibold text-[color:var(--text-h)]">{title}</h3>
				<span className="admin-card__mark" aria-hidden="true" />
			</div>
			<div className="mt-3 space-y-3">{children}</div>
		</section>
	)
}

export function StatCard({ label, value, hint }) {
	return (
		<div className="admin-stat-card">
			<div className="text-xs text-[color:var(--text)]">{label}</div>
			<div className="mt-1 text-2xl font-semibold text-[color:var(--text-h)]">{value}</div>
			{hint ? <div className="mt-1 text-xs text-[color:var(--text)]">{hint}</div> : null}
		</div>
	)
}

export function SidebarButton({ active, children, onClick }) {
	return (
		<button
			onClick={onClick}
			className={
				`admin-sidebar-button ` +
				(active
					? 'admin-sidebar-button--active'
					: 'text-[color:var(--text)] hover:bg-[color:var(--hover)]')
			}
		>
			{children}
		</button>
	)
}

export function normalizeNumber(value) {
	if (value === '' || value == null) return null
	const n = Number(value)
	return Number.isFinite(n) ? n : null
}

export function formatMoney(cents, currency = 'PEN') {
	const amount = Number(cents || 0) / 100
	try {
		return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
	} catch {
		return `${amount.toFixed(2)} ${currency}`
	}
}

export function toDateInputValue(value) {
	if (!value) return ''
	const d = value instanceof Date ? value : new Date(value)
	if (Number.isNaN(d.getTime())) return ''
	const yyyy = String(d.getFullYear())
	const mm = String(d.getMonth() + 1).padStart(2, '0')
	const dd = String(d.getDate()).padStart(2, '0')
	return `${yyyy}-${mm}-${dd}`
}
