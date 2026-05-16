const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'
}

function parseHttpEvent(event) {
  if (!event || !event.httpMethod) return null
  const method = (event.httpMethod || 'GET').toUpperCase()
  let body = {}
  if (event.body) {
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body
    } catch {
      body = {}
    }
  }
  const query = event.queryStringParameters || {}
  const headers = event.headers || {}
  const authHeader = headers.authorization || headers.Authorization || ''
  return { method, body, query, headers, authHeader, isHttp: true }
}

function httpResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS
    },
    body: JSON.stringify(payload)
  }
}

function ok(data, meta) {
  return { success: true, data, meta: meta || null }
}

function fail(error, code) {
  return { success: false, error: error || '请求失败', code: code || 'BAD_REQUEST' }
}

module.exports = {
  CORS_HEADERS,
  parseHttpEvent,
  httpResponse,
  ok,
  fail
}
