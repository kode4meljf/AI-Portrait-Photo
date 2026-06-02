const cloud = require('wx-server-sdk');

// 必须先 init，再 require 会使用 database() 的子模块
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { ORDER_TYPES } = require('./lib/config');
const frameHandlers = require('./lib/frame');
const logisticsHandlers = require('./lib/logistics');
const { resolveStoreIdFromOpenid } = require('./lib/resolveStore');

const HANDLERS = {
  frame: {
    create: frameHandlers.createFrameOrder,
    list: frameHandlers.listFrameOrders,
    get: frameHandlers.getFrameOrder,
    getLogistics: logisticsHandlers.getFrameOrderLogistics,
    updateStatus: frameHandlers.updateFrameOrderStatus,
    countByStatus: frameHandlers.countFrameOrdersByStatus
  }
};

exports.main = async (event) => {
  const action = event.action;
  const orderType = event.orderType || 'frame';

  if (!action) return { success: false, error: '缺少 action' };
  if (!ORDER_TYPES[orderType]) {
    return { success: false, error: `不支持的订单类型: ${orderType}` };
  }
  const typeHandlers = HANDLERS[orderType];
  if (!typeHandlers || !typeHandlers[action]) {
    if (orderType === 'album') return { success: false, error: '影集订单功能开发中' };
    return { success: false, error: `未知 action: ${action}` };
  }

  const openid = cloud.getWXContext().OPENID;
  if (!openid) {
    return { success: false, error: '未登录' };
  }

  try {
    const storeId = await resolveStoreIdFromOpenid(openid);
    return await typeHandlers[action](event, storeId);
  } catch (error) {
    console.error(`[orderApi] ${orderType}.${action}`, error);
    return { success: false, error: error.message || '操作失败' };
  }
};
