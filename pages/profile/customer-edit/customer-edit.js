Page({
  data: {
    id: '',
    saving: false,
    changed: false,
    form: {
      nickName: '',
      phone: ''
    },
    snapshot: {
      nickName: '',
      phone: ''
    }
  },

  onLoad(options) {
    const id = options.id || '';
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    this.setData({ id });
    this.loadCustomer();
  },

  async loadCustomer() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('customers').doc(this.data.id).get();
      const nickName = res.data.nickName || '';
      const phone = res.data.phone || '';
      const snapshot = { nickName, phone };
      this.setData({
        form: { ...snapshot },
        snapshot,
        changed: false
      });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value || '';
    this.setData({ [`form.${key}`]: value }, this.refreshChanged);
  },

  refreshChanged() {
    const { form, snapshot } = this.data;
    const changed = form.nickName !== snapshot.nickName || form.phone !== snapshot.phone;
    this.setData({ changed });
  },

  async onSave() {
    if (this.data.saving || !this.data.changed) return;
    this.setData({ saving: true });
    try {
      const db = wx.cloud.database();
      await db.collection('customers').doc(this.data.id).update({
        data: {
          nickName: (this.data.form.nickName || '').trim(),
          phone: (this.data.form.phone || '').trim(),
          updateTime: Date.now()
        }
      });
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 400);
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  }
});
