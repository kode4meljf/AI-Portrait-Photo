Component({
  properties: {
    agreed: {
      type: Boolean,
      value: false
    },
    agreementUrl: {
      type: String,
      value: '/packageCustomer/pages/help/agreement'
    },
    privacyUrl: {
      type: String,
      value: '/packageCustomer/pages/help/privacy'
    }
  },

  methods: {
    onToggle() {
      this.triggerEvent('change', { agreed: !this.properties.agreed })
    },

    onOpenAgreement() {
      wx.navigateTo({ url: this.properties.agreementUrl })
    },

    onOpenPrivacy() {
      wx.navigateTo({ url: this.properties.privacyUrl })
    }
  }
})
