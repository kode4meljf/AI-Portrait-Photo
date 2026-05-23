import { adminRequest } from './client'

export const api = {
  login: (username, password) => adminRequest('login', { username, password }),
  ping: () => adminRequest('ping'),

  getDashboard: (params) => adminRequest('dashboard', params),
  listStores: (params) => adminRequest('stores.list', {}, params),
  getStore: (storeId) => adminRequest('stores.get', { storeId }),
  updateStore: (data) => adminRequest('stores.update', data),
  sendStoreAssetAdjustCode: (data) => adminRequest('stores.assetAdjust.sendCode', data),
  applyStoreAssetAdjust: (data) => adminRequest('stores.assetAdjust.apply', data),
  listStoreAssetAdjustments: (params) => adminRequest('stores.assetAdjust.list', {}, params),

  listCustomers: (params) => adminRequest('customers.list', {}, params),
  getCustomer: (id) => adminRequest('customers.get', { id }),
  updateCustomer: (data) => adminRequest('customers.update', data),
  uploadCustomerAvatar: (data) => adminRequest('customers.uploadAvatar', data),

  listOrders: (params) => adminRequest('orders.list', {}, params),
  getOrderStatusCounts: (params) => adminRequest('orders.statusCounts', {}, params),
  updateOrderStatus: (data) => adminRequest('orders.updateStatus', data),

  listCheckins: (params) => adminRequest('checkins.list', {}, params),
  getCheckinSummary: (params) => adminRequest('checkins.summary', params),

  listStyles: (params) => adminRequest('styles.list', {}, params),
  getStyle: (id) => adminRequest('styles.get', { id }),
  createStyle: (data) => adminRequest('styles.create', data),
  updateStyle: (data) => adminRequest('styles.update', data),
  deleteStyle: (data) => adminRequest('styles.delete', data),
  uploadStyleSample: (data) => adminRequest('styles.uploadSample', data),

  listFrames: (params) => adminRequest('frames.list', {}, params),
  getFrame: (id) => adminRequest('frames.get', { id }),
  createFrame: (data) => adminRequest('frames.create', data),
  updateFrame: (data) => adminRequest('frames.update', data),
  deleteFrame: (data) => adminRequest('frames.delete', data),
  uploadFrameCover: (data) => adminRequest('frames.uploadCover', data),

  getPlatformSettings: () => adminRequest('platformSettings.get'),
  updatePlatformSettings: (data) => adminRequest('platformSettings.update', data),

  listFeedbacks: (params) => adminRequest('feedbacks.list', {}, params),
  updateFeedbackStatus: (data) => adminRequest('feedbacks.updateStatus', data),
  deleteFeedback: (data) => adminRequest('feedbacks.delete', data)
}
