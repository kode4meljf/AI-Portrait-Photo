const materializeSeedream = require('./materializeSeedream');

exports.main = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const taskId = String(event.taskId || '').trim();
  if (!taskId) {
    return { ok: false, error: '缺少 taskId' };
  }

  return materializeSeedream.main(taskId);
};
