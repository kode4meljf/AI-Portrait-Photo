const crypto = require('crypto')
const https = require('https')

function sha256(message) {
  return crypto.createHash('sha256').update(message, 'utf8').digest('hex')
}

function hmacSha256(key, message, encoding) {
  return crypto.createHmac('sha256', key).update(message, 'utf8').digest(encoding)
}

function postJson({ host, service, action, version, region, payload, secretId, secretKey }) {
  const body = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const actionLower = String(action).toLowerCase()
  const contentType = 'application/json; charset=utf-8'
  const canonicalHeaders =
    `content-type:${contentType}\n` + `host:${host}\n` + `x-tc-action:${actionLower}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const hashedRequestPayload = sha256(body)
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    hashedRequestPayload
  ].join('\n')
  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    sha256(canonicalRequest)
  ].join('\n')
  const secretDate = hmacSha256(`TC3${secretKey}`, date)
  const secretService = hmacSha256(secretDate, service)
  const secretSigning = hmacSha256(secretService, 'tc3_request')
  const signature = hmacSha256(secretSigning, stringToSign, 'hex')
  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const headers = {
    'Content-Type': contentType,
    Host: host,
    'X-TC-Action': action,
    'X-TC-Version': version,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Region': region,
    Authorization: authorization,
    'Content-Length': Buffer.byteLength(body)
  }

  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: host, port: 443, path: '/', method: 'POST', headers }, (res) => {
      let raw = ''
      res.on('data', (chunk) => {
        raw += chunk
      })
      res.on('end', () => {
        let parsed
        try {
          parsed = JSON.parse(raw)
        } catch {
          reject(new Error(`短信 API 响应无效: ${raw.slice(0, 200)}`))
          return
        }
        if (parsed.Response && parsed.Response.Error) {
          const err = parsed.Response.Error
          reject(new Error(err.Message || err.Code || '短信 API 错误'))
          return
        }
        resolve(parsed.Response || parsed)
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

module.exports = { postJson }
