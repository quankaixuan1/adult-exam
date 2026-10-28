const { memberById, managementPositions } = require('./organization');
const isSuper = admin => admin._id === 'primary';
function membership(admin) { return memberById(admin.memberId); }
function isManagement(admin) { return isSuper(admin) || managementPositions.includes(membership(admin)?.position); }
function canAccess(admin, record) {
  if (isManagement(admin)) return true;
  const member = membership(admin);
  if (member) return record.teacherId === member.id || (member.position === 'campusLead' && record.campus === member.campus);
  if (admin.memberId) return false;
  return (admin.schools || []).includes(record.school) || (admin.classIds || []).includes(record.classId);
}
function scopeFor(admin, command, prefix = '') {
  if (isManagement(admin)) return {};
  const member = membership(admin);
  const rules = [];
  if (member) {
    rules.push({ [`${prefix}teacherId`]: member.id });
    if (member.position === 'campusLead') rules.push({ [`${prefix}campus`]: member.campus });
  } else if (!admin.memberId) {
    if ((admin.schools || []).length) rules.push({ [`${prefix}school`]: command.in(admin.schools) });
    if ((admin.classIds || []).length) rules.push({ [`${prefix}classId`]: command.in(admin.classIds) });
  }
  return rules.length ? command.or(rules) : { [`${prefix}_id`]: '__no_authorized_records__' };
}
module.exports = { isSuper, membership, isManagement, canAccess, scopeFor };
