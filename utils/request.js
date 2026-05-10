/**
 * @file 统一请求封装
 * @description 封装wx.request，添加token和错误处理
 */

const BASE_URL = "https://your-api-domain.com";

const request = (options) => {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + options.url,
      method: options.method || "GET",
      data: options.data,
      header: {
        "Content-Type": "application/json",
        "Authorization": wx.getStorageSync("token") || ""
      },
      success: (res) => {
        if (res.statusCode === 200) {
          resolve(res.data);
        } else {
          reject(res);
        }
      },
      fail: reject
    });
  });
};

module.exports = { request };