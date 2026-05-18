/**
 * @file 订单云函数调用封装
 */

const callOrderApi = (action, data = {}) => {
  const { orderType = 'frame', ...payload } = data;

  return wx.cloud
    .callFunction({
      name: 'orderApi',
      data: { action, orderType, ...payload }
    })
    .then((res) => {
      if (res.errMsg && res.errMsg !== 'cloud.callFunction:ok') {
        throw new Error(res.errMsg);
      }
      const result = res.result || {};
      if (!result.success) {
        throw new Error(result.error || '请求失败');
      }
      return result;
    })
    .catch((err) => {
      const msg = `${err.message || ''} ${err.errMsg || ''}`;
      if (/FUNCTION_NOT_FOUND|FunctionName.*orderApi|could not be found/i.test(msg)) {
        throw new Error('请先部署云函数 orderApi');
      }
      if (err.message) throw err;
      throw new Error(err.errMsg || '网络异常，请重试');
    });
};

module.exports = { callOrderApi };
