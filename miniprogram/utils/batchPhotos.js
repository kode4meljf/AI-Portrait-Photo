/**
 * 按批次查询 photos（分页拉全）
 * 小程序端单次 get 上限 20 条，须用 20 作为分页步长，不能用 100 判断结束。
 */
const MP_PAGE_SIZE = 20;

async function fetchPhotosByBatchId(db, batchId, { orderBy = 'createTime', order = 'asc' } = {}) {
  const id = String(batchId || '').trim();
  if (!id) return [];

  const photos = [];
  let skip = 0;
  while (true) {
    let query = db.collection('photos').where({ batchId: id });
    if (orderBy) {
      query = query.orderBy(orderBy, order);
    }
    const res = await query.skip(skip).limit(MP_PAGE_SIZE).get();
    const rows = res.data || [];
    photos.push(...rows);
    if (rows.length < MP_PAGE_SIZE) break;
    skip += rows.length;
  }
  return photos;
}

async function fetchPhotosByBatchIds(db, batchIds, options = {}) {
  const ids = [...new Set((batchIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const photoMap = {};
  if (!ids.length) return photoMap;

  await Promise.all(
    ids.map(async (id) => {
      photoMap[id] = await fetchPhotosByBatchId(db, id, options);
    })
  );
  return photoMap;
}

module.exports = {
  MP_PAGE_SIZE,
  fetchPhotosByBatchId,
  fetchPhotosByBatchIds
};
