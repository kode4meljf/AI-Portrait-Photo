import { adminRequest } from './client'

export const api = {
  login: (username, password) => adminRequest('login', { username, password }),
  ping: () => adminRequest('ping'),

  getDashboard: (params) => adminRequest('dashboard', params),
  listStores: (params) => adminRequest('stores.list', {}, params),
  getStore: (storeId) => adminRequest('stores.get', { storeId }),
  updateStore: (data) => adminRequest('stores.update', data),

  listCustomers: (params) => adminRequest('customers.list', {}, params),
  getCustomer: (id) => adminRequest('customers.get', { id }),
  updateCustomer: (data) => adminRequest('customers.update', data),

  listOrders: (params) => adminRequest('orders.list', {}, params),
  getOrderStatusCounts: (params) => adminRequest('orders.statusCounts', {}, params),
  updateOrderStatus: (data) => adminRequest('orders.updateStatus', data),

  listCheckins: (params) => adminRequest('checkins.list', {}, params),
  getCheckinSummary: (params) => adminRequest('checkins.summary', params)
}
