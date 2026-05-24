const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
const { ORDER_TYPES, STATUS_TAB_MAP, ORDER_STATUSES } = require('./config');
const { normalizePhotoUrl } = require('./photo');
const { ensureStoreProfile } = require('./store');
const { deleteCloudFileSafe } = require('./cloudFile')
function getFrameConfig() { return ORDER_TYPES.frame; }
async function assertStoreOrder(orderId, storeId) {
  const res = await db.collection(getFrameConfig().collection).doc(orderId).get();
  const order = res.data;
  if (!order || order.storeId !== storeId) throw new Error('订单不存在或无权访问');
  return order;
}
async function loadCustomerMap(customerIds) {
  if (!customerIds.length) return {};
  const res = await db.collection('customers').where({ _id: _.in(customerIds) }).get();
  const map = {};
  res.data.forEach((c) => { map[c._id] = c; });
  return map;
}
async function createFrameOrder(event, storeId) {
  const { frameTemplateId, frameName, photoUrl, styleId, styleName, customerId } = event;
  if (!frameTemplateId) return { success: false, error: '缺少 frameTemplateId（相框模板）' };
  if (!frameName) return { success: false, error: '缺少 frameName（相框名称）' };
  if (!photoUrl) return { success: false, error: '缺少 photoUrl（照片）' };

  const store = await ensureStoreProfile(storeId);
  const balance = store?.balance ?? 0;
  if (balance < 1) return { success: false, error: '摆件相框次数不足，请充值' };

  const { url: finalPhotoUrl, orphanFileId } = await normalizePhotoUrl(photoUrl, storeId);

  const orderNo = `${getFrameConfig().orderNoPrefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
  let orderRes;
  try {
    orderRes = await db.collection(getFrameConfig().collection).add({
      data: {
        orderType: 'frame', orderNo, storeId, customerId: customerId || null,
        frameTemplateId, frameName, photoUrl: finalPhotoUrl,
        styleId: styleId || '', styleName: styleName || '',
        status: '待处理', shippingNo: null, createTime: db.serverDate()
      }
    });
    await db.collection('stores').doc(storeId).update({ data: { balance: _.inc(-1) } });
  } catch (err) {
    if (orphanFileId) await deleteCloudFileSafe(orphanFileId);
    throw err;
  }
  return { success: true, orderId: orderRes._id, orderNo };
}
async function listFrameOrders(event, storeId) {
  const { statusTab = 'all', customerId, page = 1, pageSize = 20 } = event;
  const where = { storeId };
  if (customerId) where.customerId = customerId;
  if (statusTab !== 'all' && STATUS_TAB_MAP[statusTab]) where.status = STATUS_TAB_MAP[statusTab];
  const skip = Math.max(0, (Number(page) - 1) * Number(pageSize));
  const res = await db.collection(getFrameConfig().collection).where(where).orderBy('createTime', 'desc').skip(skip).limit(pageSize).get();
  const customerIds = [...new Set(res.data.map((o) => o.customerId).filter(Boolean))];
  const customerMap = await loadCustomerMap(customerIds);
  const list = res.data.map((order) => ({ ...order, customerInfo: order.customerId ? customerMap[order.customerId] || null : null }));
  return { success: true, list, hasMore: list.length === Number(pageSize) };
}
async function getFrameOrder(event, storeId) {
  const { orderId } = event;
  if (!orderId) return { success: false, error: '缺少 orderId' };
  const order = await assertStoreOrder(orderId, storeId);
  let customerInfo = null;
  if (order.customerId) {
    const map = await loadCustomerMap([order.customerId]);
    customerInfo = map[order.customerId] || null;
  }
  return { success: true, order: { ...order, customerInfo } };
}
async function updateFrameOrderStatus(event, storeId) {
  const { orderId, status, shippingNo } = event;
  if (!orderId || !status) return { success: false, error: '缺少 orderId 或 status' };
  if (!ORDER_STATUSES.includes(status)) return { success: false, error: '无效订单状态' };
  await assertStoreOrder(orderId, storeId);
  const data = { status, updateTime: db.serverDate() };
  if (shippingNo !== undefined) data.shippingNo = shippingNo;
  await db.collection(getFrameConfig().collection).doc(orderId).update({ data });
  const res = await db.collection(getFrameConfig().collection).doc(orderId).get();
  return { success: true, order: res.data };
}
async function countFrameOrdersByStatus(event, storeId) {
  const { customerId } = event;
  const base = { storeId };
  if (customerId) base.customerId = customerId;
  const counts = { pending: 0, producing: 0, shipped: 0, done: 0 };
  await Promise.all(Object.keys(STATUS_TAB_MAP).map(async (tab) => {
    const res = await db.collection(getFrameConfig().collection).where({ ...base, status: STATUS_TAB_MAP[tab] }).count();
    counts[tab] = res.total;
  }));
  return { success: true, counts: { all: counts.pending + counts.producing + counts.shipped + counts.done, ...counts } };
}
module.exports = { createFrameOrder, listFrameOrders, getFrameOrder, updateFrameOrderStatus, countFrameOrdersByStatus };
