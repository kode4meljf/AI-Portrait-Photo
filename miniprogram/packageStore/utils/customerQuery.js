/**
 * 客户列表查询：排除已软删除档案
 */

function activeStatusCondition(db) {
  const _ = db.command
  return _.or([{ status: _.exists(false) }, { status: _.neq('deleted') }])
}

/** @param {object} db wx.cloud.database() */
function storeCustomersWhere(db, storeId, extraAnd = null) {
  const _ = db.command
  const parts = [{ storeId }, activeStatusCondition(db)]
  if (extraAnd) parts.push(extraAnd)
  return _.and(parts)
}

/**
 * 本店是否已有该手机号客户（代客建档前预检，与云函数 findByPhone 规则一致）
 * @returns {Promise<object|null>}
 */
async function findStoreCustomerByPhone(storeId, phone) {
  const { normalizeMobilePhone } = require('../../utils/phone')
  const phoneResult = normalizeMobilePhone(phone)
  if (!phoneResult.ok) return null

  const db = wx.cloud.database()
  const res = await db
    .collection('customers')
    .where(storeCustomersWhere(db, storeId, { phone: phoneResult.phone }))
    .limit(1)
    .get()
  return res.data[0] || null
}

module.exports = {
  storeCustomersWhere,
  activeStatusCondition,
  findStoreCustomerByPhone
}
