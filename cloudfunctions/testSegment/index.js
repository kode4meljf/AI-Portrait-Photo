const cloud = require('wx-server-sdk');
const axios = require('axios');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// ==================== 签名函数（与正式云函数相同） ====================
function sign(service, action, region, payload, secretId, secretKey) {
  const endpoint = `${service}.tencentcloudapi.com`;
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const algorithm = 'TC3-HMAC-SHA256';

  const httpRequestMethod = 'POST';
  const canonicalUri = '/';
  const canonicalQueryString = '';
  const canonicalHeaders = `content-type:application/json\nhost:${endpoint}\n`;
  const signedHeaders = 'content-type;host';
  const payloadStr = JSON.stringify(payload);
  const hashedRequestPayload = crypto.createHash('sha256').update(payloadStr).digest('hex');
  const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`;

  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;

  const secretDate = crypto.createHmac('sha256', `TC3${secretKey}`).update(date).digest();
  const secretService = crypto.createHmac('sha256', secretDate).update(service).digest();
  const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest();
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');

  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { authorization, timestamp, endpoint };
}

async function callSegmentPortrait(base64Image) {
  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) {
    throw new Error('环境变量 TENCENT_SECRET_ID 或 TENCENT_SECRET_KEY 未设置');
  }

  const service = 'bda';
  const action = 'SegmentPortraitPic';
  const version = '2020-03-24';
  const region = 'ap-guangzhou';
  const payload = { Image: base64Image, RspImgType: 'base64' };

  const { authorization, timestamp, endpoint } = sign(service, action, region, payload, secretId, secretKey);
  console.log(`[DEBUG] 请求时间戳: ${timestamp}`);
  console.log(`[DEBUG] Authorization 前80字符: ${authorization.substring(0, 80)}...`);

  const response = await axios({
    method: 'POST',
    url: `https://${endpoint}`,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authorization,
      'X-TC-Action': action,
      'X-TC-Timestamp': timestamp,
      'X-TC-Version': version,
      'X-TC-Region': region,
    },
    data: JSON.stringify(payload),
    timeout: 30000,
  });

  if (response.data && response.data.Response && response.data.Response.Error) {
    const err = response.data.Response.Error;
    throw new Error(`${err.Code} - ${err.Message}`);
  }
  return response.data.Response;
}

// ==================== 主函数 ====================
exports.main = async (event, context) => {
  // 注意：您需要提供一个有效的 Base64 图片数据（必须有完整前缀或纯 base64）
  // 这里可以从 event 中传入，或者使用一个固定的公开测试图片
  let base64Image = event.imageBase64;
  if (!base64Image) {
    // 如果没有传入，使用一个已知可用的测试图片（纯 base64，不含 data:image/... 前缀）
    // 注意：该测试图片必须包含清晰人像
    base64Image = 'iVBORw0KGgoAAAANSUhEUgAA...'; // 请替换为一个真实有效的 base64 字符串
  }

  // 如果传入的 base64 包含 data:image/ 前缀，需要去掉
  if (base64Image.startsWith('data:image')) {
    base64Image = base64Image.split(',')[1];
  }

  try {
    console.log('开始调用人像分割接口...');
    const result = await callSegmentPortrait(base64Image);
    console.log('调用成功，返回值:', JSON.stringify(result));
    return { success: true, data: result };
  } catch (err) {
    console.error('调用失败:', err);
    return { success: false, error: err.message };
  }
};