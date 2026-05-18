const ORDER_TYPES = {
  frame: { collection: 'frame_orders', orderNoPrefix: 'OR' },
  album: { collection: 'album_orders', orderNoPrefix: 'AL' }
};
const STATUS_TAB_MAP = {
  pending: '待处理',
  producing: '制作中',
  shipped: '已发货',
  done: '已完成'
};
const ORDER_STATUSES = ['待处理', '制作中', '已发货', '已完成'];
module.exports = { ORDER_TYPES, STATUS_TAB_MAP, ORDER_STATUSES };
