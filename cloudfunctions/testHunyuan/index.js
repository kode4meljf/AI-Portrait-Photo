const cloud = require('wx-server-sdk');
const axios = require('axios');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

async function tencentRequest(service, action, version, region, payload) {
  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) throw new Error('密钥未设置');
  const endpoint = `${service}.tencentcloudapi.com`;
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const algorithm = 'TC3-HMAC-SHA256';

  const payloadStr = JSON.stringify(payload);
  const hashedPayload = crypto.createHash('sha256').update(payloadStr).digest('hex');
  const canonicalRequest = `POST\n/\n\ncontent-type:application/json\nhost:${endpoint}\n\ncontent-type;host\n${hashedPayload}`;
  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;

  const secretDate = crypto.createHmac('sha256', `TC3${secretKey}`).update(date).digest();
  const secretService = crypto.createHmac('sha256', secretDate).update(service).digest();
  const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest();
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');

  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`;

  const response = await axios({
    method: 'POST',
    url: `https://${endpoint}`,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authorization,
      'X-TC-Action': action,
      'X-TC-Timestamp': timestamp,
      'X-TC-Version': version,
      'X-TC-Region': region || 'ap-guangzhou',
    },
    data: payloadStr,
    timeout: 30000,
  });
  if (response.data?.Response?.Error) throw new Error(response.data.Response.Error.Code + ' - ' + response.data.Response.Error.Message);
  return response.data.Response;
}

exports.main = async () => {
  try {
    const result = await tencentRequest('aiart', 'SubmitImageToImageJob', '2022-12-29', 'ap-guangzhou', {
      Prompt: '一只猫',
      Resolution: '1024:1024',
      LogoAdd: 0,
    });
    return { success: true, jobId: result.JobId };
  } catch (err) {
    return { success: false, error: err.message };
  }
};