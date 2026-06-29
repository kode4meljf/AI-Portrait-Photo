const {
  DEFAULT_SHARE_TITLE,
  DEFAULT_SHARE_PATH,
  DEFAULT_SHARE_IMAGE,
} = require('../utils/shareConfig')

module.exports = Behavior({
  methods: {
    onShareAppMessage() {
      return {
        title: DEFAULT_SHARE_TITLE,
        path: DEFAULT_SHARE_PATH,
        imageUrl: DEFAULT_SHARE_IMAGE,
      }
    },

    onShareTimeline() {
      return {
        title: DEFAULT_SHARE_TITLE,
        imageUrl: DEFAULT_SHARE_IMAGE,
      }
    },
  },
})
