const processTasksWorker = require('./processTasksWorker');

exports.main = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  if (event.Type === 'Timer' || event.TriggerName || event.action === 'run') {
    return processTasksWorker.main(event, context);
  }

  return { processed: 0, error: '请传 action: "run" 或使用定时触发器' };
};
