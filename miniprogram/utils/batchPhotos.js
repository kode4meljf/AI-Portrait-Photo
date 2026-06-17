/**
 * 按批次查询 photos（分页拉全，避免小程序端 .get() 默认仅 20 条）
 */
const DB_BATCH = 100;

async function fetchPhotosByBatchId(db, batchId, { orderBy = 'createTime', order = 'asc' } = {}) {
  const id = String(batchId || '').trim();
  if (!id) return [];
  const map = await fetchPhotosByBatchIds(db, [id], { orderBy, order });
  return map[id] || [];
}

async function fetchPhotosByBatchIds(db, batchIds, { orderBy = 'createTime', order = 'asc' } = {}) {
  const ids = [...new Set((batchIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const photoMap = {};
  ids.forEach((id) => {
    photoMap[id] = [];
  });
  if (!ids.length) return photoMap;

  const cmd = db.command;
  let skip = 0;
  while (true) {
    let query = db.collection('photos').where({ batchId: cmd.in(ids) });
    if (orderBy) {
      query = query.orderBy(orderBy, order);
    }
    const res = await query.skip(skip).limit(DB_BATCH).get();
    const rows = res.data || [];
    rows.forEach((photo) => {
      const key = photo.batchId;
      if (!photoMap[key]) photoMap[key] = [];
      photoMap[key].push(photo);
    });
    if (rows.length < DB_BATCH) break;
    skip += rows.length;
  }
  return photoMap;
}

module.exports = {
  DB_BATCH,
  fetchPhotosByBatchId,
  fetchPhotosByBatchIds
};
