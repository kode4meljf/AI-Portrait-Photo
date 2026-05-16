const { login, verifyToken } = require('./lib/auth')
const { parseHttpEvent, httpResponse, ok, fail } = require('./lib/http')
const { PUBLIC_ACTIONS, dispatch } = require('./lib/handlers')

function extractToken(event, authHeader) {
  if (authHeader) {
    const m = authHeader.match(/Bearer\s+(.+)/i)
    if (m) return m[1]
  }
  return event.token || event.adminToken || ''
}

async function runAction(action, payload, query, token) {
  if (!action) {
    return fail('缺少 action', 'MISSING_ACTION')
  }

  if (action === 'login') {
    const result = await dispatch(action, payload, query)
    return result.success === false ? fail(result.error, 'AUTH_FAILED') : ok(result)
  }

  if (!PUBLIC_ACTIONS.has(action)) {
    const user = verifyToken(token)
    if (!user) {
      return fail('未登录或 token 已过期', 'UNAUTHORIZED')
    }
  }

  try {
    const data = await dispatch(action, payload, query)
    if (data && data.success === false) {
      return fail(data.error, 'AUTH_FAILED')
    }
    return ok(data)
  } catch (err) {
    console.error(`adminApi [${action}]`, err)
    return fail(err.message || '服务器错误', 'SERVER_ERROR')
  }
}

exports.main = async (event) => {
  const httpCtx = parseHttpEvent(event)

  if (httpCtx) {
    if (httpCtx.method === 'OPTIONS') {
      return httpResponse(204, '')
    }

    const action =
      httpCtx.body.action ||
      httpCtx.query.action ||
      (httpCtx.method === 'GET' ? httpCtx.query.action : null)

    const payload = httpCtx.method === 'GET'
      ? { ...httpCtx.query }
      : { ...httpCtx.query, ...httpCtx.body }

    const token = extractToken(payload, httpCtx.authHeader)
    const result = await runAction(action, payload, httpCtx.query, token)
    const statusCode = result.code === 'UNAUTHORIZED' ? 401 : result.success ? 200 : 400
    return httpResponse(statusCode, result)
  }

  const action = event.action
  const payload = event.payload || event.data || event
  const query = event.query || {}
  const token = extractToken(event, event.authorization)

  if (action === 'login' && payload.username && payload.password && !event.action) {
    const loginResult = login(payload.username, payload.password)
    return loginResult
  }

  return runAction(action, payload, query, token)
}
