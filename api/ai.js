import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const FAST_MODEL = 'gemini-3.1-flash-lite';
const STANDARD_MODEL = 'gemini-4-hydrogen';
const DEFAULT_USER_AGENT = 'aistudio-build';
const MODEL_COOLDOWN_MS = 2 * 60 * 1000; // 2 menit cooldown jika model timeout/503/429/404
const FAILOVER_TIMEOUT_MS = 12_000; // Failover cepat bila masih ada model cadangan
const FINAL_TIMEOUT_MS = 35_000;

const aiClientCache = new Map();
const modelCooldownUntil = new Map();

function getAiClient(apiKey) {
  let client = aiClientCache.get(apiKey);
  if (!client) {
    client = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
        },
      },
    });
    aiClientCache.set(apiKey, client);
  }
  return client;
}

function isModelInCooldown(model) {
  const until = modelCooldownUntil.get(model) || 0;
  if (until > Date.now()) return true;
  if (until) modelCooldownUntil.delete(model);
  return false;
}

function markModelCooldown(model) {
  modelCooldownUntil.set(model, Date.now() + MODEL_COOLDOWN_MS);
}

function clearModelCooldown(model) {
  modelCooldownUntil.delete(model);
}

function isModelUnavailableError(err) {
  const status = Number(err?.status || err?.code) || 0;
  const msg = String(err?.message || err || '').toLowerCase();
  const name = String(err?.name || '').toLowerCase();
  return (
    name === 'aborterror' ||
    status === 400 ||
    status === 404 ||
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('aborted') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('not found') ||
    msg.includes('not supported') ||
    msg.includes('unknown model') ||
    msg.includes('invalid model') ||
    msg.includes('temporarily') ||
    msg.includes('try again')
  );
}

async function resolveServerGeminiKey() {
  const envKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (envKey) return envKey;

  const supaUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
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

function resolveModelsToTry(requestedModel, speedMode) {
  const mode = String(speedMode || 'fast').toLowerCase();
  const allowedValid = new Set([FAST_MODEL, STANDARD_MODEL]);

  const preferredOrder =
    mode === 'deep'
      ? [STANDARD_MODEL, FAST_MODEL]
      : [FAST_MODEL, STANDARD_MODEL];

  const ordered = [];
  if (requestedModel && typeof requestedModel === 'string' && allowedValid.has(requestedModel)) {
    ordered.push(requestedModel);
  }
  for (const m of preferredOrder) {
    if (!ordered.includes(m)) ordered.push(m);
  }

  // Prioritaskan model yang sehat (tidak dalam cooldown) di urutan depan
  const healthy = ordered.filter((m) => !isModelInCooldown(m));
  const cooling = ordered.filter((m) => isModelInCooldown(m));
  return [...healthy, ...cooling];
}

function buildModelConfig(model, { systemInstruction, tools, generationConfig, speedMode, abortSignal }) {
  const isGemini4 = model.startsWith('gemini-4');
  const hasTools = Array.isArray(tools) && tools.length > 0;
  const mode = String(speedMode || 'fast').toLowerCase();

  const rawExtra = generationConfig && typeof generationConfig === 'object' ? { ...generationConfig } : {};
  const requestedThinking = rawExtra.thinkingConfig && typeof rawExtra.thinkingConfig === 'object'
    ? { ...rawExtra.thinkingConfig }
    : null;
  delete rawExtra.thinkingConfig;

  // Hapus parameter sampling yang tidak direkomendasikan / tidak valid di Gemini 4
  if (isGemini4) {
    delete rawExtra.temperature;
    delete rawExtra.topP;
    delete rawExtra.topK;
    delete rawExtra.candidateCount;
  }

  let thinkingLevel;
  if (requestedThinking?.thinkingLevel) {
    const reqLvl = String(requestedThinking.thinkingLevel).toUpperCase();
    if (isGemini4) {
      thinkingLevel = reqLvl === 'MINIMAL' ? ThinkingLevel.LOW : ThinkingLevel[reqLvl] || ThinkingLevel.LOW;
    } else {
      thinkingLevel = ThinkingLevel[reqLvl] || ThinkingLevel.MINIMAL;
    }
  } else if (isGemini4) {
    // Gemini 4 default = HIGH (lambat). Turunkan ke LOW untuk respons cepat, MEDIUM saat mode deep tanpa tool
    thinkingLevel = mode === 'deep' && !hasTools ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW;
  } else {
    // Gemini 3.1 Flash Lite: MINIMAL untuk chat/jawaban akhir tercepat, LOW saat memanggil tools agar akurat
    thinkingLevel = hasTools || mode === 'deep' ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL;
  }

  return {
    ...rawExtra,
    ...(systemInstruction ? { systemInstruction } : {}),
    ...(hasTools ? { tools } : {}),
    thinkingConfig: { thinkingLevel },
    ...(abortSignal ? { abortSignal } : {}),
  };
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function writeSseEvent(res, event, data) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  if (typeof res.flush === 'function') {
    try {
      res.flush();
    } catch {
      // ignore
    }
  }
}

function appendPartPreservingStructure(targetParts, part) {
  if (!part || typeof part !== 'object') return;
  const isPlainVisibleText =
    typeof part.text === 'string' &&
    !part.thought &&
    !part.functionCall &&
    !part.thoughtSignature &&
    Object.keys(part).every((k) => k === 'text');

  if (isPlainVisibleText && targetParts.length > 0) {
    const prev = targetParts[targetParts.length - 1];
    const prevIsPlainVisibleText =
      typeof prev.text === 'string' &&
      !prev.thought &&
      !prev.functionCall &&
      !prev.thoughtSignature &&
      Object.keys(prev).every((k) => k === 'text');
    if (prevIsPlainVisibleText) {
      prev.text += part.text;
      return;
    }
  }
  targetParts.push({ ...part });
}

async function runWithTimeout(promiseFactory, timeoutMs, externalSignal) {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort(externalSignal?.reason || new Error('Client aborted'));
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const timeoutErr = new Error(`Model timeout setelah ${Math.round(timeoutMs / 1000)} detik`);
      timeoutErr.status = 504;
      controller.abort(timeoutErr);
      reject(timeoutErr);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promiseFactory(controller.signal), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
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
      models: [FAST_MODEL, STANDARD_MODEL],
      streaming: true,
    });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const clientAbortController = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) {
      clientAbortController.abort(new Error('Client disconnected'));
    }
  });

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
      speedMode = 'fast',
      stream = false,
    } = body;

    if (!Array.isArray(contents) || contents.length === 0) {
      return sendJson(res, 400, { error: 'Payload contents wajib berupa array non-kosong.' });
    }

    const ai = getAiClient(apiKey);
    const modelsToTry = resolveModelsToTry(requestedModel, speedMode);

    // =========================================================================
    // MODE STREAMING SSE (TTFT super cepat, teks tampil langsung per potongan)
    // =========================================================================
    if (stream === true) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }

      let lastError = null;
      for (let i = 0; i < modelsToTry.length; i++) {
        const model = modelsToTry[i];
        const hasMoreFallback = i < modelsToTry.length - 1;
        const firstChunkTimeoutMs = hasMoreFallback ? FAILOVER_TIMEOUT_MS : FINAL_TIMEOUT_MS;

        let emittedVisibleDelta = false;
        const aggregatedParts = [];
        let accumulatedVisibleText = '';
        let finishReason = null;
        let usageMetadata = null;

        const attemptController = new AbortController();
        const onClientAbort = () => attemptController.abort(new Error('Client disconnected'));
        clientAbortController.signal.addEventListener('abort', onClientAbort, { once: true });

        let firstChunkTimer = setTimeout(() => {
          const timeoutErr = new Error(`Model ${model} timeout menunggu respon awal`);
          timeoutErr.status = 504;
          attemptController.abort(timeoutErr);
        }, firstChunkTimeoutMs);

        try {
          const config = buildModelConfig(model, {
            systemInstruction,
            tools,
            generationConfig,
            speedMode,
            abortSignal: attemptController.signal,
          });

          const responseStream = await ai.models.generateContentStream({
            model,
            contents,
            config,
          });

          let receivedFirstChunk = false;
          for await (const chunk of responseStream) {
            if (!receivedFirstChunk) {
              receivedFirstChunk = true;
              if (firstChunkTimer) {
                clearTimeout(firstChunkTimer);
                firstChunkTimer = null;
              }
              writeSseEvent(res, 'meta', { model });
            }

            if (chunk?.usageMetadata) {
              usageMetadata = chunk.usageMetadata;
            }

            const candidate = chunk?.candidates?.[0];
            if (candidate?.finishReason) {
              finishReason = candidate.finishReason;
            }

            const parts = candidate?.content?.parts || [];
            for (const part of parts) {
              appendPartPreservingStructure(aggregatedParts, part);
              if (typeof part.text === 'string' && part.text.length > 0 && !part.thought) {
                accumulatedVisibleText += part.text;
                emittedVisibleDelta = true;
                writeSseEvent(res, 'delta', { text: part.text });
              }
            }
          }

          if (firstChunkTimer) {
            clearTimeout(firstChunkTimer);
            firstChunkTimer = null;
          }
          clearModelCooldown(model);

          const finalCandidate = {
            content: {
              role: 'model',
              parts: aggregatedParts.length > 0 ? aggregatedParts : [{ text: accumulatedVisibleText }],
            },
            ...(finishReason ? { finishReason } : {}),
          };

          writeSseEvent(res, 'done', {
            model,
            candidates: [finalCandidate],
            text: accumulatedVisibleText,
            usageMetadata,
          });
          res.end();
          return;
        } catch (err) {
          if (firstChunkTimer) {
            clearTimeout(firstChunkTimer);
            firstChunkTimer = null;
          }
          lastError = err;

          if (clientAbortController.signal.aborted) {
            if (!res.writableEnded) res.end();
            return;
          }

          if (isModelUnavailableError(err)) {
            markModelCooldown(model);
          }

          // Hanya failover jika belum mengirim teks visible ke user
          if (!emittedVisibleDelta && hasMoreFallback && isModelUnavailableError(err)) {
            continue;
          }

          writeSseEvent(res, 'error', {
            error: err?.message || 'Gagal memproses stream Gemini API.',
          });
          res.end();
          return;
        } finally {
          clientAbortController.signal.removeEventListener('abort', onClientAbort);
        }
      }

      writeSseEvent(res, 'error', {
        error: lastError?.message || 'Gagal memproses permintaan Gemini API.',
      });
      res.end();
      return;
    }

    // =========================================================================
    // MODE JSON NON-STREAMING (Backwards-compatible)
    // =========================================================================
    let lastError = null;
    for (let i = 0; i < modelsToTry.length; i++) {
      const model = modelsToTry[i];
      const hasMoreFallback = i < modelsToTry.length - 1;
      const timeoutMs = hasMoreFallback ? FAILOVER_TIMEOUT_MS : FINAL_TIMEOUT_MS;

      try {
        const response = await runWithTimeout(
          (signal) => {
            const config = buildModelConfig(model, {
              systemInstruction,
              tools,
              generationConfig,
              speedMode,
              abortSignal: signal,
            });
            return ai.models.generateContent({
              model,
              contents,
              config,
            });
          },
          timeoutMs,
          clientAbortController.signal
        );

        clearModelCooldown(model);
        const candidate = response?.candidates?.[0] || null;
        return sendJson(res, 200, {
          model,
          candidates: response?.candidates || (candidate ? [candidate] : []),
          text: response?.text || '',
          usageMetadata: response?.usageMetadata || null,
        });
      } catch (err) {
        lastError = err;
        if (clientAbortController.signal.aborted) {
          if (!res.writableEnded) res.end();
          return;
        }
        if (isModelUnavailableError(err)) {
          markModelCooldown(model);
        }
        if (hasMoreFallback && isModelUnavailableError(err)) {
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error('Gagal memproses permintaan Gemini API.');
  } catch (err) {
    if (res.headersSent) {
      if (!res.writableEnded) res.end();
      return;
    }
    const status = Number(err?.status || err?.code) || 500;
    const message = err?.message || 'Terjadi kesalahan pada server AI.';
    return sendJson(res, status >= 400 && status < 600 ? status : 500, {
      error: message,
    });
  }
}
