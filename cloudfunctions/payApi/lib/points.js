/** 10 积分 = 1 元；stores.balance 存积分 */
const POINTS_PER_YUAN = 10;

function resolvePackagePoints(row) {
  if (!row) return 0;
  if (row.points != null && row.points !== '') return Number(row.points) || 0;
  return Number(row.times) || 0;
}

module.exports = {
  POINTS_PER_YUAN,
  resolvePackagePoints
};
