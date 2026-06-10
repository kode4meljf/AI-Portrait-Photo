const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
const { ORDER_TYPES, STATUS_TAB_MAP, ORDER_STATUSES } = require('./config');
const { ensureStoreProfile } = require('./store');
const { chargeStorePoints, refundStorePoints } = require('./balance');
const { readAlbumPlatformConfig } = require('./albumPlatformConfig');
const { invalidateLogisticsFields } = require('./orderLogistics');

const ALBUM_PRODUCT_NAME = '写真集';

function getAlbumConfig() {
  return ORDER_TYPES.album;
}

function albumPointsForCount(count, pointsPerPhoto) {
  const rate = Math.max(1, Math.floor(Number(pointsPerPhoto) || 23));
  return Math.max(0, Number(count) || 0) * rate;
}

async function createAlbumOrder(event, storeId) {
  const albumConfig = await readAlbumPlatformConfig(db);
  const { albumSelectMin, albumSelectMax, albumPointsPerPhoto } = albumConfig;

  const customerId = (event.customerId || '').trim() || null;
  const photoIds = Array.isArray(event.photoIds) ? event.photoIds.filter(Boolean) : [];
  const photoUrls = Array.isArray(event.photoUrls) ? event.photoUrls.filter(Boolean) : [];
  const count = photoIds.length;

  if (count < albumSelectMin || count > albumSelectMax) {
    return { success: false, error: `请选择 ${albumSelectMin}～${albumSelectMax} 张照片` };
  }
  if (photoUrls.length !== count) {
    return { success: false, error: '照片数据不完整' };
  }

  const pointsCost = albumPointsForCount(count, albumPointsPerPhoto);
  await ensureStoreProfile(storeId);

  const charge = await chargeStorePoints(storeId, pointsCost);
  if (!charge.ok) return { success: false, error: charge.error };

  const orderNo = `${getAlbumConfig().orderNoPrefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const coverUrl = photoUrls[0] || '';

  try {
    const orderRes = await db.collection(getAlbumConfig().collection).add({
      data: {
        orderType: 'album',
        orderNo,
        storeId,
        customerId,
        albumName: ALBUM_PRODUCT_NAME,
        frameName: ALBUM_PRODUCT_NAME,
        photoCount: count,
        photoIds,
        photoUrls,
        photoUrl: coverUrl,
        pointsCost,
        status: '待处理',
        shippingNo: null,
        createTime: db.serverDate()
      }
    });
    return { success: true, orderId: orderRes._id, orderNo, pointsCost };
  } catch (err) {
    await refundStorePoints(storeId, pointsCost);
    throw err;
  }
}

async function loadCustomerMap(customerIds) {
  if (!customerIds.length) return {};
  const res = await db.collection('customers').where({ _id: _.in(customerIds) }).get();
  const map = {};
  res.data.forEach((c) => {
    map[c._id] = c;
  });
  return map;
}

async function listAlbumOrders(event, storeId) {
  const { statusTab = 'all', customerId, page = 1, pageSize = 20 } = event;
  const where = { storeId };
  if (customerId) where.customerId = customerId;
  if (statusTab !== 'all' && STATUS_TAB_MAP[statusTab]) {
    where.status = STATUS_TAB_MAP[statusTab];
  }
  const skip = Math.max(0, (Number(page) - 1) * Number(pageSize));
  const res = await db
    .collection(getAlbumConfig().collection)
    .where(where)
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get();
  const customerIds = [...new Set(res.data.map((o) => o.customerId).filter(Boolean))];
  const customerMap = await loadCustomerMap(customerIds);
  const list = res.data.map((order) => ({
    ...order,
    customerInfo: order.customerId ? customerMap[order.customerId] || null : null
  }));
  return { success: true, list, hasMore: list.length === Number(pageSize) };
}

async function assertAlbumOrder(orderId, storeId) {
  const res = await db.collection(getAlbumConfig().collection).doc(orderId).get();
  const order = res.data;
  if (!order || order.storeId !== storeId) throw new Error('订单不存在或无权访问');
  return order;
}

async function getAlbumOrder(event, storeId) {
  const { orderId } = event;
  if (!orderId) return { success: false, error: '缺少 orderId' };
  const order = await assertAlbumOrder(orderId, storeId);
  let customerInfo = null;
  if (order.customerId) {
    const map = await loadCustomerMap([order.customerId]);
    customerInfo = map[order.customerId] || null;
  }
  return { success: true, order: { ...order, customerInfo } };
}

async function updateAlbumOrderStatus(event, storeId) {
  const { orderId, status, shippingNo, shippingCom, shippingCompanyName } = event;
  if (!orderId || !status) return { success: false, error: '缺少 orderId 或 status' };
  if (!ORDER_STATUSES.includes(status)) return { success: false, error: '无效订单状态' };
  const order = await assertAlbumOrder(orderId, storeId);
  const data = { status, updateTime: db.serverDate() };
  if (shippingNo !== undefined) data.shippingNo = shippingNo;
  if (shippingCom !== undefined) data.shippingCom = shippingCom;
  if (shippingCompanyName !== undefined) data.shippingCompanyName = shippingCompanyName;
  if (status === '已发货' && !order.shippedAt) data.shippedAt = db.serverDate();
  if (status === '已完成' && !order.completedAt) data.completedAt = db.serverDate();
  const shippingChanged =
    (shippingNo !== undefined && String(shippingNo || '').trim() !== String(order.shippingNo || '').trim()) ||
    (shippingCom !== undefined && String(shippingCom || '').trim() !== String(order.shippingCom || '').trim());
  if (shippingChanged) Object.assign(data, invalidateLogisticsFields());
  await db.collection(getAlbumConfig().collection).doc(orderId).update({ data });
  const res = await db.collection(getAlbumConfig().collection).doc(orderId).get();
  return { success: true, order: res.data };
}

async function countAlbumOrdersByStatus(event, storeId) {
  const { customerId } = event;
  const base = { storeId };
  if (customerId) base.customerId = customerId;
  const counts = { pending: 0, producing: 0, shipped: 0, done: 0 };
  await Promise.all(
    Object.keys(STATUS_TAB_MAP).map(async (tab) => {
      const res = await db
        .collection(getAlbumConfig().collection)
        .where({ ...base, status: STATUS_TAB_MAP[tab] })
        .count();
      counts[tab] = res.total;
    })
  );
  return {
    success: true,
    counts: {
      all: counts.pending + counts.producing + counts.shipped + counts.done,
      ...counts
    }
  };
}

module.exports = {
  createAlbumOrder,
  listAlbumOrders,
  getAlbumOrder,
  updateAlbumOrderStatus,
  countAlbumOrdersByStatus,
  albumPointsForCount
};
