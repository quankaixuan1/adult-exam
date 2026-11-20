const { validateTime } = require('./payment-ocr');

module.exports = function confirmedPaymentInfo(data, adminId, now, fail) {
  let paidAt;
  try {
    paidAt = validateTime(data.paidAt);
  } catch (e) {
    fail(e.message);
  }
  if (data.confirmed !== true) fail('请核对原图后确认');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(String(data.amount)) || Number(data.amount) <= 0) fail('请填写有效的付款金额');
  if (typeof data.transactionNo !== 'string' || data.transactionNo.length > 80 || !/^[A-Za-z0-9]*$/.test(data.transactionNo)) fail('交易单号格式无效');
  if (!['', '微信', '支付宝', '银行转账', '其他'].includes(data.channel)) fail('支付渠道无效');
  return {
    paidAt,
    amount: Number(data.amount),
    transactionNo: data.transactionNo,
    channel: data.channel,
    confirmedBy: adminId,
    confirmedAt: now
  };
};
