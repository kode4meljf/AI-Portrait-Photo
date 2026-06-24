const https = require('https')
const { URL } = require('url')

function httpsRequest(url, { method = 'GET', headers = {}, body, timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers,
        timeout: timeoutMs
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks)
          })
        })
      }
    )
    req.on('timeout', () => {
      req.destroy(new Error('请求超时'))
    })
    req.on('error', reject)
    if (body != null) req.write(body)
    req.end()
  })
}

async function postJson(url, payload, headers = {}, timeoutMs = 30000) {
  const body = JSON.stringify(payload)
  const res = await httpsRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      ...headers
    },
    body,
    timeoutMs
  })
  return {
    status: res.status,
    text: res.body.toString('utf8')
  }
}

async function getBuffer(url, timeoutMs = 30000) {
  const res = await httpsRequest(url, { method: 'GET', timeoutMs })
  return {
    status: res.status,
    buffer: res.body
  }
}

module.exports = {
  httpsRequest,
  postJson,
  getBuffer
}
