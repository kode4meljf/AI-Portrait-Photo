const ICON = '/assets/icons/help'

const ICONS = {
  about: `${ICON}/icon-about.svg`,
  feedback: `${ICON}/icon-feedback.svg`,
  phone: `${ICON}/icon-phone.svg`,
  agreement: `${ICON}/icon-agreement.svg`,
  privacy: `${ICON}/icon-privacy.svg`,
  clean: `${ICON}/icon-clean.svg`,
};

const CUSTOMER_BASE = '/packageCustomer/pages/help'
const STORE_BASE = '/packageStore/pages/help'

const TIPS = {
  customer: '如有疑问或建议，可通过下方入口联系我们。',
  store: '门店端使用问题、功能建议与缓存清理，请在此处理。',
};

function getAppVersion() {
  try {
    const info = wx.getAccountInfoSync()
  const v = info && info.miniProgram && info.miniProgram.version
    return v || '1.0.0'
  } catch (e) {
    return '1.0.0'
  }
}

const { fetchPlatformSupportPhone } = require('./platformSettings')

function buildSections(role, supportPhone) {
  const serviceItems = [
    { action: 'about', text: '关于', iconSrc: ICONS.about },
    { action: 'feedback', text: '意见反馈', iconSrc: ICONS.feedback },
    {
      action: 'support',
      text: '联系平台客服',
      iconSrc: ICONS.phone,
      value: supportPhone || '暂无',
    },
  ]

  const legalItems = [
    { action: 'agreement', text: '用户协议', iconSrc: ICONS.agreement },
    { action: 'privacy', text: '隐私政策', iconSrc: ICONS.privacy },
  ]

  const sections = [
    { title: '服务与支持', items: serviceItems },
    { title: '条款与隐私', items: legalItems },
  ]

  if (role === 'store') {
    sections.splice(1, 0, {
      title: '存储',
      items: [{ action: 'clear', text: '清理缓存', iconSrc: ICONS.clean }],
    })
  }

  return sections
}

async function buildHelpPageData(role) {
  const supportPhone = await fetchPlatformSupportPhone()
  return {
    tip: TIPS[role] || TIPS.customer,
    sections: buildSections(role, supportPhone),
    versionText: `版本 ${getAppVersion()}`,
    supportPhone,
  }
}

function getBasePath(role) {
  return role === 'store' ? STORE_BASE : CUSTOMER_BASE
}

function navigateHelpItem(role, action, supportPhone) {
  const base = getBasePath(role)

  switch (action) {
    case 'about':
      wx.navigateTo({ url: `${base}/about` })
      break
    case 'feedback':
      wx.navigateTo({ url: `${base}/feedback` })
      break
    case 'agreement':
      wx.navigateTo({ url: `${base}/agreement` })
      break
    case 'privacy':
      wx.navigateTo({ url: `${base}/privacy` })
      break
    case 'support':
      if (supportPhone) {
        wx.makePhoneCall({ phoneNumber: supportPhone })
      } else {
        wx.showToast({ title: '暂未配置客服电话', icon: 'none' })
      }
      break
    case 'clear':
      clearStoreCache()
      break
    default:
      break
  }
}

function clearStoreCache() {
  wx.showModal({
    title: '清理缓存',
    content: '将清除本地临时数据与图片缓存，不会退出登录。',
    confirmText: '清理',
    success(res) {
      if (!res.confirm) return
      try {
        const keepKeys = ['storeSession', 'store_token']
        const info = wx.getStorageInfoSync()
        ;(info.keys || []).forEach((key) => {
          if (keepKeys.indexOf(key) === -1) {
            wx.removeStorageSync(key)
          }
        })
      } catch (e) {
        /* ignore */
      }
      wx.showToast({ title: '已清理', icon: 'success' })
    },
  })
}

function createHelpIndexPage(role) {
  return {
    behaviors: [require('../behaviors/pageShare')],
    data: {
      tip: '',
      sections: [],
      versionText: '',
      supportPhone: '',
    },

    onLoad() {
      wx.setNavigationBarTitle({ title: '帮助' })
      this.loadPage()
    },

    async loadPage() {
      wx.showLoading({ title: '加载中', mask: true })
      try {
        const cfg = await buildHelpPageData(role)
        this.setData(cfg)
      } finally {
        wx.hideLoading()
      }
    },

    onItemTap(e) {
      const action = e.currentTarget.dataset.action
      navigateHelpItem(role, action, this.data.supportPhone)
    },
  }
}

const { AGREEMENT_TEXT, PRIVACY_TEXT } = require('./legalTexts')

const ABOUT_DESC = {
  customer: '银梦AI写真为顾客提供 AI 写真生成、选片与门店取片服务。您可在绑定门店后浏览样片、下单并查看成片。',
  store: '银梦AI写真门店端用于门店管理订单、会员、样片与成片交付。如有功能建议欢迎通过意见反馈告知我们。',
}

module.exports = {
  ICONS,
  CUSTOMER_BASE,
  STORE_BASE,
  getAppVersion,
  buildHelpPageData,
  navigateHelpItem,
  clearStoreCache,
  createHelpIndexPage,
  ABOUT_DESC,
  AGREEMENT_TEXT,
  PRIVACY_TEXT,
}
