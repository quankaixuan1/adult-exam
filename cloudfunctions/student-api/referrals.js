const organization = require('./organization');
module.exports = ({ db, ApiError }) => async id => {
  if (!/^[a-f0-9]{30}$/.test(id || '')) throw new ApiError('报名二维码无效', 'INVALID_INPUT');
  let referral, admin;
  try {
    referral = (await db.collection('registration_referrals').doc(id).get()).data;
    admin = referral && (await db.collection('admins').doc(referral.adminId).get()).data;
  } catch (_) { throw new ApiError('报名二维码无效或已停用，请联系老师', 'INVALID_INPUT'); }
  const member = referral && organization.memberById(referral.teacherId);
  if (!admin || admin.disabled || admin.createdAt !== referral.accountCreatedAt || !member || (admin.memberId || (admin._id === 'primary' ? 'principal' : '')) !== member.id) throw new ApiError('报名二维码已停用，请联系老师', 'INVALID_INPUT');
  const campus = organization.managementPositions.includes(member.position) ? '' : member.campus;
  return { referralId: id, teacherId: member.id, teacherName: member.name, campus, sourceAdminId: admin._id };
};
