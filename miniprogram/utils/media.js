/**
 * @file 媒体选择与上传公共方法
 * @description 封装 wx.chooseMedia + 云存储上传逻辑，供各页面复用
 */

const app = getApp();

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

  if (!storeId || storeId === 'mock_store_id') {
    throw new Error('门店ID无效');
  }

  const res = await db.collection('batches').add({
    data: {
      storeId: storeId,
      customerId: app.globalData.selectedCustomerId || null,
      status: 'pending',
      photoIds: [],
      createTime: db.serverDate()
    }
  });
  return res._id;
}

/** 上传单张图片并保存记录 */
async function _uploadAndSavePhoto(tempFilePath, batchId) {
  const storeId = app.globalData.storeId;
  if (!storeId || storeId === 'mock_store_id') {
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

    // 添加照片记录
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

    // 更新 batch 中的 photoIds
    await db.collection('batches').doc(batchId).update({
      data: {
        photoIds: db.command.push([uploadRes.fileID])
      }
    });

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

module.exports = { chooseAndUpload, uploadSingle };
