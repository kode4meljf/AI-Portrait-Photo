/**
 * @file 登录主体（门店 / 个人）工具
 */

const { ACCOUNT_TYPE, PROFILE_COLLECTION } = require('../config/constants');

const STORE_DEFAULT_PROFILE = {
  accountType: 'store',
  name: 'AI写真馆',
  contactName: '管理员',
  contactPhone: '13800000000',
  address: '默认地址',
  avatarUrl: '',
  level: '普通会员',
  balance: 30,
  packageTotal: 0,
  packageUsed: 0,
  packageExpireDate: null
};

const PERSONAL_DEFAULT_PROFILE = {
  accountType: 'personal',
  nickName: '微信用户',
  avatarUrl: '',
  phone: '',
  balance: 0
};

function getAppSafe() {
  try {
    return getApp();
  } catch (e) {
    return null;
  }
}

function getAccountType() {
  const app = getAppSafe();
  return app?.globalData?.accountType || ACCOUNT_TYPE;
}

function getProfileCollection(type) {
  const accountType = type || getAccountType();
  return PROFILE_COLLECTION[accountType] || PROFILE_COLLECTION.store;
}

function getAccountId() {
  const app = getAppSafe();
  return app?.globalData?.accountId || app?.globalData?.storeId || app?.globalData?.openId || null;
}

function isStoreAccount() {
  return getAccountType() === 'store';
}

function isPersonalAccount() {
  return getAccountType() === 'personal';
}

/**
 * 读取或初始化当前主体档案（docId = openId）
 */
async function ensureAccountProfile(db, accountId, accountType) {
  const type = accountType || getAccountType();
  const collection = getProfileCollection(type);
  const ref = db.collection(collection).doc(accountId);
  const defaults = type === 'personal' ? PERSONAL_DEFAULT_PROFILE : STORE_DEFAULT_PROFILE;

  try {
    const res = await ref.get();
    if (res.data) {
      if (!res.data.accountType) {
        await ref.update({ data: { accountType: type } });
      }
      return res.data;
    }
  } catch (e) {
    // 文档不存在
  }

  await ref.set({
    data: {
      ...defaults,
      createTime: db.serverDate()
    }
  });
  const created = await ref.get();
  return created.data;
}

/**
 * 读取当前主体档案
 */
async function loadAccountProfile(db, accountId, accountType) {
  const type = accountType || getAccountType();
  const collection = getProfileCollection(type);
  const res = await db.collection(collection).doc(accountId).get();
  return res.data;
}

module.exports = {
  STORE_DEFAULT_PROFILE,
  PERSONAL_DEFAULT_PROFILE,
  getAccountType,
  getProfileCollection,
  getAccountId,
  isStoreAccount,
  isPersonalAccount,
  ensureAccountProfile,
  loadAccountProfile
};
