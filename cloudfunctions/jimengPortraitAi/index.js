const submitAITask = require('./submitAITask');
const processTasksWorker = require('./processTasksWorker');

exports.main = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  if (event.Type === 'Timer' || event.TriggerName) {
    return processTasksWorker.main(event, context);
  }

  if (event.action === 'submit') {
    return submitAITask.main(event);
  }

  return { success: false, error: '未知请求，小程序请传 action: "submit"' };
};
