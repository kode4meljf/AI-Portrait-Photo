const cloud = require('wx-server-sdk');
const axios = require('axios');
const crypto = require('crypto');
const Jimp = require('jimp');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const secretId = process.env.TENCENT_SECRET_ID;
const secretKey = process.env.TENCENT_SECRET_KEY;
if (!secretId || !secretKey) {
  throw new Error('请设置环境变量 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY');
}

// ==================== 签名函数 ====================
function sha256(message, secret = '', encoding) {
  const hmac = crypto.createHmac('sha256', secret);
  return hmac.update(message).digest(encoding);
}
function getHash(message, encoding = 'hex') {
  const hash = crypto.createHash('sha256');
  return hash.update(message).digest(encoding);
}
async function tencentRequest(service, action, version, region, payload) {
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
  const hashedRequestPayload = getHash(payloadStr);
  const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`;
  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = getHash(canonicalRequest);
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;
  const secretDate = sha256(date, `TC3${secretKey}`, 'binary');
  const secretService = sha256(service, secretDate, 'binary');
  const secretSigning = sha256('tc3_request', secretService, 'binary');
  const signature = sha256(stringToSign, secretSigning, 'hex');
  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
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
    timeout: 60000,
  });
  if (response.data && response.data.Response && response.data.Response.Error) {
    const err = response.data.Response.Error;
    throw new Error(`${err.Code} - ${err.Message}`);
  }
  return response.data.Response;
}

// ==================== 人像分割 ====================
async function segmentPortrait(imageBuffer) {
  console.log('[segmentPortrait] 开始');
  const base64Image = imageBuffer.toString('base64');
  const result = await tencentRequest('bda', 'SegmentPortraitPic', '2020-03-24', 'ap-guangzhou', {
    Image: base64Image,
    RspImgType: 'base64'
  });
  if (!result.ResultImage) throw new Error('人像分割失败');
  console.log('[segmentPortrait] 完成');
  return Buffer.from(result.ResultImage, 'base64');
}

// ==================== 图生图 ====================
async function getTempFileURL(fileID) {
  const res = await cloud.getTempFileURL({ fileList: [fileID] });
  return res.fileList[0].tempFileURL;
}

async function generateBackground(templateImageUrl, prompt) {
  console.log('[generateBackground] 开始');
  let imageBase64;
  if (templateImageUrl.startsWith('cloud://')) {
    const url = await getTempFileURL(templateImageUrl);
    const resp = await axios.get(url, { responseType: 'arraybuffer' });
    imageBase64 = Buffer.from(resp.data).toString('base64');
  } else if (templateImageUrl.startsWith('http')) {
    const resp = await axios.get(templateImageUrl, { responseType: 'arraybuffer' });
    imageBase64 = Buffer.from(resp.data).toString('base64');
  } else {
    throw new Error('不支持的图片链接格式');
  }
  console.log('[generateBackground] 图片Base64长度', imageBase64.length);

  const submitPayload = {
    Image: imageBase64,
    Prompt: prompt,
    Resolution: '1024:1024',
    LogoAdd: 0
  };
  const submitRes = await tencentRequest('aiart', 'SubmitImageToImageJob', '2022-12-29', 'ap-guangzhou', submitPayload);
  const jobId = submitRes.JobId;
  console.log('[generateBackground] 任务提交，JobId:', jobId);

  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const queryPayload = { JobId: jobId };
    const queryRes = await tencentRequest('aiart', 'QueryImageToImageJob', '2022-12-29', 'ap-guangzhou', queryPayload);
    console.log(`[generateBackground] 轮询 ${i+1}, 状态: ${queryRes.Status}`);
    if (queryRes.Status === 'SUCCESS' && queryRes.ResultImage) {
      console.log('[generateBackground] 成功获取结果');
      return Buffer.from(queryRes.ResultImage, 'base64');
    } else if (queryRes.Status === 'FAIL' || queryRes.Status === 'TIMED_OUT') {
      throw new Error(`图生图任务失败: ${queryRes.Status}`);
    }
  }
  throw new Error('图生图任务超时');
}

// ==================== 合成图片 ====================
async function composeAndUpload(personBuffer, bgBuffer) {
  console.log('[composeAndUpload] 开始');
  const targetSize = 1024;
  let bgImage = await Jimp.read(bgBuffer);
  bgImage.resize(targetSize, targetSize);
  let personImage = await Jimp.read(personBuffer);
  let scale = Math.min(targetSize / personImage.bitmap.width, targetSize / personImage.bitmap.height) * 0.7;
  if (scale > 1) scale = 1;
  personImage.resize(Math.floor(personImage.bitmap.width * scale), Math.floor(personImage.bitmap.height * scale));
  const left = Math.floor((targetSize - personImage.bitmap.width) / 2);
  const top = Math.floor((targetSize - personImage.bitmap.height) / 2);
  bgImage.composite(personImage, left, top);
  const finalBuffer = await bgImage.getBufferAsync(Jimp.MIME_PNG);
  const cloudPath = `ai-generated/${Date.now()}_${Math.random().toString(36).substr(2, 8)}.png`;
  const uploadRes = await cloud.uploadFile({ cloudPath, fileContent: finalBuffer });
  console.log('[composeAndUpload] 完成，fileID:', uploadRes.fileID);
  return uploadRes.fileID;
}

// ==================== 后台处理函数 ====================
async function processPhoto(photoId, templateImageUrl, prompt) {
  console.log(`[processPhoto] 开始处理照片 ${photoId}`);
  try {
    // 1. 获取原图
    console.log('[processPhoto] 获取原图...');
    const photo = (await db.collection('photos').doc(photoId).get()).data;
    if (!photo) throw new Error('照片不存在');
    let originalBuffer;
    if (photo.originalUrl.startsWith('cloud://')) {
      const fileRes = await cloud.downloadFile({ fileID: photo.originalUrl });
      originalBuffer = fileRes.fileContent;
    } else {
      const resp = await axios.get(photo.originalUrl, { responseType: 'arraybuffer' });
      originalBuffer = Buffer.from(resp.data);
    }
    console.log('[processPhoto] 原图大小:', originalBuffer.length);

    // 2. 人像分割
    const personBuffer = await segmentPortrait(originalBuffer);
    // 3. 生成背景
    const bgBuffer = await generateBackground(templateImageUrl, prompt);
    // 4. 合成上传
    const newFileID = await composeAndUpload(personBuffer, bgBuffer);
    // 5. 更新数据库
    await db.collection('photos').doc(photoId).update({
      data: { aiUrl: newFileID, isGenerated: true, generateStatus: 'completed', updateTime: new Date() }
    });
    console.log(`[processPhoto] 照片 ${photoId} 处理成功`);
  } catch (err) {
    console.error(`[processPhoto] 照片 ${photoId} 处理失败:`, err);
    await db.collection('photos').doc(photoId).update({
      data: { generateStatus: 'failed', updateTime: new Date() }
    });
  }
}

// ==================== 主函数 ====================
exports.main = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const { photoId, templateId } = event;
  if (!photoId || !templateId) return { success: false, error: '缺少参数' };

  try {
    const template = (await db.collection('templates').doc(templateId).get()).data;
    if (!template) return { success: false, error: '模板不存在' };
    if (!template.prompt) return { success: false, error: '模板缺少 prompt' };
    if (!template.imageUrl) return { success: false, error: '模板缺少 imageUrl' };

    await db.collection('photos').doc(photoId).update({
      data: { generateStatus: 'processing', isGenerated: false, updateTime: new Date() }
    });

    // 异步执行后台任务
    processPhoto(photoId, template.imageUrl, template.prompt).catch(err => console.error('后台未捕获错误:', err));
    return { success: true, message: 'AI生成任务已提交（图生图模式）' };
  } catch (err) {
    console.error('启动任务失败:', err);
    return { success: false, error: err.message };
  }
};