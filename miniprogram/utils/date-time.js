function formatBeijingTime(value) {
  if (value === undefined || value === null || value === '') return '—';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '—';
  const date = new Date(timestamp + 8 * 60 * 60 * 1000);
  const pad = number => String(number).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}
module.exports = { formatBeijingTime };
