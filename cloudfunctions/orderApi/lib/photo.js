const cloud = require('wx-server-sdk');
const https = require('https');
const http = require('http');
function fetchUrlBuffer(url, redirectLeft = 3) {
  return new Promise((resolve, reject) => {
    const client = /^https:/i.test(url) ? https : http;
    client.get(url, (res) => {
      if (redirectLeft > 0 && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrlBuffer(res.headers.location, redirectLeft - 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`图片下载失败(${res.statusCode})`));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}
async function normalizePhotoUrl(photoUrl, storeId) {
  const src = String(photoUrl || '').trim();
  if (!src) throw new Error('缺少照片');
  if (/^https?:\/\/tmp\//i.test(src)) {
    throw new Error('收到微信本地临时路径，请在小程序端先上传云存储后再下单');
  }
  if (src.startsWith('cloud://')) return src;
  if (/^https?:\/\//i.test(src)) {
    const buffer = await fetchUrlBuffer(src);
    const uploadRes = await cloud.uploadFile({
      cloudPath: `frame-orders/${storeId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`,
      fileContent: buffer
    });
    return uploadRes.fileID;
  }
  throw new Error('照片须为 cloud:// 或 http(s) 链接，请确认小程序已上传云存储');
}
module.exports = { normalizePhotoUrl };
