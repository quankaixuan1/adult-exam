module.exports = ({ db, ApiError, requirePermission, scopedRegistration, withTransaction, canAccess }) => async (admin, data) => {
  requirePermission(admin, 'registrations.edit');
  requirePermission(admin, 'materials.view');
  await scopedRegistration(admin, data.registrationId);
  if (!Number.isSafeInteger(data.proofIndex) || data.proofIndex < 0 || !Number.isSafeInteger(data.revision)) throw new ApiError('凭证参数无效', 'INVALID_INPUT');
  await withTransaction(db, async tx => {
    const doc = tx.collection('registrations').doc(data.registrationId);
    const current = (await doc.get()).data;
    if (!current || !canAccess(admin, current)) throw new ApiError('无权操作该记录', 'FORBIDDEN');
    if (current.revision !== data.revision) throw new ApiError('资料已更新，请重新打开详情', 'REVISION_CONFLICT');
    const proofs = [...(current.paymentProofs || (current.materials?.paymentProof ? [current.materials.paymentProof] : []))];
    if (!proofs[data.proofIndex]) throw new ApiError('凭证不存在', 'INVALID_INPUT');
    const [removed] = proofs.splice(data.proofIndex, 1);
    const now = new Date().toISOString();
    // Keep the removed file referenced in the server-only audit record for traceability.
    await doc.update({ data: {
      paymentProofs: proofs,
      'materials.paymentProof': proofs.length ? proofs[proofs.length - 1] : db.command.remove(),
      paymentStatus: proofs.length ? 'finance_pending' : 'pending',
      paymentRemark: '', paymentFinanceId: '', paymentFinanceReviewedAt: '',
      revision: current.revision + 1, updatedAt: now
    } });
    await tx.collection('audit_logs').doc(`proof-delete-${data.registrationId}-${current.revision + 1}`).set({ data: {
      actorType: 'admin', actorId: admin._id, action: 'payment_proof_deleted',
      details: { registrationId: data.registrationId, removedProof: removed, previousPaymentStatus: current.paymentStatus }, createdAt: now
    } });
  });
  return { success: true };
};
