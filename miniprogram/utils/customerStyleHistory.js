/**
 * 客户已成功生成过的风格 ID（photos.styleId，仅成功成片）
 */
const { isAiPhotoSuccess } = require('../packageStore/utils/albumPhotos')

const MP_PAGE_SIZE = 20

async function fetchCustomerUsedStyleIds(db, storeId, customerId) {
  const sid = String(storeId || '').trim()
  const cid = String(customerId || '').trim()
  if (!sid || !cid) return []

  const used = new Set()
  let skip = 0

  while (true) {
    const res = await db
      .collection('photos')
      .where({ storeId: sid, customerId: cid })
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(MP_PAGE_SIZE)
      .get()
    const rows = res.data || []
    if (!rows.length) break

    rows.forEach((row) => {
      if (!isAiPhotoSuccess(row)) return
      const styleId = String(row.styleId || '').trim()
      if (styleId) used.add(styleId)
    })

    skip += rows.length
    if (rows.length < MP_PAGE_SIZE) break
  }

  return [...used]
}

module.exports = {
  fetchCustomerUsedStyleIds
}
