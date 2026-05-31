const cloud = require('wx-server-sdk');
const { parseHttpEvent } = require('./lib/http');
const { isPayConfigured, getPayConfigSummary, assertPayConfigured, getPayConfig } = require('./lib/config');
const { resolveStoreIdFromOpenid } = require('./lib/resolveStore');
const { verifyMerchantCredentials } = require('./lib/wxpay');
const recharge = require('./lib/recharge');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function payOptions() {
  const wxContext = cloud.getWXContext();
  return { runtimeAppId: wxContext.APPID || '' };
}

function ok(data) {
  return { success: true, data };
}

function fail(error, code) {
  return { success: false, error: error || '操作失败', code: code || 'BAD_REQUEST' };
}

async function dispatchCallFunction(action, event, openid) {
  const opts = payOptions();
  switch (action) {
    case 'pay.status':
      return ok({
        configured: isPayConfigured(opts),
        ...getPayConfigSummary(opts)
      });

    case 'pay.verify': {
      assertPayConfigured(opts);
      const cfg = getPayConfig(opts);
      const result = await verifyMerchantCredentials(cfg);
      return ok(result);
    }

    case 'packages.list':
      return ok({ packages: await recharge.listPackages() });

    case 'recharge.create': {
      const storeId = await resolveStoreIdFromOpenid(openid);
      const packageId = event.packageId;
      const data = await recharge.createRechargeOrder(openid, storeId, packageId, opts);
      return ok(data);
    }

    case 'recharge.query': {
      const storeId = await resolveStoreIdFromOpenid(openid);
      const data = await recharge.queryRechargeOrder(openid, storeId, event.outTradeNo);
      return ok(data);
    }

    default:
      return fail(`未知 action: ${action}`, 'UNKNOWN_ACTION');
  }
}

exports.main = async (event) => {
  const httpCtx = parseHttpEvent(event);
  if (httpCtx) {
    if (httpCtx.method === 'OPTIONS') {
      return { statusCode: 204, headers: { 'Content-Type': 'text/plain' }, body: '' };
    }
    if (httpCtx.method !== 'POST') {
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'FAIL', message: 'Method Not Allowed' })
      };
    }
    const result = await recharge.handlePayNotify({
      headers: httpCtx.headers,
      body: typeof event.body === 'string' ? event.body : JSON.stringify(httpCtx.body || {})
    });
    return {
      statusCode: result.statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result.body)
    };
  }

  const openid = cloud.getWXContext().OPENID || '';
  const action = event.action;
  if (!action) return fail('缺少 action', 'MISSING_ACTION');

  const publicActions = new Set(['pay.status', 'pay.verify', 'packages.list']);
  if (!publicActions.has(action) && !openid) {
    return fail('未登录', 'UNAUTHORIZED');
  }

  try {
    return await dispatchCallFunction(action, event, openid);
  } catch (err) {
    console.error(`[payApi] ${action}`, err);
    return fail(err.message || '操作失败', err.code || 'SERVER_ERROR');
  }
};
