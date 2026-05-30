function parseHttpEvent(event) {
  if (!event || !event.httpMethod) return null;
  const method = (event.httpMethod || 'GET').toUpperCase();
  let body = {};
  if (event.body) {
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch {
      body = {};
    }
  }
  const query = event.queryStringParameters || {};
  const headers = event.headers || {};
  return { method, body, query, headers, isHttp: true };
}

module.exports = { parseHttpEvent };
