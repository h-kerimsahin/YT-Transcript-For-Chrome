const TRANSLATION_CHAR_LIMIT = 500000;
const STORAGE_SETTINGS_KEY = 'ythTranslationSettings';
const STORAGE_USAGE_KEY = 'ythTranslationUsage';
const PROVIDER_ORDER = ['deepl', 'google'];

const LANGUAGE_MAP = {
  ar: { deepl: 'AR', google: 'ar', label: 'Arapça' },
  bg: { deepl: 'BG', google: 'bg', label: 'Bulgarca' },
  cs: { deepl: 'CS', google: 'cs', label: 'Çekçe' },
  da: { deepl: 'DA', google: 'da', label: 'Danca' },
  de: { deepl: 'DE', google: 'de', label: 'Almanca' },
  el: { deepl: 'EL', google: 'el', label: 'Yunanca' },
  en: { deepl: 'EN', google: 'en', label: 'İngilizce' },
  es: { deepl: 'ES', google: 'es', label: 'İspanyolca' },
  et: { deepl: 'ET', google: 'et', label: 'Estonca' },
  fi: { deepl: 'FI', google: 'fi', label: 'Fince' },
  fr: { deepl: 'FR', google: 'fr', label: 'Fransızca' },
  hu: { deepl: 'HU', google: 'hu', label: 'Macarca' },
  id: { deepl: 'ID', google: 'id', label: 'Endonezce' },
  it: { deepl: 'IT', google: 'it', label: 'İtalyanca' },
  ja: { deepl: 'JA', google: 'ja', label: 'Japonca' },
  ko: { deepl: 'KO', google: 'ko', label: 'Korece' },
  lt: { deepl: 'LT', google: 'lt', label: 'Litvanca' },
  lv: { deepl: 'LV', google: 'lv', label: 'Letonca' },
  nb: { deepl: 'NB', google: 'no', label: 'Norveççe' },
  nl: { deepl: 'NL', google: 'nl', label: 'Hollandaca' },
  pl: { deepl: 'PL', google: 'pl', label: 'Lehçe' },
  pt: { deepl: 'PT-PT', google: 'pt', label: 'Portekizce' },
  ro: { deepl: 'RO', google: 'ro', label: 'Romence' },
  ru: { deepl: 'RU', google: 'ru', label: 'Rusça' },
  sk: { deepl: 'SK', google: 'sk', label: 'Slovakça' },
  sl: { deepl: 'SL', google: 'sl', label: 'Slovence' },
  sv: { deepl: 'SV', google: 'sv', label: 'İsveççe' },
  tr: { deepl: 'TR', google: 'tr', label: 'Türkçe' },
  uk: { deepl: 'UK', google: 'uk', label: 'Ukraynaca' },
  zh: { deepl: 'ZH', google: 'zh-CN', label: 'Çince' }
};

function normalizeSettings(raw = {}) {
  return {
    deeplKey: typeof raw.deeplKey === 'string' ? raw.deeplKey.trim() : '',
    googleKey: typeof raw.googleKey === 'string' ? raw.googleKey.trim() : ''
  };
}

function normalizeUsage(raw = {}) {
  const makeProviderUsage = provider => ({
    usedChars: Math.max(0, Number(raw?.[provider]?.usedChars) || 0)
  });
  return {
    deepl: makeProviderUsage('deepl'),
    google: makeProviderUsage('google')
  };
}

async function getConfig() {
  const stored = await chrome.storage.local.get([STORAGE_SETTINGS_KEY, STORAGE_USAGE_KEY]);
  return {
    settings: normalizeSettings(stored[STORAGE_SETTINGS_KEY]),
    usage: normalizeUsage(stored[STORAGE_USAGE_KEY])
  };
}

async function saveSettings(settings) {
  const next = normalizeSettings(settings);
  await chrome.storage.local.set({ [STORAGE_SETTINGS_KEY]: next });
  return next;
}

async function saveUsage(usage) {
  await chrome.storage.local.set({ [STORAGE_USAGE_KEY]: normalizeUsage(usage) });
}

function providerName(provider) {
  return provider === 'deepl' ? 'DeepL' : 'Google Cloud Translation';
}

function makeError(message, code = 0) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function decodeHtmlEntities(text) {
  return String(text || '').replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|#39);/gi, entity => {
    const named = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&apos;': "'",
      '&#39;': "'"
    };
    if (named[entity]) return named[entity];
    if (entity.startsWith('&#x') || entity.startsWith('&#X')) return String.fromCodePoint(parseInt(entity.slice(3, -1), 16));
    if (entity.startsWith('&#')) return String.fromCodePoint(parseInt(entity.slice(2, -1), 10));
    return entity;
  });
}

function buildBatches(texts, maxChars = 3500, maxItems = 25) {
  const batches = [];
  let current = [];
  let currentChars = 0;
  texts.forEach((text, index) => {
    const value = String(text || '');
    const textChars = value.length;
    if (current.length && (current.length >= maxItems || currentChars + textChars > maxChars)) {
      batches.push({ items: current, charCount: currentChars });
      current = [];
      currentChars = 0;
    }
    current.push({ index, text: value });
    currentChars += textChars;
    if (textChars > maxChars) {
      batches.push({ items: current, charCount: currentChars });
      current = [];
      currentChars = 0;
    }
  });
  if (current.length) batches.push({ items: current, charCount: currentChars });
  return batches;
}

function isQuotaError(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 429
    || error?.code === 456
    || message.includes('quota')
    || message.includes('too many requests')
    || message.includes('limit')
    || message.includes('character limit');
}

function getTargetCodes(targetLanguage) {
  const normalized = String(targetLanguage || '').toLowerCase();
  const target = LANGUAGE_MAP[normalized];
  if (!target) throw makeError('Bu harici çeviri dili henüz desteklenmiyor.');
  return target;
}

async function translateWithDeepL(texts, targetLanguage, apiKey) {
  const target = getTargetCodes(targetLanguage);
  const body = new URLSearchParams();
  body.set('target_lang', target.deepl);
  texts.forEach(text => body.append('text', text));
  const response = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message || `DeepL isteği başarısız (${response.status}).`;
    throw makeError(message, response.status);
  }
  const translations = Array.isArray(data?.translations) ? data.translations : [];
  if (translations.length !== texts.length) throw makeError('DeepL beklenmeyen sayıda çeviri döndürdü.');
  return translations.map(item => String(item?.text || ''));
}

async function translateWithGoogle(texts, targetLanguage, apiKey) {
  const target = getTargetCodes(targetLanguage);
  const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: texts, target: target.google, format: 'text' })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error?.message || `Google çeviri isteği başarısız (${response.status}).`;
    throw makeError(message, response.status);
  }
  const translations = Array.isArray(data?.data?.translations) ? data.data.translations : [];
  if (translations.length !== texts.length) throw makeError('Google beklenmeyen sayıda çeviri döndürdü.');
  return translations.map(item => decodeHtmlEntities(item?.translatedText || ''));
}

async function translateBatch(batch, targetLanguage, settings, usage) {
  let lastError = null;
  for (const provider of PROVIDER_ORDER) {
    const key = provider === 'deepl' ? settings.deeplKey : settings.googleKey;
    if (!key) continue;
    const remaining = TRANSLATION_CHAR_LIMIT - usage[provider].usedChars;
    if (remaining < batch.charCount) continue;
    try {
      const translatedTexts = provider === 'deepl'
        ? await translateWithDeepL(batch.items.map(item => item.text), targetLanguage, key)
        : await translateWithGoogle(batch.items.map(item => item.text), targetLanguage, key);
      usage[provider].usedChars += batch.charCount;
      return { provider, translatedTexts };
    } catch (error) {
      lastError = error;
      if (isQuotaError(error)) usage[provider].usedChars = TRANSLATION_CHAR_LIMIT;
    }
  }
  if (lastError) throw lastError;
  throw makeError('Harici çeviri için kullanılabilir API anahtarı bulunamadı.');
}

async function translateTexts(texts, targetLanguage) {
  const { settings, usage } = await getConfig();
  if (!settings.deeplKey && !settings.googleKey) {
    throw makeError('Harici çeviri için DeepL veya Google Cloud API anahtarı girin.');
  }
  const batches = buildBatches(texts);
  const translated = new Array(texts.length);
  const providersUsed = [];
  for (const batch of batches) {
    const result = await translateBatch(batch, targetLanguage, settings, usage);
    providersUsed.push(result.provider);
    batch.items.forEach((item, index) => {
      translated[item.index] = result.translatedTexts[index];
    });
  }
  await saveUsage(usage);
  return {
    texts: translated,
    providersUsed: [...new Set(providersUsed)],
    usage
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'yth-get-translation-settings') {
    void getConfig().then(({ settings, usage }) => sendResponse({ ok: true, settings, usage, charLimit: TRANSLATION_CHAR_LIMIT }));
    return true;
  }
  if (message?.type === 'yth-save-translation-settings') {
    void saveSettings(message.settings || {})
      .then(async settings => {
        const { usage } = await getConfig();
        sendResponse({ ok: true, settings, usage, charLimit: TRANSLATION_CHAR_LIMIT });
      })
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'yth-reset-translation-usage') {
    void saveUsage({ deepl: { usedChars: 0 }, google: { usedChars: 0 } })
      .then(async () => {
        const { settings, usage } = await getConfig();
        sendResponse({ ok: true, settings, usage, charLimit: TRANSLATION_CHAR_LIMIT });
      })
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'yth-translate-cues') {
    void translateTexts(Array.isArray(message.texts) ? message.texts : [], message.targetLanguage)
      .then(result => sendResponse({
        ok: true,
        texts: result.texts,
        providersUsed: result.providersUsed.map(providerName),
        usage: result.usage,
        charLimit: TRANSLATION_CHAR_LIMIT
      }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});
