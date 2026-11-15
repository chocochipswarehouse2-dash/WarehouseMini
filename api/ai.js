import { GoogleGenAI } from '@google/genai';

const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_USER_AGENT = 'aistudio-build';

function isModelUnavailableError(err) {
  const status = err?.status || err?.code;
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    status === 404 ||
    status === 400 ||
    msg.includes('not found') ||
    msg.includes('not supported') ||
    msg.includes('unknown model') ||
    msg.includes('invalid model')
  );
}

async function resolveServerGeminiKey() {
  const envKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (envKey) return envKey;

  // Optional server-only fallback to wms_system_docs when SUPABASE_SERVICE_KEY is configured
  const supaUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const serviceKey = String(process.env.SUPABASE_SERVICE_KEY || '').trim();
  if (!supaUrl || !serviceKey) return '';

  try {
    const res = await fetch(
      `${supaUrl}/rest/v1/wms_system_docs?section_id=eq.wms_ai_config&select=content&limit=1`,
      {
        method: 'GET',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Accept: 'application/json',
        },
      }
    );
    if (!res.ok) return '';
    const rows = await res.json();
    if (Array.isArray(rows) && rows[0]?.content) {
      const parsed = JSON.parse(rows[0].content);
      return String(parsed?.apiKey || '').trim();
    }
  } catch {
    // ignore fallback failure
  }
  return '';
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return;
  }

  if (req.method === 'GET') {
    const hasKey = Boolean(await resolveServerGeminiKey());
    return sendJson(res, 200, {
      ok: true,
      configured: hasKey,
      models: [PRIMARY_MODEL, FALLBACK_MODEL],
    });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const apiKey = await resolveServerGeminiKey();
    if (!apiKey) {
      return sendJson(res, 503, {
        error: 'Layanan AI server belum dikonfigurasi. Pastikan GEMINI_API_KEY telah diatur pada environment server.',
      });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const {
      contents,
      systemInstruction,
      tools,
      generationConfig,
      requestedModel,
    } = body;

    if (!Array.isArray(contents) || contents.length === 0) {
      return sendJson(res, 400, { error: 'Payload contents wajib berupa array non-kosong.' });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
        },
      },
    });

    const config = {
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(Array.isArray(tools) && tools.length > 0 ? { tools } : {}),
      ...(generationConfig && typeof generationConfig === 'object' ? generationConfig : {}),
    };

    const modelsToTry = [];
    if (requestedModel === PRIMARY_MODEL || requestedModel === FALLBACK_MODEL) {
      modelsToTry.push(requestedModel);
    }
    if (!modelsToTry.includes(PRIMARY_MODEL)) modelsToTry.push(PRIMARY_MODEL);
    if (!modelsToTry.includes(FALLBACK_MODEL)) modelsToTry.push(FALLBACK_MODEL);

    let lastError = null;
    for (let i = 0; i < modelsToTry.length; i++) {
      const model = modelsToTry[i];
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config,
        });

        const candidate = response?.candidates?.[0] || null;
        return sendJson(res, 200, {
          model,
          candidates: response?.candidates || (candidate ? [candidate] : []),
          text: response?.text || '',
          usageMetadata: response?.usageMetadata || null,
        });
      } catch (err) {
        lastError = err;
        if (i < modelsToTry.length - 1 && isModelUnavailableError(err)) {
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error('Gagal memproses permintaan Gemini API.');
  } catch (err) {
    const status = Number(err?.status || err?.code) || 500;
    const message = err?.message || 'Terjadi kesalahan pada server AI.';
    return sendJson(res, status >= 400 && status < 600 ? status : 500, {
      error: message,
    });
  }
}
