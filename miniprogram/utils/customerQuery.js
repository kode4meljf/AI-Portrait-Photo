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

module.exports = { storeCustomersWhere, activeStatusCondition }
