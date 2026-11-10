const RCE_API_URL = String(process.env.RCE_API_URL || '').trim().replace(/\/+$/, '');
const RCE_API_SECRET = process.env.RCE_WEB_API_SECRET || '';

async function rceRequest(endpoint, options = {}) {
  if (!RCE_API_URL || RCE_API_SECRET.length < 32) {
    const error = new Error('The RCE bot bridge is not configured. Set RCE_API_URL and RCE_WEB_API_SECRET on the website service.');
    error.status = 503;
    throw error;
  }
  let response;
  try {
    response = await fetch(`${RCE_API_URL}${endpoint}`, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${RCE_API_SECRET}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(60_000)
    });
  } catch (cause) {
    const error = new Error('Could not reach the RCE bot bridge. Check its URL and service status.');
    error.status = 502;
    error.cause = cause;
    throw error;
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `RCE bot request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return body;
}

module.exports = { rceRequest };
