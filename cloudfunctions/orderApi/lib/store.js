const cloud = require('wx-server-sdk');
const db = cloud.database();
const DEFAULT_STORE = {
  accountType: 'store',
  name: 'AI写真馆',
  contactName: '管理员',
  contactPhone: '13800000000',
  address: '默认地址',
  avatarUrl: '',
  level: '普通会员',
  balance: 100,
  packageTotal: 0,
  packageUsed: 0,
  packageExpireDate: null
};
async function ensureStoreProfile(storeId) {
  const ref = db.collection('stores').doc(storeId);
  try {
    const res = await ref.get();
    if (res.data) return res.data;
  } catch (e) {}
  await ref.set({ data: { ...DEFAULT_STORE, createTime: db.serverDate() } });
  const created = await ref.get();
  return created.data;
}
module.exports = { ensureStoreProfile };
