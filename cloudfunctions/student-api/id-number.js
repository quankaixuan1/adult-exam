// Returns a user-facing error, or an empty string when number rules pass.
function validateIdNumber(value, now = new Date()) {
  const id = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^\d{17}[0-9X]$/.test(id)) return '请填写18位身份证号，末位可以是X。';
  if (/^0{6}/.test(id)) return '身份证号地址码不正确，请核对。';
  const year = Number(id.slice(6, 10));
  const month = Number(id.slice(10, 12));
  const day = Number(id.slice(12, 14));
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (year < 1800 || birth.getUTCFullYear() !== year || birth.getUTCMonth() !== month - 1 || birth.getUTCDate() !== day) return '身份证号中的出生日期不正确，请核对。';
  const todayInChina = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
  if (id.slice(6, 14) > todayInChina) return '身份证号中的出生日期不能晚于今天。';
  if (id.slice(14, 17) === '000') return '身份证号顺序码不正确，请核对。';
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checksum = '10X98765432';
  const sum = weights.reduce((total, weight, index) => total + Number(id[index]) * weight, 0);
  if (id[17] !== checksum[sum % 11]) return '身份证号校验码不正确，请检查号码是否输错。';
  return '';
}
module.exports = { validateIdNumber };
