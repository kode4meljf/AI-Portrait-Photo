const crypto = require('crypto')
const https = require('https')
const querystring = require('querystring')

const POLL_URL = 'https://poll.kuaidi100.com/poll/query.do'
const AUTO_URL = 'https://www.kuaidi100.com/autonumber/auto'

function md5Upper(str) {
  return crypto.createHash('md5').update(str, 'utf8').digest('hex').toUpperCase()
}

function getConfig() {
  const customer = String(process.env.KUAIDI100_CUSTOMER || '').trim()
  const key = String(process.env.KUAIDI100_KEY || '').trim()
  if (!customer || !key) return null
  return { customer, key }
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = ''
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => {
          try {
            resolve(JSON.parse(body))
          } catch (err) {
            reject(new Error('快递100响应解析失败'))
          }
        })
      })
      .on('error', reject)
  })
}

function httpPostForm(url, form) {
  return new Promise((resolve, reject) => {
    const body = querystring.stringify(form)
    const u = new URL(url)
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 12000
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (err) {
            reject(new Error('快递100响应解析失败'))
          }
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('快递100请求超时'))
    })
    req.write(body)
    req.end()
  })
}

function formatTraceTime(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  const d = new Date(text.replace(/-/g, '/'))
  if (Number.isNaN(d.getTime())) return text.slice(5, 16)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function normalizeTraces(data) {
  const list = Array.isArray(data) ? data : []
  return list
    .map((item) => ({
      time: formatTraceTime(item.ftime || item.time),
      msg: String(item.context || '').trim()
    }))
    .filter((item) => item.msg)
}

/**
 * @returns {Promise<{ com: string, name: string } | null>}
 */
async function autoDetectCompany(num) {
  const cfg = getConfig()
  if (!cfg) return null
  const url = `${AUTO_URL}?num=${encodeURIComponent(num)}&key=${encodeURIComponent(cfg.key)}`
  const res = await httpGetJson(url)
  const row = Array.isArray(res) ? res[0] : null
  if (!row || !row.comCode) return null
  return {
    com: String(row.comCode).trim(),
    name: String(row.name || '').trim()
  }
}

/**
 * @returns {Promise<{ ok: boolean, empty?: boolean, message?: string, com?: string, companyName?: string, state?: string, traces?: Array<{time:string,msg:string}> }>}
 */
async function queryTracking({ com, num, phoneTail4 }) {
  const cfg = getConfig()
  if (!cfg) {
    console.warn('[kuaidi100] KUAIDI100_CUSTOMER / KUAIDI100_KEY 未配置')
    return { ok: false, empty: true, message: '暂无物流信息', skipCache: true }
  }

  const trackingNo = String(num || '').trim()
  if (!trackingNo) {
    return { ok: false, empty: true, message: '缺少运单号' }
  }

  let companyCode = String(com || '').trim()
  let companyName = ''

  if (!companyCode) {
    const detected = await autoDetectCompany(trackingNo)
    if (detected) {
      companyCode = detected.com
      companyName = detected.name
    }
  }

  if (!companyCode) {
    return { ok: false, empty: true, message: '暂未识别快递公司' }
  }

  const paramObj = { com: companyCode, num: trackingNo, phone: phoneTail4 || '', from: '', to: '' }
  const param = JSON.stringify(paramObj)
  const sign = md5Upper(param + cfg.key + cfg.customer)

  let res
  try {
    res = await httpPostForm(POLL_URL, { customer: cfg.customer, sign, param })
  } catch (err) {
    console.warn('[kuaidi100] query failed', err.message || err)
    return { ok: false, empty: true, message: '物流信息查询失败，请稍后重试' }
  }

  const status = String(res.status || '')
  const message = String(res.message || '').trim()

  if (status !== '200' || message !== 'ok') {
    const emptyMsg =
      status === '408' || /没有权限|未授权|key/i.test(message)
        ? '暂无物流信息'
        : message || '暂无物流信息'
    return { ok: false, empty: true, message: emptyMsg, com: companyCode, companyName }
  }

  const traces = normalizeTraces(res.data)
  if (!traces.length) {
    return {
      ok: false,
      empty: true,
      message: '暂无物流信息',
      com: companyCode,
      companyName,
      state: String(res.state || '')
    }
  }

  return {
    ok: true,
    com: companyCode,
    companyName: companyName || companyCode,
    state: String(res.state || ''),
    traces
  }
}

module.exports = {
  getConfig,
  autoDetectCompany,
  queryTracking,
  formatTraceTime
}
