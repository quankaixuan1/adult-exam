// 人员编号用于权限判断；同名人员在不同校区分别建档。
const campuses = ['文一校区', '下沙校区', '城西校区', '经济校区'];
const positions = {
  principal: '校长', admissions: '招生负责人', finance: '财务负责人',
  campusLead: '校区负责人', teacher: '报名老师'
};
const members = [
  { id: 'principal', name: '戚卫良', position: 'principal', campus: '' },
  { id: 'admissions', name: '高建锋', position: 'admissions', campus: '' },
  { id: 'finance', name: '邵萍', position: 'finance', campus: '' },
  ...[
    ['wenyi-deng', '邓博文', 0, true], ['wenyi-liu', '刘慧敏', 0], ['wenyi-rong', '荣健', 0],
    ['wenyi-yang', '杨伟红', 0], ['wenyi-gao', '高燕妮', 0], ['wenyi-jiang', '姜驰', 0],
    ['xiasha-zhou', '周燕', 1, true], ['xiasha-huang', '黄婷婷', 1], ['xiasha-ke', '柯琳', 1],
    ['chengxi-ying', '应晨霞', 2, true], ['chengxi-zhou', '周钱露', 2],
    ['jingji-wu', '吴珊', 3, true], ['jingji-he', '何宇昊', 3], ['jingji-tu', '屠老师', 3]
  ].map(([id, name, campus, lead]) => ({ id, name, campus: campuses[campus], position: lead ? 'campusLead' : 'teacher' }))
];
const managementPositions = ['principal', 'admissions', 'finance', 'financeStaff'];
const memberById = id => members.find(member => member.id === id);
module.exports = { campuses, positions, members, managementPositions, memberById };
