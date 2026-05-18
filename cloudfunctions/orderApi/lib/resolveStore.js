const cloud = require('wx-server-sdk');
const { isValidStoreId } = require('./storeId');

const db = cloud.database();

async function resolveStoreIdFromOpenid(openid) {
  const res = await db
    .collection('store_members')
    .where({ memberOpenId: openid, status: 'active' })
    .limit(1)
    .get();
  if (!res.data.length) {
    throw new Error('非门店成员，无法操作');
  }
  const storeId = res.data[0].storeId;
  if (!isValidStoreId(storeId)) {
    throw new Error('门店ID无效，仅支持 store_ 格式');
  }
  return storeId;
}

module.exports = { resolveStoreIdFromOpenid };
