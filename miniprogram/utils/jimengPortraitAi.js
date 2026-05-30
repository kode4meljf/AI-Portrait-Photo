/**
 * 即梦 AI 写真云函数封装
 */

function callJimengPortraitAi(data) {
  return wx.cloud.callFunction({
    name: 'jimengPortraitAi',
    data
  }).then((res) => {
    const result = res.result || {};
    if (result.success === false) {
      const err = new Error(result.error || '即梦任务提交失败');
      throw err;
    }
    return result;
  });
}

function submitPortraitTask(photoId, templateId) {
  return callJimengPortraitAi({
    action: 'submit',
    photoId,
    templateId
  });
}

function isPortraitGenerating(generateStatus) {
  return generateStatus === 'pending' || generateStatus === 'processing';
}

module.exports = {
  callJimengPortraitAi,
  submitPortraitTask,
  isPortraitGenerating
};
