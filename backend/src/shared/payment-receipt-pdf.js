const PDFDocument = require('pdfkit');

function moneyText(amountCents, currency) {
	const cents = Number(amountCents || 0);
	const cur = String(currency || 'PEN');
	const amount = cents / 100;
	try {
		return new Intl.NumberFormat('es-PE', { style: 'currency', currency: cur }).format(amount);
	} catch {
		return `${amount.toFixed(2)} ${cur}`;
	}
}

function dateTimeText(value) {
	if (!value) return '—';
	try {
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return String(value);
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const dd = String(d.getDate()).padStart(2, '0');
		const hh = String(d.getHours()).padStart(2, '0');
		const mi = String(d.getMinutes()).padStart(2, '0');
		return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
	} catch {
		return String(value);
	}
}

function statusUi(status) {
	const s = String(status || '').toLowerCase();
	if (s === 'paid') {
		return {
			title: 'BOLETA DE PAGO',
			subtitle: 'PAGADO',
			watermark: 'PAGADO',
			color: '#16a34a',
		};
	}
	if (s === 'void') {
		return {
			title: 'BOLETA DE PAGO',
			subtitle: 'ANULADO',
			watermark: 'ANULADO',
			color: '#111827',
		};
	}
	return {
		title: 'BOLETA DE PAGO',
		subtitle: 'PENDIENTE (provisional)',
		watermark: 'PENDIENTE',
		color: '#dc2626',
	};
}

function paymentTypeLabel(name) {
	const key = String(name || '').trim();
	if (!key) return '—';
	const map = {
		cash: 'Efectivo',
		card_credit: 'Tarjeta de crédito',
		card_debit: 'Tarjeta de débito',
		card: 'Tarjeta',
	};
	return map[key] || key;
}

function drawCard(doc, { x, y, w, h, fill = '#ffffff', stroke = '#e5e7eb', radius = 10 }) {
	doc.save();
	doc.lineWidth(1);
	doc.fillColor(fill);
	doc.strokeColor(stroke);
	doc.roundedRect(x, y, w, h, radius).fillAndStroke();
	doc.restore();
}

function drawSectionTitle(doc, { x, y, title, accentColor }) {
	doc.save();
	doc.rect(x, y + 2, 3, 14).fill(accentColor);
	doc
		.font('Helvetica-Bold')
		.fontSize(11)
		.fillColor('#0f172a')
		.text(String(title || ''), x + 10, y, { width: 999 });
	doc.restore();
}

function drawKeyValue(doc, { x, y, w, key, value }) {
	doc
		.font('Helvetica')
		.fontSize(9)
		.fillColor('#555555')
		.text(String(key || ''), x, y, { width: w, continued: false });
	doc
		.font('Helvetica-Bold')
		.fontSize(11)
		.fillColor('#111111')
		.text(String(value || '—'), x, y + 12, { width: w });
}

function writePaymentReceiptPdf(res, receipt) {
	const doc = new PDFDocument({ size: 'A4', margin: 48 });

	res.setHeader('Content-Type', 'application/pdf');
	const safeCode = String(receipt?.receipt_code || `PAY-${receipt?.payment_id || receipt?.id || 'NA'}`).replace(/[^a-zA-Z0-9_-]/g, '_');
	res.setHeader('Content-Disposition', `attachment; filename="boleta-${safeCode}.pdf"`);

	doc.pipe(res);

	const ui = statusUi(receipt?.status);

	const pageX = doc.page.margins.left;
	const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;

	// Watermark (suave, según estado)
	doc.save();
	doc.rotate(-18, { origin: [300, 360] });
	doc.fillOpacity(0.10);
	doc.font('Helvetica-Bold').fontSize(72).fillColor(ui.color).text(ui.watermark, 70, 330, {
		width: 500,
		align: 'center',
	});
	doc.fillOpacity(1);
	doc.restore();

	// Header (barra de color + título)
	const headerX = pageX;
	const headerW = pageW;
	const headerY = doc.page.margins.top - 12;
	const headerH = 66;

	doc.roundedRect(headerX, headerY, headerW, headerH, 10).fill('#0f172a');
	doc.rect(headerX, headerY, 10, headerH).fill(ui.color);

	doc
		.fillColor('#ffffff')
		.font('Helvetica-Bold')
		.fontSize(16)
		.text('Sistema de Gestión de Cementerios', headerX + 18, headerY + 14, { width: headerW - 36 });
	doc
		.font('Helvetica')
		.fontSize(10)
		.fillColor('#e5e7eb')
		.text(`${ui.title} · ${ui.subtitle}`, headerX + 18, headerY + 38, { width: headerW - 36 });

	const topY = doc.page.margins.top + 80;

	// Tarjetas: Cliente (izq) + Meta (der)
	const gap = 14;
	const leftCardW = Math.min(360, Math.floor(pageW * 0.62));
	const rightCardW = pageW - leftCardW - gap;
	const leftCardX = pageX;
	const rightCardX = pageX + leftCardW + gap;
	const cardsH = 156;

	drawCard(doc, { x: leftCardX, y: topY - 6, w: leftCardW, h: cardsH, fill: '#ffffff', stroke: '#e5e7eb' });
	drawCard(doc, { x: rightCardX, y: topY - 6, w: rightCardW, h: cardsH, fill: '#ffffff', stroke: '#e5e7eb' });

	// Cliente (izquierda)
	drawSectionTitle(doc, { x: leftCardX + 14, y: topY + 6, title: 'Cliente', accentColor: ui.color });

	const clientName = receipt?.client_full_name || receipt?.client_email || '—';
	drawKeyValue(doc, {
		x: leftCardX + 14,
		y: topY + 30,
		w: leftCardW - 28,
		key: 'Nombre',
		value: clientName,
	});
	drawKeyValue(doc, {
		x: leftCardX + 14,
		y: topY + 72,
		w: leftCardW - 28,
		key: 'Email',
		value: receipt?.client_email || '—',
	});
	drawKeyValue(doc, {
		x: leftCardX + 14,
		y: topY + 114,
		w: leftCardW - 28,
		key: 'Documento',
		value: receipt?.client_document_id || '—',
	});

	// Meta (derecha)
	drawSectionTitle(doc, { x: rightCardX + 14, y: topY + 6, title: 'Boleta', accentColor: ui.color });
	drawKeyValue(doc, {
		x: rightCardX + 14,
		y: topY + 30,
		w: rightCardW - 28,
		key: 'Código',
		value: receipt?.receipt_code || '—',
	});
	drawKeyValue(doc, {
		x: rightCardX + 14,
		y: topY + 72,
		w: rightCardW - 28,
		key: 'Fecha',
		value: dateTimeText(receipt?.receipt_issued_at || receipt?.paid_at || receipt?.created_at),
	});

	// Sello de estado (dentro de la tarjeta derecha)
	const stampX = rightCardX + 14;
	const stampY = topY + 114;
	doc.roundedRect(stampX, stampY, rightCardW - 28, 28, 8).fill(ui.color);
	doc
		.fillColor('#ffffff')
		.font('Helvetica-Bold')
		.fontSize(10)
		.text(ui.subtitle, stampX, stampY + 8, { width: rightCardW - 28, align: 'center' });

	// Total (destacado)
	const totalY = topY + cardsH + 14;
	doc.roundedRect(pageX, totalY, pageW, 54, 10).fill('#f8fafc');
	doc.rect(pageX, totalY, 6, 54).fill(ui.color);
	doc
		.font('Helvetica')
		.fontSize(10)
		.fillColor('#334155')
		.text('TOTAL', pageX + 14, totalY + 12);
	doc
		.font('Helvetica-Bold')
		.fontSize(20)
		.fillColor('#0f172a')
		.text(moneyText(receipt?.amount_cents, receipt?.currency), pageX + 14, totalY + 24);

	// Detalle del pago
	const detailY = totalY + 70;
	drawCard(doc, { x: pageX, y: detailY - 6, w: pageW, h: 206, fill: '#ffffff', stroke: '#e5e7eb' });
	drawSectionTitle(doc, { x: pageX + 14, y: detailY + 6, title: 'Detalle de pago', accentColor: ui.color });

	const col1x = pageX + 14;
	const col2x = pageX + Math.floor(pageW / 2) + 6;
	drawKeyValue(doc, {
		x: col1x,
		y: detailY + 30,
		w: Math.floor(pageW / 2) - 28,
		key: 'Estado',
		value: ui.subtitle,
	});
	drawKeyValue(doc, {
		x: col2x,
		y: detailY + 30,
		w: Math.floor(pageW / 2) - 28,
		key: 'Monto',
		value: moneyText(receipt?.amount_cents, receipt?.currency),
	});

	drawKeyValue(doc, {
		x: col1x,
		y: detailY + 72,
		w: Math.floor(pageW / 2) - 28,
		key: 'Tipo de pago',
		value: paymentTypeLabel(receipt?.payment_type_name),
	});

	drawKeyValue(doc, {
		x: col2x,
		y: detailY + 72,
		w: Math.floor(pageW / 2) - 28,
		key: 'Pago ID',
		value: receipt?.id != null ? String(receipt.id) : '—',
	});

	drawKeyValue(doc, {
		x: col1x,
		y: detailY + 114,
		w: Math.floor(pageW / 2) - 28,
		key: 'Reserva',
		value: receipt?.reservation_code || '—',
	});
	drawKeyValue(doc, {
		x: col2x,
		y: detailY + 114,
		w: Math.floor(pageW / 2) - 28,
		key: 'Tumba',
		value: receipt?.grave_code || '—',
	});

	drawKeyValue(doc, {
		x: col1x,
		y: detailY + 156,
		w: Math.floor(pageW / 2) - 28,
		key: 'Sucursal',
		value: receipt?.branch_name || '—',
	});
	drawKeyValue(doc, {
		x: col2x,
		y: detailY + 156,
		w: Math.floor(pageW / 2) - 28,
		key: 'Sector',
		value: receipt?.sector_name || '—',
	});

	// Notas / validación (más realista)
	const notesY = detailY + 206 + 12;
	const notesH = 70;
	drawCard(doc, { x: pageX, y: notesY, w: pageW, h: notesH, fill: '#f8fafc', stroke: '#e5e7eb' });
	doc
		.font('Helvetica')
		.fontSize(9)
		.fillColor('#334155')
		.text('Notas', pageX + 14, notesY + 12);

	const note1 = ui.subtitle.startsWith('PENDIENTE')
		? 'Esta boleta es provisional. El pago quedará válido cuando sea confirmado por el administrador.'
		: ui.subtitle === 'ANULADO'
			? 'Esta boleta corresponde a un pago anulado.'
			: 'Boleta generada automáticamente. No requiere firma.';
	const note2 = `Código de verificación: ${receipt?.receipt_code || '—'} · Pago ID: ${receipt?.id != null ? String(receipt.id) : '—'}`;

	doc
		.font('Helvetica')
		.fontSize(9)
		.fillColor('#0f172a')
		.text(note1, pageX + 14, notesY + 28, { width: pageW - 28 });
	doc
		.font('Helvetica-Bold')
		.fontSize(9)
		.fillColor('#0f172a')
		.text(note2, pageX + 14, notesY + 48, { width: pageW - 28 });

	// Footer mini
	const footY = doc.page.height - doc.page.margins.bottom - 16;
	doc
		.font('Helvetica')
		.fontSize(8)
		.fillColor('#64748b')
		.text('Sistema de Gestión de Cementerios · Documento digital', pageX, footY, { width: pageW, align: 'center' });

	doc.end();
}

module.exports = {
	writePaymentReceiptPdf,
};
