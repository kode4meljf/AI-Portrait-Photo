const SERVICE_UNAVAILABLE = '服务暂不可用，请联系平台';
const INSUFFICIENT_BALANCE = '剩余次数不足，请先充值';
const GENERIC_FAIL = '生成失败，请稍后重试';
const TIMEOUT_FAIL = '生成超时，请重试';

function toUserFacingError(err) {
  const msg = String((err && err.message) || err || '').trim();
  if (!msg) return GENERIC_FAIL;

  if (/INSUFFICIENT_BALANCE|余额不足|次数不足/i.test(msg)) {
    return INSUFFICIENT_BALANCE;
  }
  if (/生成超时|TIMEOUT|timeout/i.test(msg)) {
    return TIMEOUT_FAIL;
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
