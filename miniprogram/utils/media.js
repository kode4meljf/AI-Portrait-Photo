/**
 * @file 媒体选择与上传公共方法
 * @description 封装 wx.chooseMedia + 云存储上传逻辑，供各页面复用
 */

const app = getApp();
const { deleteCloudFileSafe } = require('./cloudFileCleanup');

/**
 * 选择媒体并上传（支持相机/相册）
 * @param {Object} options
 * @param {Array<string>} options.sourceType - ['camera', 'album']，默认 ['camera', 'album']
 * @param {number} options.count - 最大选择数量，默认 1
 * @param {Function} options.onProgress - 上传进度回调（可选）
 * @returns {Promise<{successCount: number, totalCount: number}>}
 */
const chooseAndUpload = (options = {}) => {
  const { sourceType = ['camera', 'album'], count = 1 } = options;

  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count,
      mediaType: ['image'],
      sourceType,
      success: async (res) => {
        wx.showLoading({ title: '处理中...' });
        try {
          const batchId = await _createBatch();
          let successCount = 0;

          for (const file of res.tempFiles) {
            const ok = await _uploadAndSavePhoto(file.tempFilePath, batchId);
            if (ok) successCount++;
          }

          if (successCount === 0) {
            await _removeEmptyBatch(batchId);
          }

          wx.hideLoading();

          if (successCount > 0) {
            // 刷新云相册页面
            const pages = getCurrentPages();
            const galleryPage = pages.find(p => p.route === 'pages/gallery/gallery');
            if (galleryPage && galleryPage.refreshData) {
              galleryPage.refreshData();
            }
            resolve({ successCount, totalCount: res.tempFiles.length });
          } else {
            wx.showToast({ title: '上传失败，请重试', icon: 'error' });
            reject(new Error('上传失败'));
          }
        } catch (err) {
          console.error('上传过程出错', err);
          wx.hideLoading();
          wx.showToast({ title: '上传失败', icon: 'error' });
          reject(err);
        }
      },
      fail: (err) => {
        console.error('选择图片失败', err);
        // 用户取消不提示
        if (err.errMsg && err.errMsg.includes('cancel')) return;
        wx.showToast({ title: '选择失败', icon: 'none' });
        reject(err);
      }
    });
  });
};

/**
 * 仅上传单张图片（已有文件路径，用于 open-type="chooseAvatar" 回调等场景）
 * @param {string} filePath - 图片文件路径
 */
const uploadSingle = (filePath) => {
  return new Promise(async (resolve, reject) => {
    wx.showLoading({ title: '处理中...' });
    try {
      const batchId = await _createBatch();
      const ok = await _uploadAndSavePhoto(filePath, batchId);
      if (!ok) {
        await _removeEmptyBatch(batchId);
      }
      wx.hideLoading();
      if (ok) {
        wx.showToast({ title: '上传成功', icon: 'success' });
        // 刷新云相册页面
        const pages = getCurrentPages();
        const galleryPage = pages.find(p => p.route === 'pages/gallery/gallery');
        if (galleryPage && galleryPage.refreshData) {
          galleryPage.refreshData();
        }
        resolve(true);
      } else {
        wx.showToast({ title: '上传失败', icon: 'error' });
        reject(new Error('上传失败'));
      }
    } catch (err) {
      console.error('上传出错', err);
      wx.hideLoading();
      wx.showToast({ title: '上传失败', icon: 'error' });
      reject(err);
    }
  });
};

// ==================== 内部方法 ====================

/** 创建批次记录 */
async function _createBatch() {
  const db = wx.cloud.database();
  const storeId = app.globalData.storeId;

  const { isValidStoreId } = require('./storeSession');
  if (!isValidStoreId(storeId)) {
    throw new Error('门店ID无效');
  }

  const res = await db.collection('batches').add({
    data: {
      storeId: storeId,
      customerId: app.globalData.selectedCustomerId || null,
      status: 'pending',
      isFavorite: false,
      photoIds: [],
      createTime: db.serverDate()
    }
  });
  return res._id;
}

/** 上传单张图片并保存记录 */
async function _uploadAndSavePhoto(tempFilePath, batchId) {
  const storeId = app.globalData.storeId;
  const { isValidStoreId } = require('./storeSession');
  if (!isValidStoreId(storeId)) {
    console.error('storeId无效');
    return false;
  }

  try {
    // 压缩
    const compressedPath = await _compressImage(tempFilePath);

    // 上传云存储
    const cloudPath = `photos/${Date.now()}_${Math.random().toString(36).substr(2, 8)}.jpg`;
    const uploadRes = await wx.cloud.uploadFile({
      cloudPath,
      filePath: compressedPath
    });

    const db = wx.cloud.database();

    try {
      await db.collection('photos').add({
        data: {
          batchId: batchId,
          storeId: storeId,
          customerId: app.globalData.selectedCustomerId || null,
          originalUrl: uploadRes.fileID,
          aiUrl: null,
          isGenerated: false,
          isFavorite: false,
          createTime: db.serverDate()
        }
      });

      await db.collection('batches').doc(batchId).update({
        data: {
          photoIds: db.command.push([uploadRes.fileID])
        }
      });
    } catch (dbErr) {
      await deleteCloudFileSafe(uploadRes.fileID);
      throw dbErr;
    }

    return true;
  } catch (err) {
    console.error('单张上传失败', err);
    return false;
  }
}

/** 压缩图片 */
function _compressImage(src) {
  return new Promise((resolve, reject) => {
    wx.compressImage({
      src,
      quality: 80,
      compressedWidth: 1080,
      success: (res) => resolve(res.tempFilePath),
      fail: reject
    });
  });
}

/** 微信本地临时路径（含开发者工具里的 http://tmp/） */
function isWechatLocalPath(url) {
  const s = String(url || '').trim();
  if (!s) return false;
  if (s.startsWith('cloud://')) return false;
  if (s.startsWith('wxfile://')) return true;
  if (/^https?:\/\/tmp\//i.test(s)) return true;
  if (!/^https?:\/\//i.test(s)) return true;
  return false;
}

/** 真实可公网访问的 http(s) 外链 */
function isRemoteHttpUrl(url) {
  const s = String(url || '').trim();
  return /^https?:\/\//i.test(s) && !/^https?:\/\/tmp\//i.test(s);
}

/**
 * 将本地路径转为云存储 fileID（cloud://）
 * @param {string} source
 * @returns {Promise<string>}
 */
const ensureCloudFileUrl = async (source) => {
  if (!source) {
    throw new Error('缺少图片');
  }
  if (source.startsWith('cloud://')) {
    return source;
  }
  if (isRemoteHttpUrl(source)) {
    throw new Error('远程 http 图片请使用 resolvePhotoForOrder');
  }

  const storeId = app.globalData.storeId || 'unknown';
  const ext = String(source).toLowerCase().endsWith('.png') ? 'png' : 'jpg';
  const cloudPath = `frame-orders/${storeId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const uploadRes = await wx.cloud.uploadFile({
    cloudPath,
    filePath: source
  });
  return uploadRes.fileID;
};

/**
 * 摆台下单用：本地/tmp 先上传；已是 cloud:// 直接返回；真实外链留给云函数转存
 */
const resolvePhotoForOrder = async (source) => {
  if (!source) throw new Error('缺少图片');
  if (source.startsWith('cloud://')) return source;
  if (isWechatLocalPath(source)) {
    return ensureCloudFileUrl(source);
  }
  if (isRemoteHttpUrl(source)) {
    return source;
  }
  return ensureCloudFileUrl(source);
};

/** 拍摄链路：压缩后上传到 photos/ 目录，返回 cloud:// fileID */
async function uploadShootOriginalToCloud(tempFilePath) {
  const compressedPath = await _compressImage(tempFilePath);
  const cloudPath = `photos/${Date.now()}_${Math.random().toString(36).substr(2, 8)}.jpg`;
  const uploadRes = await wx.cloud.uploadFile({
    cloudPath,
    filePath: compressedPath
  });
  return uploadRes.fileID;
}

module.exports = {
  chooseAndUpload,
  uploadSingle,
  createShootBatch: _createBatch,
  uploadShootOriginalToCloud,
  ensureCloudFileUrl,
  resolvePhotoForOrder,
  isWechatLocalPath,
  isRemoteHttpUrl
};
