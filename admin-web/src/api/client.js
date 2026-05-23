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
    const msg = extractHttpErrorMessage(err)
    return Promise.reject(new Error(msg))
  }
)

function parseResponseBody(data) {
  if (data == null) return null
  if (typeof data === 'object') return data
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return null
    }
  }
  return null
}

/** 从 axios 错误中取出业务文案（避免展示 "Request failed with status code 400"） */
function extractHttpErrorMessage(err) {
  const body = parseResponseBody(err.response?.data)
  if (body?.error) return String(body.error)
  if (body?.message) return String(body.message)
  if (body?.code === 'EXCEED_MAX_PAYLOAD_SIZE' || /exceed max.*payload/i.test(String(body?.message || ''))) {
    return '上传数据超过接口大小限制，请刷新页面后重试（系统已自动压缩图片）'
  }

  const axiosMsg = err.message || ''
  if (/exceed max.*payload/i.test(axiosMsg)) {
    return '上传数据超过接口大小限制，请刷新页面后重试（系统已自动压缩图片）'
  }
  if (err.response?.status && /request failed with status code/i.test(axiosMsg)) {
    return '请求失败，请稍后重试'
  }
  return axiosMsg || '网络错误'
}

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
