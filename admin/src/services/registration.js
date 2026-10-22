export const statusLabels = { pending: '待审核', approved: '已通过', rejected: '需补充' };
export const materialLabels = { idFront: '身份证人像面', idBack: '身份证国徽面', education: '学历备案表或毕业证', photo: '证件电子照片' };
export const materialCount = item => Object.keys(item.materials || {}).length;
export const showValue = value => value === undefined || value === null || String(value).trim() === '' ? '未提供' : value;
export const showBoolean = value => value === true ? '是' : value === false ? '否' : '未提供';
