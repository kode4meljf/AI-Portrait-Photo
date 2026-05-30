const submitAITask = require('./submitAITask');
const retryPortrait = require('./retryPortrait');
const processTasksWorker = require('./processTasksWorker');

exports.main = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  if (event.Type === 'Timer' || event.TriggerName) {
    return processTasksWorker.main(event, context);
  }

  if (event.action === 'submit') {
    return submitAITask.main(event);
  }

  if (event.action === 'retry') {
    return retryPortrait.main(event);
  }

  return { success: false, error: '未知请求，小程序请传 action: "submit" 或 "retry"' };
};
