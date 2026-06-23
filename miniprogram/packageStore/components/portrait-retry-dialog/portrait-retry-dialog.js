Component({
  properties: {
    visible: { type: Boolean, value: false },
    styleName: { type: String, value: '' },
    cost: { type: Number, value: 1 },
    balance: { type: Number, value: 0 },
    loading: { type: Boolean, value: false }
  },

  methods: {
    preventMove() {},

    onCancel() {
      if (this.data.loading) return;
      this.triggerEvent('cancel');
    },

    onConfirm() {
      if (this.data.loading) return;
      this.triggerEvent('confirm');
    }
  }
});
