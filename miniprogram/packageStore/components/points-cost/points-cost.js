Component({
  options: {
    styleIsolation: 'apply-shared'
  },
  properties: {
    value: {
      type: null,
      value: 0
    },
    label: {
      type: String,
      value: ''
    },
    suffix: {
      type: String,
      value: ''
    },
    theme: {
      type: String,
      value: 'light'
    },
    size: {
      type: String,
      value: 'md'
    }
  }
});
