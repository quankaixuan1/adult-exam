import { statusLabels, paymentStatusLabels } from './registration';
const columns = [
  ['姓名', r => r.name], ['手机号', r => r.phone], ['身份证号', r => r.idNumber],
  ['性别', r => r.gender], ['民族', r => r.ethnicity], ['学历', r => r.education],
  ['工作单位', r => r.workUnit], ['现居住地址', r => r.currentAddress], ['政治面貌', r => r.politicalStatus],
  ['工会会员', r => r.unionMember == null ? '' : r.unionMember ? '是' : '否'],
  ['退役军人', r => r.veteran == null ? '' : r.veteran ? '是' : '否'],
  ['第二联系人', r => r.emergencyName], ['联系人电话', r => r.emergencyPhone],
  ['层次', r => r.level], ['学校', r => r.school], ['专业', r => r.major], ['学制', r => r.duration],
  ['学习形式', r => r.studyMode], ['考试科目', r => r.examCategory], ['就读校区', r => r.studyCampus],
  ['报名校区', r => r.campus], ['所属老师', r => r.teacherName],
  ['报名来源', r => r.registrationSource], ['介绍人', r => r.referrer],
  ['报名状态', r => statusLabels[r.status] || r.status], ['缴费状态', r => paymentStatusLabels[r.paymentStatus] || '未缴费'],
  ['考试费', r => r.paymentBreakdown?.exam], ['高复教材资料费', r => r.paymentBreakdown?.materials],
  ['高复学费', r => r.paymentBreakdown?.tuition], ['实际缴费合计', r => r.actualPaidAmount],
  ['备注', r => r.note], ['提交时间', r => r.createdAt]
];
export async function registrationXlsx(rows) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('报名记录', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map(([header]) => ({ header, width: header === '身份证号' ? 24 : 20 }));
  for (const record of rows) sheet.addRow(columns.map(([, get]) => get(record) ?? ''));
  sheet.getColumn(3).numFmt = '@';
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return workbook.xlsx.writeBuffer();
}
