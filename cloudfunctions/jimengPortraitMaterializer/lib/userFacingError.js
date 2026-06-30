const SERVICE_UNAVAILABLE = '服务暂不可用，请联系平台';
const INSUFFICIENT_BALANCE = '剩余积分不足，请先充值';
const GENERIC_FAIL = '生成失败，请稍后重试';
const TIMEOUT_FAIL = '生成超时，请重试';

function toUserFacingError(err) {
  const msg = String((err && err.message) || err || '').trim();
  if (!msg) return GENERIC_FAIL;

  if (/INSUFFICIENT_BALANCE|余额不足|积分不足|次数不足/i.test(msg)) {
    return INSUFFICIENT_BALANCE;
  }
  if (/生成超时|TIMEOUT|timeout/i.test(msg)) {
    return TIMEOUT_FAIL;
  }
  if (/ModelNotOpen|未开通模型|模型广场/.test(msg)) {
    return '智绘引擎模型未开通，请联系平台在火山方舟开通';
  }
  if (/方舟 API Key|InvalidApiKey/i.test(msg)) {
    return SERVICE_UNAVAILABLE;
  }
  if (
    /VOLC|ACCESS_KEY|SECRET|credential|鉴权|签名|Unauthorized|InvalidAccessKey|SecretKey/i.test(
      msg
    )
  ) {
    return SERVICE_UNAVAILABLE;
  }
  if (/服务暂不可用|请联系平台/.test(msg)) {
    return SERVICE_UNAVAILABLE;
  }

  return GENERIC_FAIL;
}

module.exports = {
  SERVICE_UNAVAILABLE,
  INSUFFICIENT_BALANCE,
  GENERIC_FAIL,
  TIMEOUT_FAIL,
  toUserFacingError
};
