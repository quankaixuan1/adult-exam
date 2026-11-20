const categories = { exam: '考试费', materials: '高复教材资料费', tuition: '高复学费', unclassified: '未分类' };
function validateFilters(f) {
  if (f.mode && !['registrations', 'payments'].includes(f.mode)) throw Error('统计类型无效');
  if (f.category && !categories[f.category]) throw Error('缴费类别无效');
  for (const key of ['start', 'end', 'academicStart', 'academicEnd']) if (f[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(f[key]) || !Number.isFinite(Date.parse(f[key])))) throw Error('日期无效');
  if (f.start && f.end && f.start > f.end) throw Error('开始日期不能晚于结束日期');
  if (f.academicStart && f.academicEnd && f.academicStart > f.academicEnd) throw Error('学年开始日期不能晚于结束日期');
}
const day = value => { const time = Date.parse(value); return Number.isFinite(time) ? new Date(time + 8 * 3600000).toISOString().slice(0, 10) : ''; };
const cents = value => Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) : 0;
function summarize(records, f = {}) {
  validateFilters(f);
  const payments = f.mode === 'payments';
  const options = {};
  for (const key of ['school', 'campus', 'teacherName', 'level']) options[key] = [...new Set(records.map(r => r[key]).filter(Boolean))].sort();
  let missingDates = 0;
  const rows = [];
  for (const r of records) {
    if (['school', 'campus', 'teacherName', 'level'].some(k => f[k] && r[k] !== f[k])) continue;
    // Only attribute a cumulative balance to a proof when it accounts for the whole amount.
    const proofs = r.paymentProofs || [];
    const verified = proofs.length === 1 && proofs[0].paymentInfo?.confirmedAt && cents(proofs[0].paymentInfo.amount) === cents(r.actualPaidAmount) ? proofs[0].paymentInfo.paidAt : '';
    const date = day(payments ? (f.dateBasis === 'actual' ? verified : r.paymentFinanceReviewedAt) : r.createdAt);
    if (payments && !date && (r.paymentStatus === 'paid' || cents(r.actualPaidAmount) > 0)) missingDates++;
    if ((f.start || f.end) && !date) continue;
    if ((f.start && date < f.start) || (f.end && date > f.end)) continue;
    const status = payments ? r.paymentStatus || 'pending' : r.status || 'pending';
    if (f.status && status !== f.status) continue;
    const parts = {};
    for (const key of Object.keys(categories).filter(k => k !== 'unclassified')) parts[key] = Math.max(0, cents(r.paymentBreakdown?.[key]));
    parts.unclassified = Math.max(0, cents(r.actualPaidAmount) - Object.values(parts).reduce((a, b) => a + b, 0));
    if (payments && f.category && !parts[f.category]) continue;
    rows.push({ id: r._id, name: r.name, school: r.school || '未分配', campus: r.campus || '未分配', teacherName: r.teacherName || '未分配', level: r.level || '未分配', date, status, amount: f.category ? parts[f.category] : cents(r.actualPaidAmount), parts });
  }
  const confirmed = rows.filter(r => r.status === 'paid');
  const groups = {};
  for (const field of ['school', 'campus', 'teacherName', 'level']) {
    const values = new Map();
    for (const r of rows) { const v = values.get(r[field]) || { label: r[field], count: 0, amount: 0 }; v.count++; if (r.status === 'paid') v.amount += r.amount; values.set(r[field], v); }
    groups[field] = [...values.values()].sort((a,b) => b.count-a.count);
  }
  const trend = new Map();
  for (const r of rows) { if (!r.date) continue; const label = f.granularity === 'year' ? r.date.slice(0,7) : r.date; const v = trend.get(label) || { label, count: 0, amount: 0 }; v.count++; if (r.status === 'paid') v.amount += r.amount; trend.set(label,v); }
  const categoryGroups = Object.entries(categories).filter(([key]) => !f.category || f.category === key).map(([key,label]) => ({ label, amount: confirmed.reduce((n,r) => n+r.parts[key],0) }));
  const statuses = {};
  rows.forEach(r => { statuses[r.status] = (statuses[r.status] || 0)+1; });
  const registrationGroups = {};
  if (!payments) {
    for (const [key, label] of [['campus', '校区'], ['school', '院校'], ['level', '层次'], ['teacherName', '报名老师'], ['registrationSource', '来源']]) {
      const aggregate = (start, end) => {
        const values = new Map();
        for (const record of records) {
          const date = day(record.createdAt);
          if (!date || (start && date < start) || (end && date > end)) continue;
          const value = record[key] || '未填写';
          values.set(value, (values.get(value) || 0) + 1);
        }
        return [...values].map(([name, count]) => ({ label: name, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
      };
      registrationGroups[key] = { label, subtotal: aggregate(f.start, f.end), academicYear: aggregate(f.academicStart, f.academicEnd) };
    }
  }
  const page = Math.max(1, Math.min(Math.ceil(rows.length/30)||1, Number.isSafeInteger(f.page) ? f.page : 1));
  rows.sort((a,b) => b.date.localeCompare(a.date) || String(a.id).localeCompare(String(b.id)));
  return { options, groups, registrationGroups, categoryGroups, trend: [...trend.values()].sort((a,b)=>a.label.localeCompare(b.label)), statuses, total: rows.length, confirmedCount: confirmed.length, amount: confirmed.reduce((n,r)=>n+r.amount,0), missingDates, page, pages: Math.ceil(rows.length/30)||1, rows: rows.slice((page-1)*30,page*30) };
}
module.exports = { summarize, validateFilters };
