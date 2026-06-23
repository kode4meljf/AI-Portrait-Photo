function resolveTempPath(url) {
  const src = String(url || '').trim();
  if (!src) return Promise.reject(new Error('empty url'));
  if (src.startsWith('cloud://')) {
    return new Promise((resolve, reject) => {
      wx.cloud.downloadFile({
        fileID: src,
        success: (res) => resolve(res.tempFilePath),
        fail: reject
      });
    });
  }
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: src,
      success: (res) => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        resolve(res.tempFilePath);
      },
      fail: reject
    });
  });
}

function saveOneToAlbum(url) {
  return resolveTempPath(url).then(
    (filePath) =>
      new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({ filePath, success: resolve, fail: reject });
      })
  );
}

async function downloadAllItems(items) {
  const urls = (items || [])
    .filter((item) => item.status === 'success' && item.url)
    .map((item) => item.url);
  if (!urls.length) {
    wx.showToast({ title: '暂无可下载照片', icon: 'none' });
    return { saved: 0, total: 0 };
  }

  wx.showLoading({ title: `下载中 0/${urls.length}`, mask: true });
  let saved = 0;
  for (let i = 0; i < urls.length; i += 1) {
    try {
      await saveOneToAlbum(urls[i]);
      saved += 1;
      wx.showLoading({ title: `下载中 ${saved}/${urls.length}`, mask: true });
    } catch (err) {
      console.error('[downloadPhotos] 单张失败', err);
    }
  }
  wx.hideLoading();
  wx.showToast({
    title: saved ? `已保存${saved}张` : '保存失败',
    icon: saved ? 'success' : 'none'
  });
  return { saved, total: urls.length };
}

module.exports = {
  saveOneToAlbum,
  downloadAllItems
};
