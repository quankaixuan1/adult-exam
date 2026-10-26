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
    notifications: [],
    unreadTotal: 0,
    notificationError: '',
    readingNotification: false,
    ready: false,
    demoMode: false,
    configKnown: false
  },
  onShow() {
    this.load();
  },
  onHide() {
    this.visible = false;
    this.stopNotificationPolling();
    this.requestId = (this.requestId || 0) + 1;
    this.setData({
      student: null,
      registration: null,
      notifications: [],
      unreadTotal: 0,
      readingNotification: false
    });
  },
  onUnload() {
    this.visible = false;
    this.stopNotificationPolling();
    this.requestId = (this.requestId || 0) + 1;
  },
  async load() {
    this.stopNotificationPolling();
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
        if (this.visible && this.requestId === requestId) {
          this.setData({ student, registration: this.present(registration) });
          this.refreshNotifications();
        }
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
      needsDemoPayment: value.paymentStatus === 'pending',
      paymentText: value.paymentStatus === 'demo_completed' ? '已完成模拟缴费（未真实付款）' : value.paymentStatus === 'pending' ? '待模拟缴费' : '未核验',
      statusText: value.paymentStatus === 'pending' ? '待模拟缴费' : statusText[value.status] || '处理中'
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
      if (this.visible && this.requestId === requestId) {
        this.setData({ student, registration: this.present(registration) });
        this.refreshNotifications();
      }
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
      this.refreshNotifications();
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
      this.stopNotificationPolling();
      this.requestId = (this.requestId || 0) + 1;
      this.setData({
        student: null,
        registration: null,
        notifications: [],
        unreadTotal: 0,
        notificationError: ''
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
  stopNotificationPolling() {
    clearTimeout(this.notificationTimer);
    this.notificationTimer = null;
  },
  async refreshNotifications() {
    this.stopNotificationPolling();
    if (!this.visible || !this.data.student || !api.hasSession() || this.notificationBusy) return;
    const requestId = this.requestId;
    const generation = this.notificationGeneration || 0;
    this.notificationBusy = true;
    try {
      const result = await api.notifications();
      if (!this.visible || requestId !== this.requestId || generation !== (this.notificationGeneration || 0)) return;
      const changed = result.notifications.some(item => !this.data.notifications.some(previous => previous.id === item.id));
      this.setData({
        notifications: result.notifications.map(item => ({
          ...item, statusText: statusText[item.status] || '审核状态已更新',
          timeText: new Date(item.createdAt).toLocaleString()
        })),
        unreadTotal: result.unreadTotal,
        notificationError: ''
      });
      if (changed) {
        const { registration } = await api.mine();
        if (this.visible && requestId === this.requestId && generation === (this.notificationGeneration || 0)) this.setData({ registration: this.present(registration) });
      }
    } catch (e) {
      if (this.visible && requestId === this.requestId && generation === (this.notificationGeneration || 0)) this.setData({ notificationError: e.message || '消息读取失败' });
    } finally {
      this.notificationBusy = false;
      if (this.visible && this.data.student && api.hasSession()) {
        this.notificationTimer = setTimeout(() => this.refreshNotifications(), generation === (this.notificationGeneration || 0) ? 30000 : 0);
      }
    }
  },
  async readNotification(e) {
    if (this.data.readingNotification) return;
    const item = this.data.notifications.find(value => value.id === e.currentTarget.dataset.id);
    if (!item) return;
    const requestId = this.requestId;
    this.setData({ readingNotification: true });
    try {
      const answer = await new Promise(resolve => wx.showModal({
        title: item.statusText,
        content: item.remark || '请在“我的报名”查看当前资料和审核进度。',
        confirmText: '我知道了', cancelText: '稍后查看', success: resolve,
        fail: () => resolve({ confirm: false })
      }));
      if (!answer.confirm || !this.visible || requestId !== this.requestId) return;
      await api.readNotification(item.id);
      if (this.visible && requestId === this.requestId) {
        this.notificationGeneration = (this.notificationGeneration || 0) + 1;
        this.setData({ notifications: this.data.notifications.filter(value => value.id !== item.id),
          unreadTotal: Math.max(0, this.data.unreadTotal - 1) });
        await this.refreshNotifications();
      }
    } catch (error) {
      if (this.visible && requestId === this.requestId) this.setData({ notificationError: error.message });
    } finally {
      if (this.visible && requestId === this.requestId) this.setData({ readingNotification: false });
    }
  },
  pay() {
    wx.navigateTo({ url: '/pages/payment/payment' });
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
