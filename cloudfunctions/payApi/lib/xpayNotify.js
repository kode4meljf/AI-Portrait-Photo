function readXmlTag(xml, tag) {
  if (!xml || !tag) return '';
  const cdataRe = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i');
  const plainRe = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const cdataMatch = xml.match(cdataRe);
  if (cdataMatch) return String(cdataMatch[1] || '').trim();
  const plainMatch = xml.match(plainRe);
  return plainMatch ? String(plainMatch[1] || '').trim() : '';
}

function parseJsonObject(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch (e) {
    return null;
  }
}

function normalizePushPayload(rawBody) {
  const json = parseJsonObject(rawBody);
  if (json && (json.Event || json.event)) {
    return normalizeEventFields(json);
  }

  const xml = String(rawBody || '');
  if (xml.includes('<xml') || xml.includes('<Event>') || xml.includes('<Event><![CDATA[')) {
    const event = readXmlTag(xml, 'Event');
    const goodsInfoRaw = readXmlTag(xml, 'GoodsInfo');
    let goodsInfo = parseJsonObject(goodsInfoRaw);
    if (!goodsInfo && goodsInfoRaw) {
      goodsInfo = {
        ProductId: readXmlTag(goodsInfoRaw, 'ProductId'),
        ActualPrice: Number(readXmlTag(goodsInfoRaw, 'ActualPrice')) || 0,
        Attach: readXmlTag(goodsInfoRaw, 'Attach')
      };
    }
    const payInfoRaw = readXmlTag(xml, 'WeChatPayInfo');
    let weChatPayInfo = parseJsonObject(payInfoRaw);
    if (!weChatPayInfo && payInfoRaw) {
      weChatPayInfo = {
        TransactionId: readXmlTag(payInfoRaw, 'TransactionId'),
        MchOrderNo: readXmlTag(payInfoRaw, 'MchOrderNo')
      };
    }
    return normalizeEventFields({
      Event: event,
      OpenId: readXmlTag(xml, 'OpenId'),
      OutTradeNo: readXmlTag(xml, 'OutTradeNo'),
      Env: Number(readXmlTag(xml, 'Env')) || 0,
      GoodsInfo: goodsInfo || {},
      WeChatPayInfo: weChatPayInfo || {}
    });
  }

  return null;
}

function normalizeEventFields(payload) {
  const event = String(payload.Event || payload.event || '').trim();
  const goodsInfo = payload.GoodsInfo || payload.goodsInfo || {};
  const payInfo = payload.WeChatPayInfo || payload.weChatPayInfo || {};
  return {
    event,
    openId: String(payload.OpenId || payload.openId || '').trim(),
    outTradeNo: String(payload.OutTradeNo || payload.outTradeNo || '').trim(),
    env: Number(payload.Env != null ? payload.Env : payload.env) || 0,
    productId: String(goodsInfo.ProductId || goodsInfo.productId || '').trim(),
    actualPriceFen: Number(goodsInfo.ActualPrice != null ? goodsInfo.ActualPrice : goodsInfo.actualPrice) || 0,
    attach: String(goodsInfo.Attach || goodsInfo.attach || '').trim(),
    transactionId: String(payInfo.TransactionId || payInfo.transactionId || '').trim()
  };
}

function xpaySuccessResponse() {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { ErrCode: 0, ErrMsg: 'success' }
  };
}

function xpayFailResponse(message, statusCode = 500) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: { ErrCode: 1, ErrMsg: message || 'fail' }
  };
}

module.exports = {
  normalizePushPayload,
  xpaySuccessResponse,
  xpayFailResponse
};
