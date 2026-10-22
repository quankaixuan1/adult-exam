const api = require('../../services/api');
const statusText = {
  pending: '待审核',
  approved: '已通过',
  rejected: '需补充材料'
};
Page({
  data: {
    loading: false,
    busy: false,
    error: '',
    student: null,
    registration: null,
    ready: false,
    demoMode: false,
    configKnown: false
  },
  onShow() {
    this.load();
  },
  onHide() {
    this.visible = false;
    this.requestId = (this.requestId || 0) + 1;
    this.setData({
      student: null,
      registration: null
    });
  },
  onUnload() {
    this.visible = false;
    this.requestId = (this.requestId || 0) + 1;
  },
  async load() {
    this.visible = true;
    const requestId = (this.requestId || 0) + 1;
    this.requestId = requestId;
    this.setData({
      loading: true,
      busy: false,
      error: '',
      student: null,
      registration: null
    });
    try {
      const config = await api.config();
      if (!this.visible || this.requestId !== requestId) return;
      this.setData({
        ready: config.wechatReady,
        demoMode: config.demoMode,
        configKnown: true
      });
      if (api.hasSession()) {
        const student = (await api.me()).student;
        const {
          registration
        } = await api.mine();
        if (this.visible && this.requestId === requestId) this.setData({
          student,
          registration: this.present(registration)
        });
      }
    } catch (e) {
      if (this.visible && this.requestId === requestId) this.setData({
        error: e.message
      });
    } finally {
      if (this.visible && this.requestId === requestId) this.setData({
        loading: false
      });
    }
  },
  present(value) {
    if (!value) return null;
    const materials = value.materials || {};
    return {
      ...value,
      materials,
      initial: String(value.name || '微').slice(0, 1),
      materialsCompleted: ['idFront', 'idBack', 'education', 'photo'].filter(kind => materials[kind] && materials[kind].fileId).length,
      materialsPercent: ['idFront', 'idBack', 'education', 'photo'].filter(kind => materials[kind] && materials[kind].fileId).length * 25,
      statusText: statusText[value.status] || '处理中'
    };
  },
  async login() {
    if (this.data.busy || this.data.loading) return;
    this.setData({
      busy: true,
      error: ''
    });
    const requestId = this.requestId;
    try {
      const student = await api.login();
      const {
        registration
      } = await api.mine();
      if (this.visible && this.requestId === requestId) this.setData({
        student,
        registration: this.present(registration)
      });
    } catch (e) {
      if (this.visible && this.requestId === requestId) this.setData({
        error: e.message
      });
    } finally {
      if (this.visible && this.requestId === requestId) this.setData({
        busy: false
      });
    }
  },
  async demoLogin() {
    if (this.data.busy) return;
    this.setData({
      busy: true,
      error: ''
    });
    try {
      const student = await api.demoLogin();
      const {
        registration
      } = await api.mine();
      this.setData({
        student,
        registration: this.present(registration)
      });
    } catch (e) {
      this.setData({
        error: e.message
      });
    } finally {
      this.setData({
        busy: false
      });
    }
  },
  async logout() {
    if (this.data.busy) return;
    this.setData({
      busy: true,
      error: ''
    });
    try {
      await api.logout();
      this.setData({
        student: null,
        registration: null
      });
    } catch (e) {
      this.setData({
        error: '退出未完成：' + e.message
      });
    } finally {
      this.setData({
        busy: false
      });
    }
  },
  register() {
    wx.navigateTo({
      url: '/pages/register/register'
    });
  },
  edit() {
    wx.navigateTo({
      url: '/pages/register/register?mode=edit'
    });
  },
  materials() {
    wx.navigateTo({ url: '/pages/materials/materials' });
  },
  verification() {
    wx.navigateTo({
      url: '/pages/search/search'
    });
  }
});
