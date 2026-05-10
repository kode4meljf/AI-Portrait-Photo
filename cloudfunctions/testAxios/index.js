const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  try {
    // 调用一个简单的公共测试 API（返回请求者的 IP 等信息）
    const response = await axios.get('https://httpbin.org/get', {
      params: { test: 'cloudfunction', timestamp: Date.now() }
    });
    console.log('请求成功', response.data);
    return {
      success: true,
      data: response.data,
      message: 'axios 工作正常'
    };
  } catch (error) {
    console.error('请求失败', error);
    return {
      success: false,
      error: error.message,
      message: 'axios 调用出错'
    };
  }
};