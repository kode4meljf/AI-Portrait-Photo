const AVATAR_BG = ['#4e7cf6', '#5ac8a8', '#f5a623', '#e85d75', '#8b6fd4', '#3db0e4', '#7ebc59', '#d94dbb']

function pickAvatarTint(key) {
  const s = String(key || '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return AVATAR_BG[h % AVATAR_BG.length]
}

function initialFromName(name) {
  const t = (name || '').trim()
  if (!t) return '客'
  return t.slice(0, 1)
}

Page({
  data: {
    id: '',
    saving: false,
    changed: false,
    form: {
      nickName: '',
      phone: '',
      remark: ''
    },
    snapshot: {
      nickName: '',
      phone: '',
      remark: ''
    },
    avatarUrl: '',
    avatarInitial: '客',
    avatarTint: '#4e7cf6'
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
      const data = res.data;
      const nickName = data.nickName || '';
      const phone = data.phone || '';
      const remark = data.remark || '';
      const snapshot = { nickName, phone, remark };
      this.setData({
        form: { ...snapshot },
        snapshot,
        changed: false,
        avatarUrl: data.avatarUrl || '',
        avatarInitial: initialFromName(nickName),
        avatarTint: pickAvatarTint(this.data.id || nickName)
      });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value || '';
    const patch = { [`form.${key}`]: value };
    if (key === 'nickName') {
      patch.avatarInitial = initialFromName(value);
    }
    this.setData(patch, this.refreshChanged);
  },

  refreshChanged() {
    const { form, snapshot } = this.data;
    const changed =
      form.nickName !== snapshot.nickName ||
      form.phone !== snapshot.phone ||
      form.remark !== snapshot.remark;
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
          remark: (this.data.form.remark || '').trim(),
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
