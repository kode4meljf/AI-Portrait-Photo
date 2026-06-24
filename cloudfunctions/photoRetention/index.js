const { cleanupExpiredOriginals } = require('./lib/cleanup')

exports.main = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false

  if (event.Type === 'Timer' || event.TriggerName || event.action === 'run') {
    const result = await cleanupExpiredOriginals({
      retentionDays: event.retentionDays,
    })
    console.log('[photoRetention]', JSON.stringify(result))
    return { success: true, data: result }
  }

  return { success: false, error: '请传 action: "run" 或使用定时触发器' }
}
