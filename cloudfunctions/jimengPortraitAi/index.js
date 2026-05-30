const submitAITask = require('./submitAITask');
const submitBatch = require('./submitBatch');
const retryPortrait = require('./retryPortrait');

exports.main = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  if (event.action === 'submit') {
    return submitAITask.main(event);
  }

  if (event.action === 'submitBatch') {
    return submitBatch.main(event);
  }

  if (event.action === 'retry') {
    return retryPortrait.main(event);
  }

  return {
    success: false,
    error: '未知请求，请传 action: "submit" | "submitBatch" | "retry"'
  };
};
