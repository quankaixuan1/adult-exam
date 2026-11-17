const { recognize, validateTime } = require('./payment-ocr');
module.exports = ({ db, cloud, ApiError, requirePermission, scopedRegistration, withTransaction, canAccess }) => async (admin, data, confirm = false) => {
  requirePermission(admin, 'materials.view');
  requirePermission(admin, 'registrations.edit');
  const fail = message => { throw new ApiError(message, 'INVALID_INPUT'); };
  if (!confirm && data.base64) {
    if (typeof data.base64 !== 'string' || data.base64.length > 2800000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.base64)) fail('凭证图片无效或超过2MB');
    const bytes = Buffer.from(data.base64,'base64');
    if (bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a' && bytes.subarray(0,3).toString('hex') !== 'ffd8ff') fail('仅支持PNG或JPG凭证');
    try { return await recognize(data.base64); } catch(e) { fail(e.message); }
  }
  if (!/^[a-f0-9]{64}$/.test(data.registrationId || '') || !Number.isSafeInteger(data.proofIndex) || data.proofIndex < 0) fail('凭证参数无效');
  const record = await scopedRegistration(admin, data.registrationId);
  const proofsOf = r => r.paymentProofs || (r.materials?.paymentProof ? [r.materials.paymentProof] : []);
  const proof = proofsOf(record)[data.proofIndex];
  if (!proof?.fileId?.startsWith('cloud://') || !proof.fileId.includes(`/student-materials/${data.registrationId}/paymentProof/`)) fail('凭证不存在或路径不匹配');
  if (!confirm) {
    try { const file = await cloud.downloadFile({ fileID:proof.fileId }); if (file.fileContent.length > 2*1024*1024) fail('凭证超过2MB，请手动填写'); return await recognize(file.fileContent.toString('base64')); } catch(e) { fail(e.message); }
  }
  let paidAt; try { paidAt = validateTime(data.paidAt); } catch(e) { fail(e.message); }
  if (data.confirmed !== true) fail('请核对原图后确认');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(String(data.amount)) || Number(data.amount) <= 0) fail('请填写有效的付款金额');
  if (typeof data.transactionNo !== 'string' || data.transactionNo.length > 80 || !/^[A-Za-z0-9]*$/.test(data.transactionNo)) fail('交易单号格式无效');
  if (!['', '微信','支付宝','银行转账','其他'].includes(data.channel)) fail('支付渠道无效');
  await withTransaction(db, async tx => {
    const current = (await tx.collection('registrations').doc(data.registrationId).get()).data;
    if (!current || !canAccess(admin,current)) throw new ApiError('无权操作该记录','FORBIDDEN');
    if (current.revision !== data.revision) throw new ApiError('记录已更新，请重新打开','REVISION_CONFLICT');
    const proofs = proofsOf(current).map(p=>({...p}));
    if (proofs[data.proofIndex]?.fileId !== proof.fileId) fail('凭证已变化，请重新打开');
    if (data.transactionNo && proofs.some((p,i)=>i!==data.proofIndex && p.paymentInfo?.transactionNo === data.transactionNo)) fail('此交易单号已在其他凭证中确认，请勿重复记录');
    const now = new Date().toISOString();
    proofs[data.proofIndex].paymentInfo = { paidAt, amount:Number(data.amount), transactionNo:data.transactionNo, channel:data.channel, confirmedBy:admin._id, confirmedAt:now };
    await tx.collection('registrations').doc(data.registrationId).update({ data:{ paymentProofs:proofs, revision:current.revision+1, updatedAt:now } });
    await tx.collection('audit_logs').doc(`proof-confirm-${data.registrationId}-${current.revision+1}`).set({ data:{ actorId:admin._id, action:'payment_proof_confirmed', details:{registrationId:data.registrationId, proofIndex:data.proofIndex}, createdAt:now } });
  });
  return { saved:true };
};
