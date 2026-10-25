(() => {
  const source = 'yth-page-bridge';
  let lastVideoAndTracks = '';
  let publishedVideoId = '';
  let publishTimer = null;
  const ANDROID_INNERTUBE_CONTEXT = { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } };
  function getPlayerResponse() {
    try {
      const playerResponse = document.getElementById('movie_player')?.getPlayerResponse?.();
      if (playerResponse?.captions) return playerResponse;
    } catch {}
    if (window.ytInitialPlayerResponse) return window.ytInitialPlayerResponse;
    const raw = window.ytplayer?.config?.args?.player_response;
    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
    return raw || null;
  }
  const currentVideoId = () => new URL(location.href).searchParams.get('v') || '';
  function getInnertubeApiKey() {
    return window.ytcfg?.get?.('INNERTUBE_API_KEY') || window.ytcfg?.data_?.INNERTUBE_API_KEY || '';
  }
  async function fetchPlayerResponseFromInnertube(videoId) {
    const apiKey = getInnertubeApiKey();
    if (!apiKey || !videoId) return null;
    try {
      const response = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ context: ANDROID_INNERTUBE_CONTEXT, videoId })
      });
      if (!response.ok) return null;
      const body = (await response.text()).replace(/^\)\]\}'\s*/, '');
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  async function publishTracks(force = false) {
    const videoId = currentVideoId();
    if (!videoId) return;
    const response = await fetchPlayerResponseFromInnertube(videoId) || getPlayerResponse();
    const playerVideoId = response?.videoDetails?.videoId;
    if (playerVideoId && playerVideoId !== videoId) return;
    const captions = response?.captions?.playerCaptionsTracklistRenderer;
    const tracks = captions?.captionTracks;
    if (!Array.isArray(tracks) || !tracks.length) return;
    const translations = Array.isArray(captions?.translationLanguages) ? captions.translationLanguages : [];
    const defaultLanguage = response?.microformat?.playerMicroformatRenderer?.defaultLanguage || response?.videoDetails?.defaultLanguage || '';
    const defaultAudioTrack = captions?.audioTracks?.[captions.defaultAudioTrackIndex];
    const defaultTrackIndex = Number.isInteger(defaultAudioTrack?.defaultCaptionTrackIndex) ? defaultAudioTrack.defaultCaptionTrackIndex : -1;
    const preferredTrackIndices = Array.isArray(defaultAudioTrack?.captionTrackIndices) ? defaultAudioTrack.captionTrackIndices : [];
    const safeTracks = Array.isArray(tracks) ? tracks : [];
    const key = `${videoId}:${safeTracks.map(track => `${track.languageCode}:${track.kind || ''}`).join(',')}:${translations.map(language => language.languageCode).join(',')}`;
    if (!force && key === lastVideoAndTracks) return;
    lastVideoAndTracks = key;
    window.postMessage({
      source,
      type: 'caption-tracks',
      videoId,
      defaultLanguage,
      defaultTrackIndex,
      preferredTrackIndices,
      translations: translations.map(language => ({ languageCode: language.languageCode, languageName: { simpleText: language.languageName?.simpleText || language.languageCode } })),
      tracks: safeTracks.map(track => ({
        baseUrl: new URL(String(track.baseUrl || '').replace('&fmt=srv3', ''), location.origin).toString(),
        languageCode: track.languageCode,
        kind: track.kind || '',
        name: { simpleText: track.name?.simpleText || track.languageCode }
      }))
    }, '*');
    publishedVideoId = videoId;
  }
  function validCaptionUrl(value) {
    try {
      const url = new URL(value);
      const videoId = new URL(location.href).searchParams.get('v') || '';
      return /(^|\.)youtube\.com$/i.test(url.hostname) && url.pathname === '/api/timedtext' && url.searchParams.get('v') === videoId;
    } catch { return false; }
  }
  async function fetchCaption(requestId, baseUrl, language) {
    if (!validCaptionUrl(baseUrl)) {
      window.postMessage({ source, type: 'caption-response', requestId, error: 'Altyazı adresi geçersiz.' }, '*');
      return;
    }
    const url = new URL(baseUrl);
    if (language) url.searchParams.set('tlang', language);
    let failure = '';
    for (const format of ['json3', 'srv3', '']) {
      const candidate = new URL(url);
      if (format) candidate.searchParams.set('fmt', format);
      else candidate.searchParams.delete('fmt');
      try {
        const response = await fetch(candidate.toString(), { credentials: 'include', headers: { Accept: 'application/json,text/xml,*/*' } });
        const body = await response.text();
        if (response.ok && body.trim()) {
          window.postMessage({ source, type: 'caption-response', requestId, body }, '*');
          return;
        }
        failure = response.ok
          ? 'YouTube altyazı isteğine boş yanıt verdi. Bu ağda altyazı metni erişimi engellenmiş görünüyor.'
          : `Altyazı isteği başarısız (${response.status}).`;
      } catch (error) { failure = error?.message || 'Altyazı isteği başarısız.'; }
    }
    window.postMessage({ source, type: 'caption-response', requestId, error: failure || 'YouTube boş bir altyazı yanıtı döndürdü.' }, '*');
  }
  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== 'yth-extension') return;
    if (event.data.type === 'request-caption-tracks') void publishTracks(true);
    if (event.data.type === 'fetch-caption') fetchCaption(event.data.requestId, event.data.baseUrl, event.data.language || '');
  });
  function startPublishing(maxAttempts = 20) {
    clearInterval(publishTimer);
    let attempts = 0;
    publishTimer = setInterval(() => {
      void publishTracks();
      if (publishedVideoId === currentVideoId() || ++attempts >= maxAttempts) { clearInterval(publishTimer); publishTimer = null; }
    }, 500);
  }
  document.addEventListener('yt-navigate-finish', () => { lastVideoAndTracks = ''; publishedVideoId = ''; setTimeout(() => { void publishTracks(); }, 100); startPublishing(); });
  void publishTracks();
  startPublishing();
})();
