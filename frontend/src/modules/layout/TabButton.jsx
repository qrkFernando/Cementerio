export function TabButton({ active, children, onClick }) {
	return (
		<button
			onClick={onClick}
			className={
				active
					? 'client-tab-button client-tab-button--active'
					: 'client-tab-button'
			}
		>
			{children}
		</button>
	)
}
