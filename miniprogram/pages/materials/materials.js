const api = require('../../services/api');
const MAX_SIZE = 10 * 1024 * 1024;
const IMAGE_KINDS = ['idFront', 'idBack', 'photo'];

function extensionOf(name, fallback = '') {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);
  return match ? match[1] : fallback;
}

function fileSizeText(size) {
  if (!size) return '';
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(size / 1024)}KB`;
}

Page({
  data: {
    loading: true,
    busyKind: '',
    error: '',
    registration: null,
    materials: {},
    completed: 0
  },

  onLoad() { this.load(); },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const { registration } = await api.mine();
      if (!registration) {
        wx.showModal({ title: '尚未报名', content: '请先提交报名信息，再上传报名材料。', showCancel: false, success: () => wx.navigateBack() });
        return;
      }
      const materials = registration.materials || {};
      this.setData({ registration, materials, completed: Object.keys(materials).filter(key => materials[key] && materials[key].fileId).length });
    } catch (e) {
      this.setData({ error: e.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  async chooseImage(e) {
    const kind = e.currentTarget.dataset.kind;
    if (!IMAGE_KINDS.includes(kind) || this.data.busyKind) return;
    try {
      const result = await wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['original'] });
      const file = result.tempFiles[0];
      await this.upload(kind, file.tempFilePath, file.size, file.tempFilePath.split('/').pop() || `${kind}.jpg`, extensionOf(file.tempFilePath, 'jpg'));
    } catch (e) {
      if (!/cancel/i.test(e.errMsg || e.message || '')) this.setData({ error: e.message || '选择图片失败' });
    }
  },

  async chooseEducationFile() {
    if (this.data.busyKind) return;
    try {
      const result = await wx.chooseMessageFile({ count: 1, type: 'all', extension: ['pdf', 'jpg', 'jpeg', 'png'] });
      const file = result.tempFiles[0];
      await this.upload('education', file.path, file.size, file.name || '学历材料', extensionOf(file.name || file.path));
    } catch (e) {
      if (!/cancel/i.test(e.errMsg || e.message || '')) this.setData({ error: e.message || '选择文件失败' });
    }
  },

  async upload(kind, filePath, size, fileName, extension) {
    if (!size || size > MAX_SIZE) {
      this.setData({ error: '单个文件大小不能超过10MB。' });
      return;
    }
    this.setData({ busyKind: kind, error: '' });
    wx.showLoading({ title: '正在上传', mask: true });
    let succeeded = false;
    try {
      const prepared = await api.prepareMaterialUpload({ kind, extension });
      const uploaded = await wx.cloud.uploadFile({ cloudPath: prepared.cloudPath, filePath });
      const result = await api.saveMaterial({ kind, fileId: uploaded.fileID, fileName, size });
      const materials = { ...this.data.materials, [kind]: result.material };
      this.setData({ materials, completed: Object.keys(materials).filter(key => materials[key] && materials[key].fileId).length });
      succeeded = true;
    } catch (e) {
      this.setData({ error: e.message || '上传失败，请重试' });
    } finally {
      wx.hideLoading();
      this.setData({ busyKind: '' });
    }
    if (succeeded) wx.showToast({ title: '上传成功', icon: 'success' });
  },

  async preview(e) {
    const kind = e.currentTarget.dataset.kind;
    const material = this.data.materials[kind];
    if (!material || !material.fileId) return;
    try {
      const extension = extensionOf(material.fileName || material.fileId);
      if (extension === 'pdf') {
        wx.showLoading({ title: '正在打开' });
        const downloaded = await wx.cloud.downloadFile({ fileID: material.fileId });
        await wx.openDocument({ filePath: downloaded.tempFilePath, fileType: 'pdf', showMenu: true });
        wx.hideLoading();
        return;
      }
      const result = await wx.cloud.getTempFileURL({ fileList: [material.fileId] });
      const url = result.fileList && result.fileList[0] && result.fileList[0].tempFileURL;
      if (!url) throw new Error('无法读取文件');
      wx.previewImage({ urls: [url] });
    } catch (e) {
      wx.hideLoading();
      this.setData({ error: e.message || '暂时无法预览文件' });
    }
  },

  sizeText(e) { return fileSizeText(e); }
});
