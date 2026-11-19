const paymentValues = (record, field) => [...new Set((record.paymentProofs || []).map(p => p.paymentInfo?.[field]).filter(Boolean))].join('；');
const columns = [
  ['日期', r => r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : ''],
  ['工会', r => r.unionMember == null ? '' : r.unionMember ? '是' : '否'],
  ['退伍', r => r.veteran == null ? '' : r.veteran ? '是' : '否'],
  ['报名学区', r => r.campus], ['上课学区', r => r.studyCampus],
  ['学生编号', r => r.studentNo], ['姓名', r => r.name], ['性别', r => r.gender],
  ['民族', r => r.ethnicity], ['身份证号码', r => r.idNumber],
  ['专业班级', r => r.major], ['层次', r => r.level], ['学校', r => r.school],
  ['班级编号', r => r.classId],
  ['学费', r => r.paymentBreakdown?.tuition], ['报考费', r => r.paymentBreakdown?.exam],
  ['教材', r => r.paymentBreakdown?.materials], ['联系电话', r => r.phone],
  ['第2联系人', r => [r.emergencyName, r.emergencyPhone].filter(Boolean).join(' · ')],
  ['报名老师', r => r.teacherName], ['来源', r => r.registrationSource],
  ['凭据号', r => paymentValues(r, 'transactionNo')], ['支付方式', r => paymentValues(r, 'channel')],
  ['备注（高复教材）', r => r.note], ['介绍人', r => r.referrer],
  ['工作单位', r => r.workUnit], ['通讯地址', r => r.currentAddress]
];
export async function registrationXlsx(rows) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('报名记录', { views: [{ state: 'frozen', ySplit: 1 }] });
  const values = rows.map(record => columns.map(([, get]) => get(record) ?? ''));
  const textWidth = value => Math.max(...String(value).split(/\r?\n/).map(line => Array.from(line).reduce((width, char) => width + (char.codePointAt(0) > 255 ? 2 : 1), 0)));
  sheet.columns = columns.map(([header], index) => ({
    header,
    width: Math.min(48, Math.max(12, values.reduce((width, row) => Math.max(width, textWidth(row[index])), textWidth(header)) + 3))
  }));
  for (const row of values) sheet.addRow(row);
  sheet.eachRow(row => {
    row.alignment = { vertical: 'middle', wrapText: true };
    let lines = 1;
    row.eachCell((cell, index) => {
      const width = Math.max(1, sheet.getColumn(index).width - 3);
      const count = String(cell.value ?? '').split(/\r?\n/).reduce((sum, line) => sum + Math.max(1, Math.ceil(textWidth(line) / width)), 0);
      lines = Math.max(lines, count);
    });
    row.height = lines * 16 + 8;
  });
  for (const header of ['学生编号', '身份证号码', '班级编号', '联系电话', '凭据号']) {
    sheet.getColumn(columns.findIndex(([name]) => name === header) + 1).numFmt = '@';
  }
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return workbook.xlsx.writeBuffer();
}
