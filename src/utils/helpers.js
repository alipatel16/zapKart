// ============================================================
// RAZORPAY UTILITY
// ============================================================

export const initiateRazorpayPayment = ({ amount, orderId, userEmail, userName, userPhone, onSuccess, onFailure }) => {
  if (!window.Razorpay) {
    onFailure?.('Razorpay SDK not loaded. Please check your connection.');
    return;
  }

  const options = {
    key: process.env.REACT_APP_RAZORPAY_KEY_ID,
    amount: Math.round(amount * 100), // Razorpay expects paise
    currency: 'INR',
    name: 'Zap Delivery',
    description: `Order #${orderId}`,
    order_id: orderId,
    prefill: {
      name: userName,
      email: userEmail,
      contact: userPhone || '',
    },
    theme: { color: '#FF6B35' },
    modal: {
      ondismiss: () => onFailure?.('Payment cancelled'),
    },
    handler: (response) => {
      onSuccess?.({
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_signature: response.razorpay_signature,
      });
    },
  };

  const rzp = new window.Razorpay(options);
  rzp.on('payment.failed', (resp) => onFailure?.(resp.error?.description));
  rzp.open();
};

// ============================================================
// INVOICE GENERATOR (jsPDF)
// ============================================================

export const generateInvoicePDF = async (order, userProfile) => {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF();
  const PRIMARY = [255, 107, 53];
  const DARK = [26, 26, 46];

  // Header background
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, 210, 35, 'F');

  // App name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('ZAP DELIVERY', 15, 18);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Your local town\'s fastest delivery', 15, 26);

  // Invoice title
  doc.setFontSize(12);
  doc.text(`INVOICE`, 150, 18);
  doc.text(`#${order.orderNumber || order.id?.slice(-8).toUpperCase()}`, 150, 26);

  // Bill to
  doc.setTextColor(...DARK);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('BILL TO:', 15, 50);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(userProfile?.displayName || order.customerName || 'Customer', 15, 58);
  doc.text(order.address?.line1 || '', 15, 64);
  if (order.address?.line2) doc.text(order.address.line2, 15, 70);
  doc.text(`${order.address?.city || ''}, ${order.address?.pincode || ''}`, 15, 76);

  // Order info
  doc.setFont('helvetica', 'bold');
  doc.text('ORDER DETAILS:', 120, 50);
  doc.setFont('helvetica', 'normal');
  const orderDate = order.createdAt?.toDate
    ? order.createdAt.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date(order.createdAt).toLocaleDateString('en-IN');
  doc.text(`Date: ${orderDate}`, 120, 58);
  doc.text(`Status: ${order.status?.toUpperCase() || 'PLACED'}`, 120, 64);
  doc.text(`Payment: ${order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online'}`, 120, 70);
  doc.text(`Payment Status: ${order.paymentStatus === 'paid' ? 'PAID' : 'PENDING'}`, 120, 76);

  // Items table
  const tableData = order.items.map((item) => [
    item.name,
    item.quantity,
    `₹${item.discountedPrice || item.mrp}`,
    `₹${(item.discountedPrice || item.mrp) * item.quantity}`,
  ]);

  autoTable(doc, {
    startY: 88,
    head: [['Product', 'Qty', 'Unit Price', 'Total']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold', fontSize: 10 },
    bodyStyles: { fontSize: 9, textColor: DARK },
    alternateRowStyles: { fillColor: [255, 248, 245] },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 35, halign: 'right' },
    },
    margin: { left: 15, right: 15 },
  });

  const finalY = doc.lastAutoTable.finalY + 10;

  // Summary
  const summaryX = 120;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal:', summaryX, finalY);
  doc.text(`₹${order.subtotal?.toFixed(2)}`, 195, finalY, { align: 'right' });

  if (order.discount > 0) {
    doc.setTextColor(6, 214, 160);
    doc.text('Discount:', summaryX, finalY + 7);
    doc.text(`-₹${order.discount?.toFixed(2)}`, 195, finalY + 7, { align: 'right' });
    doc.setTextColor(...DARK);
  }

  doc.text('Delivery:', summaryX, finalY + 14);
  doc.text(order.deliveryCharge === 0 ? 'FREE' : `₹${order.deliveryCharge}`, 195, finalY + 14, { align: 'right' });

  // Total
  doc.setFillColor(...PRIMARY);
  doc.rect(110, finalY + 18, 90, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL:', 115, finalY + 26);
  doc.text(`₹${order.total?.toFixed(2)}`, 195, finalY + 26, { align: 'right' });

  // Footer
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Thank you for shopping with Zap Delivery! For support, contact us at support@zapdelivery.com', 105, 285, { align: 'center' });

  doc.save(`ZAP-Invoice-${order.orderNumber || order.id?.slice(-8)}.pdf`);
};

// ============================================================
// HELPERS
// ============================================================

export const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

export const formatDate = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const getOrderStatusColor = (status) => {
  const map = {
    placed: '#3B82F6',
    confirmed: '#8B5CF6',
    processing: '#F59E0B',
    packed: '#F97316',
    enroute: '#FF6B35',
    delivered: '#06D6A0',
    cancelled: '#EF4444',
  };
  return map[status] || '#6B7280';
};

export const ORDER_STATUSES = [
  { key: 'placed', label: 'Order Placed', icon: '📋' },
  { key: 'confirmed', label: 'Confirmed', icon: '✅' },
  { key: 'processing', label: 'Processing', icon: '⚙️' },
  { key: 'packed', label: 'Packed', icon: '📦' },
  { key: 'enroute', label: 'Out for Delivery', icon: '🛵' },
  { key: 'delivered', label: 'Delivered', icon: '🎉' },
];
