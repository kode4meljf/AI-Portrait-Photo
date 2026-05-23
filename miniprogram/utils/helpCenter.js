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

const ABOUT_DESC = {
  customer: 'AI写真馆为顾客提供 AI 写真生成、选片与门店取片服务。您可在绑定门店后浏览样片、下单并查看成片。',
  store: 'AI写真馆门店端用于门店管理订单、会员、样片与成片交付。如有功能建议欢迎通过意见反馈告知我们。',
}

const AGREEMENT_TEXT = `AI写真馆用户协议

欢迎使用 AI写真馆小程序。使用本服务即表示您同意以下条款：

1. 服务说明
本小程序由平台与入驻门店共同为您提供 AI 写真相关服务，包括样片浏览、下单、成片查看等。

2. 账号与信息
您应提供真实、有效的联系方式；门店端账号仅限授权人员使用。

3. 内容与版权
您上传的照片仅用于本次写真服务；生成成片的使用权归您与门店约定范围内，请勿用于违法或侵权用途。

4. 免责声明
AI 生成结果可能存在偏差，门店与平台将尽力保障服务质量，不对不可抗力或第三方原因导致的损失承担责任。

5. 协议变更
我们可能更新本协议，更新后继续使用即视为同意新版协议。`

const PRIVACY_TEXT = `AI写真馆隐私政策

我们重视您的个人信息保护：

1. 收集的信息
可能包括：微信 openid、手机号（经您授权）、订单与选片记录、门店绑定关系等。

2. 使用目的
用于账号识别、订单处理、客服联系、服务改进及法律合规要求。

3. 存储与安全
数据存储于微信云开发环境，采取合理安全措施；仅在必要期限内保留。

4. 共享与披露
未经您同意，不向无关第三方出售您的个人信息；法律法规要求除外。

5. 您的权利
您可申请更正、删除相关个人信息，或通过意见反馈联系我们。

6. 联系我们
如有隐私疑问，请通过「帮助」中的客服电话或意见反馈与我们联系。`

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
