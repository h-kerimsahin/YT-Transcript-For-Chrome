(() => {
  const ID = 'yth-transcript-helper';
  const EXTERNAL_LANGUAGES = [
    { code: 'ar', label: 'Arapça' },
    { code: 'bg', label: 'Bulgarca' },
    { code: 'cs', label: 'Çekçe' },
    { code: 'da', label: 'Danca' },
    { code: 'de', label: 'Almanca' },
    { code: 'el', label: 'Yunanca' },
    { code: 'en', label: 'İngilizce' },
    { code: 'es', label: 'İspanyolca' },
    { code: 'et', label: 'Estonca' },
    { code: 'fi', label: 'Fince' },
    { code: 'fr', label: 'Fransızca' },
    { code: 'hu', label: 'Macarca' },
    { code: 'id', label: 'Endonezce' },
    { code: 'it', label: 'İtalyanca' },
    { code: 'ja', label: 'Japonca' },
    { code: 'ko', label: 'Korece' },
    { code: 'lt', label: 'Litvanca' },
    { code: 'lv', label: 'Letonca' },
    { code: 'nb', label: 'Norveççe' },
    { code: 'nl', label: 'Hollandaca' },
    { code: 'pl', label: 'Lehçe' },
    { code: 'pt', label: 'Portekizce' },
    { code: 'ro', label: 'Romence' },
    { code: 'ru', label: 'Rusça' },
    { code: 'sk', label: 'Slovakça' },
    { code: 'sl', label: 'Slovence' },
    { code: 'sv', label: 'İsveççe' },
    { code: 'tr', label: 'Türkçe' },
    { code: 'uk', label: 'Ukraynaca' },
    { code: 'zh', label: 'Çince' }
  ];

  let root, currentVideo = '', observedVideo = '', cues = [], title = '', tracks = [], translations = [], defaultLanguage = '', defaultTrackIndex = -1, preferredTrackIndices = [], tracksFailed = false, pendingLanguage = '';
  let trigger = null;
  let translationConfig = {
    settings: { deeplKey: '', googleKey: '' },
    usage: { deepl: { usedChars: 0 }, google: { usedChars: 0 } },
    charLimit: 500000
  };
  const state = { timestamps: true, format: 'txt', trackIndex: null, translatedLanguage: '', externalLanguage: '' };

  const getVideoId = () => new URL(location.href).searchParams.get('v') || '';
  const getTitle = () => document.querySelector('h1 yt-formatted-string')?.textContent?.trim() || document.title.replace(/ - YouTube$/, '').trim() || 'YouTube transkripti';
  const safeName = s => s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().slice(0, 100) || 'youtube-transcript';
  const fmtTime = seconds => {
    const n = Math.floor(Number(seconds) || 0);
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    const s = n % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  };
  const plain = () => cues.map(c => `${state.timestamps ? `[${fmtTime(c.start)}] ` : ''}${c.text}`).join('\n');
  const output = () => {
    const body = plain();
    if (state.format === 'md') return `# ${title}\n\n${body}\n`;
    return `${title}\n${'='.repeat(Math.min(title.length, 72))}\n\n${body}\n`;
  };

  function setStatus(message) {
    if (root) root.querySelector('.yth-status').textContent = message;
  }

  function refreshPreview() {
    if (!root) return;
    const preview = root.querySelector('.yth-preview');
    preview.textContent = cues.length ? plain() : 'Transkript henüz yüklenmedi.';
    root.querySelector('.yth-export').disabled = !cues.length;
    root.querySelector('.yth-copy').disabled = !cues.length;
    root.querySelector('.yth-status').textContent = cues.length ? `${cues.length} satır hazır` : 'Transkript yükleniyor…';
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || 'Uzantı isteği başarısız oldu.'));
          return;
        }
        resolve(response);
      });
    });
  }

  function formatUsage(provider, usedChars) {
    const label = provider === 'deepl' ? 'DeepL' : 'Google';
    return `${label}: ${usedChars}/${translationConfig.charLimit}`;
  }

  function renderTranslationUsage() {
    if (!root) return;
    const usageNode = root.querySelector('.yth-usage');
    const deepl = translationConfig.usage?.deepl?.usedChars || 0;
    const google = translationConfig.usage?.google?.usedChars || 0;
    usageNode.textContent = `${formatUsage('deepl', deepl)} · ${formatUsage('google', google)}`;
  }

  function renderTranslationSettings() {
    if (!root) return;
    root.querySelector('.yth-deepl-key').value = translationConfig.settings?.deeplKey || '';
    root.querySelector('.yth-google-key').value = translationConfig.settings?.googleKey || '';
    renderTranslationUsage();
  }

  async function loadTranslationConfig() {
    translationConfig = await sendRuntimeMessage({ type: 'yth-get-translation-settings' });
    renderTranslationSettings();
  }

  async function saveTranslationSettings() {
    const deeplKey = root.querySelector('.yth-deepl-key').value.trim();
    const googleKey = root.querySelector('.yth-google-key').value.trim();
    translationConfig = await sendRuntimeMessage({ type: 'yth-save-translation-settings', settings: { deeplKey, googleKey } });
    renderTranslationSettings();
    setStatus('Çeviri API ayarları kaydedildi.');
  }

  async function resetTranslationUsage() {
    translationConfig = await sendRuntimeMessage({ type: 'yth-reset-translation-usage' });
    renderTranslationSettings();
    setStatus('Çeviri karakter sayaçları sıfırlandı.');
  }

  function renderExternalLanguageOptions() {
    if (!root) return;
    const select = root.querySelector('.yth-external-language');
    select.replaceChildren();
    const off = document.createElement('option');
    off.value = '';
    off.textContent = 'Kapalı';
    select.append(off);
    EXTERNAL_LANGUAGES.forEach(language => {
      const option = document.createElement('option');
      option.value = language.code;
      option.textContent = language.label;
      select.append(option);
    });
    select.value = state.externalLanguage;
  }

  function chooseDefaultTrack() {
    if (!tracks.length) return -1;
    if (defaultTrackIndex >= 0 && tracks[defaultTrackIndex]) return defaultTrackIndex;
    if (defaultLanguage) {
      const native = tracks.findIndex(t => (t.languageCode || '').toLowerCase() === defaultLanguage.toLowerCase());
      if (native >= 0) return native;
      const base = defaultLanguage.toLowerCase().split('-')[0];
      const sameLanguage = tracks.findIndex(t => (t.languageCode || '').toLowerCase().split('-')[0] === base);
      if (sameLanguage >= 0) return sameLanguage;
    }
    const audioTrackCaption = preferredTrackIndices.find(index => tracks[index]);
    if (audioTrackCaption != null) {
      const preferred = preferredTrackIndices.find(index => tracks[index]?.kind !== 'asr');
      return preferred ?? audioTrackCaption;
    }
    const creatorCaption = tracks.findIndex(t => t.kind !== 'asr');
    return creatorCaption >= 0 ? creatorCaption : 0;
  }

  function renderLanguageOptions(chooseDefault = false) {
    if (!root) return;
    const select = root.querySelector('.yth-language');
    if (!tracks.length) {
      select.replaceChildren();
      const option = document.createElement('option');
      option.value = '';
      option.textContent = tracksFailed ? 'Altyazı dili bulunamadı' : 'Diller yükleniyor…';
      select.append(option);
      select.disabled = tracksFailed;
      return;
    }
    select.disabled = false;
    if (chooseDefault || state.trackIndex == null || state.trackIndex >= tracks.length) state.trackIndex = chooseDefaultTrack();
    select.replaceChildren();
    tracks.forEach((track, index) => {
      const name = track.name?.simpleText || track.languageCode || `Dil ${index + 1}`;
      const option = document.createElement('option');
      option.value = `track:${index}`;
      option.textContent = `${name}${track.kind === 'asr' ? ' · otomatik' : ''}`;
      select.append(option);
    });
    translations.forEach(language => {
      const option = document.createElement('option');
      option.value = `translate:${language.languageCode}`;
      option.textContent = `${language.languageName?.simpleText || language.languageCode} · çevrilmiş`;
      select.append(option);
    });
    select.value = state.translatedLanguage ? `translate:${state.translatedLanguage}` : `track:${state.trackIndex}`;
  }

  let tracksWait = null;
  let captionRequestNumber = 0;
  const captionRequests = new Map();

  const sameVideoUrl = (baseUrl, videoId) => {
    try {
      return new URL(baseUrl).searchParams.get('v') === videoId;
    } catch {
      return false;
    }
  };

  function settleTracksWait() {
    if (!tracksWait) return;
    clearTimeout(tracksWait.timer);
    const { resolve } = tracksWait;
    tracksWait = null;
    resolve();
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== 'yth-page-bridge') return;
    if (event.data?.type === 'caption-response') {
      const pending = captionRequests.get(event.data.requestId);
      if (!pending) return;
      captionRequests.delete(event.data.requestId);
      if (event.data.error) pending.reject(new Error(event.data.error));
      else pending.resolve(event.data.body || '');
      return;
    }
    if (event.data?.type !== 'caption-tracks') return;
    if (event.data.videoId !== getVideoId() || !Array.isArray(event.data.tracks)) return;
    const videoId = getVideoId();
    tracks = event.data.tracks.filter(track => typeof track.baseUrl === 'string' && sameVideoUrl(track.baseUrl, videoId));
    if (!tracks.length) {
      tracksFailed = true;
      renderLanguageOptions();
      settleTracksWait();
      return;
    }
    tracksFailed = false;
    translations = Array.isArray(event.data.translations) ? event.data.translations : [];
    preferredTrackIndices = Array.isArray(event.data.preferredTrackIndices) ? event.data.preferredTrackIndices : [];
    defaultLanguage = typeof event.data.defaultLanguage === 'string' ? event.data.defaultLanguage : '';
    defaultTrackIndex = Number.isInteger(event.data.defaultTrackIndex) ? event.data.defaultTrackIndex : -1;
    if (pendingLanguage) {
      const matching = tracks.findIndex(track => track.languageCode === pendingLanguage);
      if (matching >= 0) state.trackIndex = matching;
      pendingLanguage = '';
    }
    if (root) renderLanguageOptions(state.trackIndex == null);
    settleTracksWait();
  });

  function waitForTracks(force = false) {
    if (tracks.length && !force) return Promise.resolve();
    settleTracksWait();
    return new Promise(resolve => {
      tracksWait = {
        resolve,
        timer: setTimeout(() => {
          tracksWait = null;
          tracksFailed = true;
          renderLanguageOptions();
          resolve();
        }, 1200)
      };
      window.postMessage({ source: 'yth-extension', type: 'request-caption-tracks', videoId: getVideoId() }, '*');
    });
  }

  function parseCaptionResponse(body) {
    const source = body.trim().replace(/^\)\]\}'\s*/, '');
    if (source.startsWith('{')) {
      const data = JSON.parse(source);
      return (data.events || []).map(event => ({
        start: Number(event.tStartMs || 0) / 1000,
        text: (event.segs || []).map(segment => segment.utf8 || '').join('').replace(/\s+/g, ' ').trim()
      })).filter(cue => cue.text);
    }
    const doc = new DOMParser().parseFromString(source, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('YouTube farklı bir altyazı biçimi döndürdü.');
    const nodes = [...doc.querySelectorAll('p')].length ? [...doc.querySelectorAll('p')] : [...doc.querySelectorAll('text')];
    return nodes.map(node => ({
      start: node.getAttribute('t') != null ? Number(node.getAttribute('t')) / 1000 : Number(node.getAttribute('start') || 0),
      text: (node.textContent || '').replace(/\s+/g, ' ').trim()
    })).filter(cue => cue.text);
  }

  function fetchCaptionFromPage(baseUrl, language = '') {
    const requestId = `${getVideoId()}-${Date.now()}-${++captionRequestNumber}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!captionRequests.has(requestId)) return;
        captionRequests.delete(requestId);
        reject(new Error('YouTube altyazı isteği zaman aşımına uğradı.'));
      }, 8000);
      captionRequests.set(requestId, {
        resolve: body => {
          clearTimeout(timeout);
          resolve(body);
        },
        reject: error => {
          clearTimeout(timeout);
          reject(error);
        }
      });
      window.postMessage({ source: 'yth-extension', type: 'fetch-caption', requestId, baseUrl, language }, '*');
    });
  }

  function describeTranslationProvider(providersUsed) {
    if (!providersUsed?.length) return 'Harici çeviri hazır.';
    return `Harici çeviri hazır · ${providersUsed.join(' + ')}`;
  }

  async function applyExternalTranslation() {
    if (!state.externalLanguage) return '';
    const response = await sendRuntimeMessage({
      type: 'yth-translate-cues',
      targetLanguage: state.externalLanguage,
      texts: cues.map(cue => cue.text)
    });
    cues = cues.map((cue, index) => ({ ...cue, text: response.texts[index] || cue.text }));
    translationConfig = {
      settings: translationConfig.settings,
      usage: response.usage,
      charLimit: response.charLimit || translationConfig.charLimit
    };
    renderTranslationSettings();
    return describeTranslationProvider(response.providersUsed);
  }

  async function loadTranscript(forceTracks = false) {
    await waitForTracks(forceTracks);
    if (!tracks.length) throw new Error('YouTube altyazı bilgisi alınamadı. Sayfayı yenileyip tekrar deneyin.');
    let lastError;
    if (state.trackIndex == null || state.trackIndex >= tracks.length) state.trackIndex = chooseDefaultTrack();
    renderLanguageOptions();
    const selected = tracks[state.trackIndex];
    const url = new URL(selected.baseUrl);
    if (!/(^|\.)youtube\.com$/i.test(url.hostname) || url.pathname !== '/api/timedtext' || url.searchParams.get('v') !== getVideoId()) {
      throw new Error('YouTube altyazı adresi geçersiz.');
    }
    if (state.translatedLanguage) url.searchParams.set('tlang', state.translatedLanguage);
    try {
      const body = await fetchCaptionFromPage(url.toString(), state.translatedLanguage);
      cues = parseCaptionResponse(body);
      if (!cues.length) lastError = new Error('YouTube boş bir altyazı yanıtı döndürdü.');
    } catch (error) {
      lastError = error;
    }
    if (!cues.length) throw new Error(lastError?.message || 'YouTube bu video için transkript metni döndürmedi.');
    let translationStatus = '';
    if (state.externalLanguage) {
      setStatus('Harici çeviri hazırlanıyor…');
      translationStatus = await applyExternalTranslation();
    }
    title = getTitle();
    refreshPreview();
    if (translationStatus) setStatus(translationStatus);
  }

  function buildPanel() {
    if (root) return;
    const logoUrl = chrome.runtime.getURL('branding/logo.jpg');
    root = document.createElement('section');
    root.id = ID;
    root.className = 'yth-panel';
    root.hidden = true;
    root.innerHTML = `<div class="yth-head"><div><strong>Transkript</strong><span class="yth-status">Hazırlanıyor…</span></div><button class="yth-close" aria-label="Kapat">×</button></div>
      <div class="yth-toolbar"><button class="yth-refresh" type="button">Yenile</button><button class="yth-translate-toggle" type="button" aria-expanded="false">Çeviri Yap</button><label class="yth-field">Dil<select class="yth-language"><option value="">Diller yükleniyor…</option></select></label></div>
      <div class="yth-translation-panel" hidden><div class="yth-subtoolbar"><label class="yth-field yth-field-wide">Harici çeviri<select class="yth-external-language"><option value="">Kapalı</option></select></label><button class="yth-settings-toggle" type="button">API ayarları</button></div>
      <div class="yth-settings" hidden><label class="yth-settings-field"><span>DeepL API Key</span><input class="yth-deepl-key" type="password" placeholder="DeepL Free API anahtarını girin"></label><label class="yth-settings-field"><span>Google Cloud API Key</span><input class="yth-google-key" type="password" placeholder="Google Cloud Translation API anahtarını girin"></label><div class="yth-settings-actions"><button class="yth-save-settings" type="button">Ayarları kaydet</button><button class="yth-reset-usage" type="button">Sayaçları sıfırla</button></div><div class="yth-usage">DeepL: 0/500000 · Google: 0/500000</div></div></div>
      <label class="yth-check"><input class="yth-timestamps" type="checkbox" checked><span>Zaman kodlarını ekle</span></label>
      <div class="yth-preview" aria-live="polite">Transkript yükleniyor…</div>
      <div class="yth-actions"><button class="yth-copy">Metni kopyala</button><select class="yth-format" aria-label="Dosya biçimi"><option value="txt">TXT</option><option value="md">Markdown</option></select><button class="yth-export">Dosyayı indir</button></div>
      <div class="yth-note">Önce YouTube altyazıları kullanılır. Harici çeviri açıksa DeepL kotası dolduğunda Google Cloud devreye girer.</div>
      <div class="yth-meta"><img src="${logoUrl}" alt="KRMSHN logo" height="20"></div>`;
    document.body.append(root);
    root.querySelector('.yth-close').onclick = () => { root.hidden = true; };
    root.querySelector('.yth-refresh').onclick = () => refreshTranscript();
    root.querySelector('.yth-timestamps').onchange = event => {
      state.timestamps = event.target.checked;
      refreshPreview();
    };
    root.querySelector('.yth-language').onchange = async event => {
      const value = event.target.value;
      if (value.startsWith('translate:')) {
        state.translatedLanguage = value.slice('translate:'.length);
      } else {
        state.trackIndex = Number(value.slice('track:'.length));
        state.translatedLanguage = '';
      }
      cues = [];
      refreshPreview();
      await guardedLoad();
    };
    root.querySelector('.yth-external-language').onchange = async event => {
      state.externalLanguage = event.target.value;
      cues = [];
      refreshPreview();
      await guardedLoad();
    };
    root.querySelector('.yth-translate-toggle').onclick = async event => {
      const toggle = event.currentTarget;
      const translationPanel = root.querySelector('.yth-translation-panel');
      const settingsPanel = root.querySelector('.yth-settings');
      const willShow = translationPanel.hidden;
      translationPanel.hidden = !willShow;
      if (!willShow) settingsPanel.hidden = true;
      toggle.setAttribute('aria-expanded', String(willShow));
      toggle.classList.toggle('is-active', willShow);
      if (willShow) await loadTranslationConfig();
      if (trigger?.isConnected && !root.hidden) positionPanel(trigger);
    };
    root.querySelector('.yth-settings-toggle').onclick = async () => {
      const settingsPanel = root.querySelector('.yth-settings');
      settingsPanel.hidden = !settingsPanel.hidden;
      if (!settingsPanel.hidden) await loadTranslationConfig();
      if (trigger?.isConnected && !root.hidden) positionPanel(trigger);
    };
    root.querySelector('.yth-save-settings').onclick = () => {
      saveTranslationSettings().catch(error => setStatus(error.message));
    };
    root.querySelector('.yth-reset-usage').onclick = () => {
      resetTranslationUsage().catch(error => setStatus(error.message));
    };
    root.querySelector('.yth-format').onchange = event => { state.format = event.target.value; };
    root.querySelector('.yth-copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(plain());
        setStatus('Panoya kopyalandı');
      } catch {
        setStatus('Kopyalama engellendi; tarayıcı izinlerini kontrol edin.');
      }
    };
    root.querySelector('.yth-export').onclick = () => {
      const ext = state.format === 'md' ? 'md' : 'txt';
      const blob = new Blob([output()], { type: ext === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' });
      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(blob);
      anchor.download = `${safeName(title)}.${ext}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
    };
    renderExternalLanguageOptions();
    void loadTranslationConfig().catch(() => {});
  }

  async function guardedLoad(forceTracks = false) {
    setStatus('Transkript yükleniyor…');
    try {
      await loadTranscript(forceTracks);
    } catch (error) {
      refreshPreview();
      setStatus(error.message);
    }
  }

  async function refreshTranscript() {
    pendingLanguage = tracks[state.trackIndex]?.languageCode || '';
    tracks = [];
    translations = [];
    defaultLanguage = '';
    defaultTrackIndex = -1;
    preferredTrackIndices = [];
    tracksFailed = false;
    state.trackIndex = null;
    cues = [];
    renderLanguageOptions();
    refreshPreview();
    await guardedLoad(true);
  }

  function positionPanel(button) {
    const rect = button.getBoundingClientRect();
    const panelWidth = Math.min(root.offsetWidth || 380, window.innerWidth - 24);
    const panelHeight = Math.min(root.offsetHeight || 420, window.innerHeight - 24);
    const minTop = window.scrollY + 12;
    const preferredTop = window.scrollY + rect.top - panelHeight - 12;
    const fallbackTop = Math.min(window.scrollY + rect.bottom + 8, window.scrollY + window.innerHeight - panelHeight - 12);
    const top = preferredTop >= minTop ? preferredTop : Math.max(minTop, fallbackTop);
    const left = Math.max(12, Math.min(window.scrollX + rect.right - panelWidth, window.scrollX + window.innerWidth - panelWidth - 12));
    root.style.top = `${top}px`;
    root.style.left = `${left}px`;
  }

  function installButton() {
    if (!getVideoId()) return;
    if (trigger?.isConnected) return;
    if (!document.querySelector('#movie_player') || !document.querySelector('h1 yt-formatted-string')) return;
    buildPanel();
    const button = document.createElement('button');
    button.className = 'yth-trigger yth-trigger-floating';
    button.type = 'button';
    button.innerHTML = '<span aria-hidden="true">▤</span><span>Transkript</span>';
    button.title = 'Transkripti kopyala veya indir';
    button.onclick = async event => {
      event.preventDefault();
      event.stopPropagation();
      const wasHidden = root.hidden;
      root.hidden = !wasHidden;
      if (!root.hidden) {
        positionPanel(button);
        if (currentVideo !== getVideoId() || !cues.length) {
          currentVideo = getVideoId();
          title = getTitle();
          await guardedLoad();
        }
      }
    };
    document.body.append(button);
    trigger = button;
  }

  function resetForNavigation() {
    const videoId = getVideoId();
    if (videoId === observedVideo) return;
    observedVideo = videoId;
    currentVideo = '';
    tracks = [];
    translations = [];
    defaultLanguage = '';
    defaultTrackIndex = -1;
    preferredTrackIndices = [];
    tracksFailed = false;
    pendingLanguage = '';
    state.trackIndex = null;
    state.translatedLanguage = '';
    cues = [];
    if (root) {
      root.hidden = true;
      renderLanguageOptions(true);
      renderExternalLanguageOptions();
    }
  }

  let syncScheduled = false;
  const syncPanel = () => {
    if (syncScheduled) return;
    syncScheduled = true;
    requestAnimationFrame(() => {
      syncScheduled = false;
      resetForNavigation();
      installButton();
    });
  };

  observedVideo = getVideoId();
  const observer = new MutationObserver(syncPanel);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('pointerdown', event => {
    if (!root || root.hidden) return;
    const target = event.target;
    if (root.contains(target)) return;
    if (trigger?.contains(target)) return;
    root.hidden = true;
  }, true);

  document.addEventListener('yt-navigate-finish', () => {
    resetForNavigation();
    installButton();
    window.postMessage({ source: 'yth-extension', type: 'request-caption-tracks', videoId: getVideoId() }, '*');
  });

  installButton();
})();
