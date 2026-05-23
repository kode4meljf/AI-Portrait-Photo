const TAB_ROUTES = [
  'pages/index/index',
  'pages/gallery/gallery',
  'pages/order-list/order-list',
  'pages/profile/profile'
]

/** 同步门店 custom-tab-bar 选中项（在 tab 页 onShow 中调用） */
function syncStoreTabBar(page) {
  if (!page || typeof page.getTabBar !== 'function') return
  const tabBar = page.getTabBar()
  if (!tabBar) return
  const route = page.route || ''
  const index = TAB_ROUTES.indexOf(route)
  if (index >= 0) tabBar.setData({ selected: index })
}

/** 弹层期间隐藏 custom-tab-bar（勿用 wx.hideTabBar，否则会叠出双层 TabBar） */
function setStoreTabBarHidden(page, hidden) {
  if (!page || typeof page.getTabBar !== 'function') return
  const tabBar = page.getTabBar()
  if (tabBar) tabBar.setData({ hidden: !!hidden })
}

module.exports = { syncStoreTabBar, setStoreTabBarHidden, TAB_ROUTES }
