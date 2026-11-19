/**
 * Vercel Serverless Proxy for Trello Attachment & Cover Images
 * ------------------------------------------------------------
 * Eliminates browser CORS blocks when fetching images hosted on trello.com /
 * api.trello.com / trellocdn.com that require Trello OAuth Authorization headers.
 *
 * Route: GET /api/trello-image?url=<encoded_trello_url>
 */

const DEFAULT_TRELLO_KEY = 'd4d21774e001c525d41aabbbb9b9940a';
const DEFAULT_TRELLO_TOKEN =
  'ATTA24c8656d86fe6a0499a0e81d8c8f2f0f200ec6e7d52a9259646c1e84e03943ac56487FCC';

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(payload));
}

function isAllowedTrelloImageUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const isTrelloApiHost =
    host === 'trello.com' ||
    host === 'api.trello.com' ||
    host.endsWith('.trello.com');
  const isTrelloCdnHost =
    host === 'trello-attachments.s3.amazonaws.com' ||
    host.endsWith('.trellocdn.com');

  if (!isTrelloApiHost && !isTrelloCdnHost) {
    return null;
  }

  if (isTrelloApiHost) {
    const p = parsed.pathname;
    if (!p.startsWith('/1/cards/') || !p.includes('/attachments/')) {
      return null;
    }
  }

  return parsed;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  let targetUrl = req.query?.url;
  if (Array.isArray(targetUrl)) {
    targetUrl = targetUrl[0];
  }
  if (!targetUrl && req.url) {
    try {
      const parsedReq = new URL(req.url, 'http://localhost');
      targetUrl = parsedReq.searchParams.get('url') || '';
    } catch {
      targetUrl = '';
    }
  }

  targetUrl = String(targetUrl || '').trim();
  if (!targetUrl) {
    sendJson(res, 400, { error: 'Missing required query parameter: url' });
    return;
  }

  const validatedUrl = isAllowedTrelloImageUrl(targetUrl);
  if (!validatedUrl) {
    sendJson(res, 403, { error: 'URL host or path is not allowed for Trello image proxy' });
    return;
  }

  const apiKey = String(process.env.TRELLO_API_KEY || DEFAULT_TRELLO_KEY).trim();
  const apiToken = String(process.env.TRELLO_API_TOKEN || DEFAULT_TRELLO_TOKEN).trim();
  const authHeader = `OAuth oauth_consumer_key="${apiKey}", oauth_token="${apiToken}"`;

  const host = validatedUrl.hostname.toLowerCase();
  const needsAuthHeader =
    host === 'trello.com' || host === 'api.trello.com' || host.endsWith('.trello.com');

  let lastStatus = 502;
  let lastError = 'Upstream fetch failed';

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 600));
    }

    try {
      const upstream = await fetch(validatedUrl.toString(), {
        method: 'GET',
        headers: needsAuthHeader ? { Authorization: authHeader } : {},
        redirect: 'follow',
      });

      if (upstream.status === 429 || upstream.status >= 500) {
        lastStatus = upstream.status;
        lastError = `Upstream Trello HTTP ${upstream.status}`;
        continue;
      }

      if (!upstream.ok) {
        sendJson(res, upstream.status, {
          error: `Upstream Trello returned HTTP ${upstream.status}`,
        });
        return;
      }

      const contentType = String(upstream.headers.get('content-type') || '').toLowerCase();
      if (!contentType.startsWith('image/')) {
        sendJson(res, 415, {
          error: `Upstream response is not an image (${contentType || 'unknown'})`,
        });
        return;
      }

      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      res.setHeader(
        'Cache-Control',
        'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
      );
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(buffer);
      return;
    } catch (err) {
      lastStatus = 502;
      lastError = err?.message || 'Network error fetching Trello image';
    }
  }

  sendJson(res, lastStatus, { error: lastError });
}
