/**
 * 云相册批次收藏（batches.isFavorite）
 */

async function setBatchFavorite(batchId, isFavorite) {
  const id = String(batchId || '').trim();
  if (!id) throw new Error('缺少 batchId');
  const db = wx.cloud.database();
  await db.collection('batches').doc(id).update({
    data: {
      isFavorite: !!isFavorite,
      updateTime: db.serverDate()
    }
  });
  return !!isFavorite;
}

async function loadBatchFavorite(batchId) {
  const id = String(batchId || '').trim();
  if (!id) return false;
  const db = wx.cloud.database();
  const res = await db.collection('batches').doc(id).get();
  return !!(res.data && res.data.isFavorite);
}

module.exports = {
  setBatchFavorite,
  loadBatchFavorite
};
