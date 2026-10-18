const programs = [
  { id: 'demo-a-edu', school: '示例大学 A', level: '专升本', major: '教育学', duration: '2.5 年', studyMode: '非脱产', fee: 100 },
  { id: 'demo-a-cn', school: '示例大学 A', level: '专升本', major: '汉语言文学', duration: '2.5 年', studyMode: '非脱产', fee: 100 },
  { id: 'demo-a-admin', school: '示例大学 A', level: '高起专', major: '行政管理', duration: '2.5 年', studyMode: '非脱产', fee: 80 },
  { id: 'demo-b-account', school: '示例学院 B', level: '高起专', major: '大数据与会计', duration: '2.5 年', studyMode: '非脱产', fee: 80 },
  { id: 'demo-b-pre', school: '示例学院 B', level: '高起专', major: '学前教育', duration: '2.5 年', studyMode: '非脱产', fee: 80 },
  { id: 'demo-c-law', school: '示例大学 C', level: '专升本', major: '法学', duration: '2.5 年', studyMode: '非脱产', fee: 120 }
];

function publicCatalog() { return programs.map(program => ({ ...program })); }
function findProgram(id) { return programs.find(program => program.id === id) || null; }

module.exports = { publicCatalog, findProgram };
