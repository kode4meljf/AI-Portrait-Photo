import axios from 'axios'
import { mockRequest } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
const API_PREFIX = import.meta.env.VITE_API_PREFIX || import.meta.env.VITE_API_BASE_URL || ''

const http = axios.create({
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

http.interceptors.response.use(
  (res) => {
    const body = res.data
    if (body && typeof body === 'object' && 'success' in body) {
      if (!body.success) {
        return Promise.reject(new Error(body.error || '请求失败'))
      }
      return body.data
    }
    return body
  },
  (err) => {
    const msg =
      err.response?.data?.error ||
      err.message ||
      '网络错误'
    return Promise.reject(new Error(msg))
  }
)

function resolveUrl() {
  if (!API_PREFIX) return ''
  if (API_PREFIX.startsWith('http')) return API_PREFIX
  return API_PREFIX
}

export async function adminRequest(action, payload = {}, query = {}) {
  if (USE_MOCK) {
    return mockRequest(action, payload, query)
  }

  const base = resolveUrl()
  if (!base) {
    throw new Error('请配置 VITE_API_BASE_URL 或开启 VITE_USE_MOCK=true')
  }

  return http.post(base, {
    action,
    ...payload,
    ...query
  })
}

export function adminGet(action, query = {}) {
  if (USE_MOCK) return mockRequest(action, {}, query)
  const base = resolveUrl()
  return http.get(base, { params: { action, ...query } })
}
