const {
  subscribePrivacyShow,
  agreePrivacyAuthorization,
  rejectPrivacyAuthorization,
  openPrivacyContract,
  getPrivacySetting
} = require('../../utils/privacy')

Component({
  data: {
    show: false,
    contractName: '用户隐私保护指引'
  },

  lifetimes: {
    attached() {
      const app = getApp()
      this._unsub = subscribePrivacyShow(app, (show) => {
        this.setData({ show: !!show })
      })
      getPrivacySetting().then((res) => {
        if (res && res.privacyContractName) {
          this.setData({ contractName: res.privacyContractName })
        }
      })
    },
    detached() {
      if (typeof this._unsub === 'function') this._unsub()
    }
  },

  methods: {
    preventMove() {},

    onOpenContract() {
      openPrivacyContract()
    },

    onAgree() {
      agreePrivacyAuthorization(getApp())
    },

    onDisagree() {
      rejectPrivacyAuthorization(getApp())
      wx.showToast({ title: '需同意隐私政策后继续使用', icon: 'none' })
    }
  }
})
