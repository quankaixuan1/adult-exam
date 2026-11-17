const keys = ['registration', 'exam', 'materials', 'tuition'];
const cents = value => value == null || value === '' ? null : Math.round(Number(value) * 100);
function paymentChanged(current, fields) {
  if (Object.hasOwn(fields, 'actualPaidAmount') && cents(fields.actualPaidAmount) !== cents(current?.actualPaidAmount)) return true;
  if (!fields.paymentBreakdown) return false;
  if (!current?.paymentBreakdown) return true;
  return keys.some(key => cents(fields.paymentBreakdown[key] ?? 0) !== cents(current.paymentBreakdown[key] ?? 0));
}
module.exports = { paymentChanged };
