const { parseCloudDate } = require('./cloudDate');

function categorizeOrder(order) {
  const name = order.frameName || '';
  const style = order.styleName || '';
  if (name.includes('相框') || name.includes('摆台') || style) return 'frame';
  if (name.includes('写真集') || name.includes('相册')) return 'album';
  if (name.includes('精修') || name.includes('照片')) return 'photo';
  return 'other';
}

function computeDashboardStats(orders) {
  const categoryCount = { frame: 0, album: 0, photo: 0, other: 0 };
  (orders || []).forEach((order) => {
    categoryCount[categorizeOrder(order)] += 1;
  });
  return {
    monthOrderCount: (orders || []).length,
    categoryCount
  };
}

function filterOrdersInMonth(orders, monthStart) {
  const startMs = monthStart.getTime();
  return (orders || []).filter((order) => {
    const d = parseCloudDate(order.createTime);
    return d && !Number.isNaN(d.getTime()) && d.getTime() >= startMs;
  });
}

module.exports = {
  categorizeOrder,
  computeDashboardStats,
  filterOrdersInMonth
};
