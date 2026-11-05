(() => {
'use strict';

const YT_EQ_VERSION = '1.3.0-beta';
const isYTMusic = window.location.hostname === 'music.youtube.com';

// --- Extension Storage Bridge (runs only in ISOLATED content-script world) ---
const extApi = (typeof browser !== 'undefined' && browser?.storage?.local)
    ? browser
    : ((typeof chrome !== 'undefined' && chrome?.storage?.local) ? chrome : null);

if (extApi) {
    if (window.__YT_EQ_BRIDGE_VERSION__ === YT_EQ_VERSION) return;
    window.__YT_EQ_BRIDGE_VERSION__ = YT_EQ_VERSION;

    const STORAGE_KEY = 'yt-eq-settings';
    let lastSentJson = '';

    const pushToMain = (dataObj) => {
        try {
            const json = dataObj ? JSON.stringify(dataObj) : '';
            lastSentJson = json;
            window.dispatchEvent(new CustomEvent('yt-eq-storage-loaded', { detail: json }));
        } catch (e) {}
    };

    const loadFromExtStorage = () => {
        try {
            extApi.storage.local.get(STORAGE_KEY, (res) => {
                if (extApi.runtime?.lastError) return;
                pushToMain(res ? res[STORAGE_KEY] : null);
            });
        } catch (e) {}
    };

    window.addEventListener('yt-eq-storage-request', loadFromExtStorage);

    window.addEventListener('yt-eq-storage-save', (e) => {
        if (typeof e.detail !== 'string' || !e.detail) return;
        try {
            const parsed = JSON.parse(e.detail);
            if (parsed && typeof parsed === 'object') {
                lastSentJson = e.detail;
                extApi.storage.local.set({ [STORAGE_KEY]: parsed });
            }
        } catch (err) {}
    });

    if (extApi.storage.onChanged) {
        extApi.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes[STORAGE_KEY]?.newValue) {
                try {
                    const json = JSON.stringify(changes[STORAGE_KEY].newValue);
                    if (json !== lastSentJson) {
                        pushToMain(changes[STORAGE_KEY].newValue);
                    }
                } catch (err) {}
            }
        });
    }

    try {
        if (extApi.i18n?.getUILanguage) {
            document.documentElement.dataset.ytEqExtLang = extApi.i18n.getUILanguage();
        }
    } catch (e) {}

    return;
}

// --- Main World Audio & UI Controller ---
// Prevent duplicate execution of the exact same version instance
if (window.__YT_EQ_RUNNING_VERSION__ === YT_EQ_VERSION) {
    if (typeof window.__YT_EQ_SYNC__ === 'function') {
        window.__YT_EQ_SYNC__();
    }
    return;
}
window.__YT_EQ_RUNNING_VERSION__ = YT_EQ_VERSION;
window.__YT_EQ_INITIALIZED__ = true;

// Audio Context state
let ytEqAudioCtx = window.__YT_EQ_AUDIO_CTX__ || null;
let audioGraphCtx = null;
let sourceNode = null;
let preampNode = null;
let normalizerNode = null;
let limiterNode = null;
let filterNodes = [];
let analyserNode = null;
let currentVideoElement = null;
let lastLoudnessDb = 0;
let startVisualizer = () => {};
let stopVisualizer = () => {};
let currentView = 'eq';
let switchView = () => {};
let refreshUIFromSettings = () => {};

// EQ Configuration
const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const EQ_BANDS_LABELS = ['32Hz', '64Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'];

const I18N_FALLBACK = {
    en: {
        title: 'Equalizer', preamp: 'Preamp', low: 'Low', mid: 'Mid', high: 'High',
        normalizerOff: 'Normalizer Disabled', normalizerOn: 'Normalizer Enabled',
        limiter: 'Limiter (Anti-clip)', reset: 'Reset', tooltip: 'Equalizer',
        modeBasic: '3-Band', modePro: '10-Band',
        preset: 'Preset', save: 'Save', customNamePrompt: 'Enter preset name:',
        presetFlat: 'Flat', presetBassBoost: 'Bass Boost', presetVocal: 'Vocal Clarity',
        presetCinematic: 'Cinematic', presetPodcast: 'Podcast',
        customPresetsGroup: 'Custom Presets', defaultPresetsGroup: 'Default Presets',
        deleteTitle: 'Delete Preset', deleteConfirm: 'Are you sure you want to delete this preset?',
        customUnsaved: 'Custom (Unsaved)',
        enterValue: 'Click to edit (5 = set, +2 / -2 = adjust, =-4 = set negative, wheel/arrows = fine tune)',
        spectrumAnalyzer: 'Spectrum Analyzer'
    },
    ja: {
        title: 'イコライザー', preamp: 'プリアンプ', low: '低音', mid: '中音', high: '高音',
        normalizerOff: 'ノーマライザー無効', normalizerOn: 'ノーマライザー有効',
        limiter: '音割れ防止 (Limiter)', reset: 'リセット', tooltip: 'イコライザー',
        modeBasic: '3-Band', modePro: '10-Band',
        preset: 'プリセット', save: '保存', customNamePrompt: 'プリセット名を入力してください:',
        presetFlat: 'フラット', presetBassBoost: '低音ブースト', presetVocal: 'ボーカル強調',
        presetCinematic: 'シネマティック', presetPodcast: 'ポッドキャスト',
        customPresetsGroup: 'カスタムプリセット', defaultPresetsGroup: 'デフォルトプリセット',
        deleteTitle: 'プリセットの削除', deleteConfirm: 'このプリセットを削除してもよろしいですか？',
        customUnsaved: 'カスタム',
        enterValue: 'クリックで直接入力（5 = 指定値 / +2・-2 = 増減 / =-4 = マイナス値を指定 / ホイール・矢印キーで微調整）',
        spectrumAnalyzer: 'スペクトラムアナライザー'
    },
    ko: {
        title: '이퀄라이저', preamp: '프리앰프', low: '저음', mid: '중음', high: '고음',
        normalizerOff: '노멀라이저 비활성화됨', normalizerOn: '노멀라이저 활성화됨',
        limiter: '클리핑 방지 (Limiter)', reset: '초기화', tooltip: '이퀄라이저',
        modeBasic: '3-Band', modePro: '10-Band',
        preset: '프리셋', save: '저장', customNamePrompt: '프리셋 이름을 입력하세요:',
        presetFlat: '플랫', presetBassBoost: '베이스 부스트', presetVocal: '보컬 강조',
        presetCinematic: '시네마틱', presetPodcast: '팟캐스트',
        customPresetsGroup: '사용자 지정 프리셋', defaultPresetsGroup: '기본 프리셋',
        deleteTitle: '프리셋 삭제', deleteConfirm: '이 프리셋을 삭제하시겠습니까?',
        customUnsaved: '사용자 지정',
        enterValue: '클릭하여 직접 입력 (5 = 값 지정, +2 / -2 = 증감, =-4 = 음수 지정, 휠/화살표 = 미세 조정)',
        spectrumAnalyzer: '스펙트럼 분석기'
    },
    ru: {
        title: 'Эквалайзер', preamp: 'Преамп', low: 'Низкие', mid: 'Средние', high: 'Высокие',
        normalizerOff: 'Нормализатор Отключен', normalizerOn: 'Нормализатор Включен',
        limiter: 'Лимитер (Антиклип)', reset: 'Сброс', tooltip: 'Эквалайзер',
        modeBasic: '3-Band', modePro: '10-Band',
        preset: 'Пресет', save: 'Сохранить', customNamePrompt: 'Введите имя пресета:',
        presetFlat: 'Плоский', presetBassBoost: 'Усиление басов', presetVocal: 'Четкость вокала',
        presetCinematic: 'Кинематографичный', presetPodcast: 'Подкаст',
        customPresetsGroup: 'Свои пресеты', defaultPresetsGroup: 'Стандартные',
        deleteTitle: 'Удалить Пресет', deleteConfirm: 'Вы уверены, что хотите удалить этот пресет?',
        customUnsaved: 'Свой',
        enterValue: 'Нажмите для ввода (5 = задать, +2 / -2 = изменить, =-4 = отрицательное, колесо/стрелки = точно)',
        spectrumAnalyzer: 'Спектральный анализатор'
    },
    zh: {
        title: '均衡器', preamp: '前置放大器', low: '低音', mid: '中音', high: '高音',
        normalizerOff: '音量标准化已禁用', normalizerOn: '音量标准化已启用',
        limiter: '防破音 (Limiter)', reset: '重置', tooltip: '均衡器',
        modeBasic: '3-Band', modePro: '10-Band',
        preset: '预设', save: '保存', customNamePrompt: '请输入预设名称：',
        presetFlat: '平坦', presetBassBoost: '低音增强', presetVocal: '人声增强',
        presetCinematic: '影院', presetPodcast: '播客',
        customPresetsGroup: '自定义预设', defaultPresetsGroup: '默认预设',
        deleteTitle: '删除预设', deleteConfirm: '您确定要删除此预设吗？',
        customUnsaved: '自定义',
        enterValue: '点击直接输入（5 = 设定值，+2 / -2 = 增减，=-4 = 设定负值，滚轮/方向键 = 微调）',
        spectrumAnalyzer: '频谱分析仪'
    }
};

const getMsg = (key) => {
    const ytLang = document.documentElement.lang || document.documentElement.dataset?.ytEqExtLang || '';
    const langHeader = (ytLang || navigator.language || '').toLowerCase();

    let targetLang = 'en';
    if (langHeader.startsWith('ja')) targetLang = 'ja';
    else if (langHeader.startsWith('ko')) targetLang = 'ko';
    else if (langHeader.startsWith('ru')) targetLang = 'ru';
    else if (langHeader.startsWith('zh')) targetLang = 'zh';

    return I18N_FALLBACK[targetLang]?.[key] || I18N_FALLBACK.en[key] || key;
};

// Default Settings
const DEFAULT_SETTINGS = {
    preamp: 0,
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    normalizerEnabled: true,
    limiterEnabled: true,
    mode: 'basic',
    activePreset: 'Flat',
    customPresets: []
};

const DEFAULT_PRESETS = [
    { id: 'Flat', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], preamp: 0 },
    { id: 'BassBoost', bands: [6, 5, 4, 1, 0, 0, 0, 0, 0, 0], preamp: -1 },
    { id: 'Vocal', bands: [0, 0, -1, -1, 2, 4, 3, 1, 0, 0], preamp: -1 },
    { id: 'Cinematic', bands: [5, 4, 2, 0, -1, -1, 1, 3, 4, 5], preamp: -2 },
    { id: 'Podcast', bands: [-2, -2, -1, 1, 3, 4, 3, 1, -1, -2], preamp: 0 }
];

let eqSettings = { ...DEFAULT_SETTINGS, bands: [...DEFAULT_SETTINGS.bands], customPresets: [] };

function sanitizeSettings(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const clamp = (n) => Number.isFinite(n) ? Math.max(-20, Math.min(20, Number(n))) : 0;
    const bands = Array.isArray(raw.bands) && raw.bands.length === 10
        ? raw.bands.map(clamp)
        : [...DEFAULT_SETTINGS.bands];
    const customPresets = Array.isArray(raw.customPresets)
        ? raw.customPresets
            .filter(p => p && typeof p.name === 'string' && p.name.trim() && Array.isArray(p.bands) && p.bands.length === 10)
            .map(p => ({
                name: p.name.trim(),
                preamp: clamp(p.preamp),
                bands: p.bands.map(clamp)
            }))
        : [];

    return {
        preamp: clamp(raw.preamp),
        bands,
        normalizerEnabled: typeof raw.normalizerEnabled === 'boolean' ? raw.normalizerEnabled : DEFAULT_SETTINGS.normalizerEnabled,
        limiterEnabled: typeof raw.limiterEnabled === 'boolean' ? raw.limiterEnabled : DEFAULT_SETTINGS.limiterEnabled,
        mode: raw.mode === 'pro' ? 'pro' : 'basic',
        activePreset: typeof raw.activePreset === 'string' && raw.activePreset ? raw.activePreset : 'Flat',
        customPresets
    };
}

let storageBridgeConnected = false;

// Load settings (fast local cache + cross-origin extension storage sync)
function loadSettings() {
    let localRaw = null;
    try {
        localRaw = localStorage.getItem('yt-eq-settings');
        if (localRaw) {
            const validated = sanitizeSettings(JSON.parse(localRaw));
            if (validated) eqSettings = validated;
        }
    } catch (e) {}

    if (!storageBridgeConnected) {
        storageBridgeConnected = true;
        window.addEventListener('yt-eq-storage-loaded', (e) => {
            if (typeof e.detail !== 'string') return;
            if (!e.detail) {
                // Extension storage is empty; migrate existing localStorage settings if present
                if (localRaw) {
                    try {
                        window.dispatchEvent(new CustomEvent('yt-eq-storage-save', { detail: JSON.stringify(eqSettings) }));
                    } catch (err) {}
                }
                return;
            }
            try {
                const validated = sanitizeSettings(JSON.parse(e.detail));
                if (!validated) return;
                eqSettings = validated;
                try {
                    localStorage.setItem('yt-eq-settings', JSON.stringify(eqSettings));
                } catch (err) {}
                applyEQSettingsToNodes();
                applyLimiterSettings();
                applyNormalizerGain();
                refreshUIFromSettings();
            } catch (err) {}
        });
    }

    try {
        window.dispatchEvent(new CustomEvent('yt-eq-storage-request'));
    } catch (e) {}
}

// Save settings to both local cache and cross-origin extension storage
function saveSettings() {
    const json = JSON.stringify(eqSettings);
    try {
        localStorage.setItem('yt-eq-settings', json);
    } catch (e) {}
    try {
        window.dispatchEvent(new CustomEvent('yt-eq-storage-save', { detail: json }));
    } catch (e) {}
}

function getVideoElement() {
    if (isYTMusic) {
        return document.querySelector('ytmusic-player video') ||
               document.querySelector('#movie_player video') ||
               document.querySelector('video.video-stream') ||
               document.querySelector('video');
    }

    // Prefer an actively playing video (handles SPA transitions between /watch and /shorts)
    const candidates = Array.from(document.querySelectorAll(
        '#movie_player video, #shorts-player video, .html5-video-player:not(#inline-preview-player) video, video.video-stream, video'
    ));
    const playingVideo = candidates.find(v => !v.paused && !v.ended && v.readyState > 0);
    if (playingVideo) return playingVideo;

    if (window.location.pathname.startsWith('/shorts')) {
        const shortsVideo = document.querySelector('#shorts-player video');
        if (shortsVideo) return shortsVideo;
    }

    return document.querySelector('#movie_player video') ||
           document.querySelector('.html5-video-player:not(#inline-preview-player) video') ||
           document.querySelector('video.video-stream') ||
           document.querySelector('video');
}

let fallbackGestureDetected = false;
let gestureUnlockAttached = false;

function canStartAudioContext() {
    if (ytEqAudioCtx && ytEqAudioCtx.state === 'running') return true;
    try {
        if (typeof navigator.getAutoplayPolicy === 'function') {
            return navigator.getAutoplayPolicy('audiocontext') === 'allowed';
        }
    } catch (e) {}
    if (navigator.userActivation) {
        return Boolean(navigator.userActivation.isActive || navigator.userActivation.hasBeenActive);
    }
    return fallbackGestureDetected;
}

function setupUserGestureAudioUnlock() {
    if (gestureUnlockAttached) return;
    gestureUnlockAttached = true;

    const onUserGesture = (e) => {
        if (e.type === 'click' || e.type === 'keydown' || e.type === 'touchend' || e.type === 'pointerup') {
            fallbackGestureDetected = true;
        }
        if (!canStartAudioContext()) return;
        if (ytEqAudioCtx && ytEqAudioCtx.state === 'suspended') {
            ytEqAudioCtx.resume().catch(() => {});
        }
        const video = getVideoElement();
        if (video && (!video.paused || (eqContainer && eqContainer.classList.contains('yt-eq-visible')))) {
            if (!ytEqAudioCtx || currentVideoElement !== video || !sourceNode) {
                initWebAudio(video);
                applyNormalizerGain();
            }
        }
    };

    ['pointerdown', 'pointerup', 'click', 'keydown', 'touchend'].forEach(evt => {
        document.addEventListener(evt, onUserGesture, { capture: true, passive: true });
    });
}

function initWebAudio(video) {
    if (!video) video = getVideoElement();
    if (!video) return;

    // Defer AudioContext creation/resume until browser confirms user activation (avoids Chrome autoplay warning)
    if (!canStartAudioContext()) return;

    if (!ytEqAudioCtx || ytEqAudioCtx.state === 'closed') {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        ytEqAudioCtx = new AudioContextClass();
        window.__YT_EQ_AUDIO_CTX__ = ytEqAudioCtx;
    }

    if (ytEqAudioCtx.state === 'suspended') {
        ytEqAudioCtx.resume().catch(() => {});
    }

    try {
        // Build the processing node chain once per AudioContext
        if (!preampNode || !analyserNode || audioGraphCtx !== ytEqAudioCtx) {
            if (limiterNode) {
                try { limiterNode.disconnect(); } catch (e) {}
            }

            preampNode = ytEqAudioCtx.createGain();
            normalizerNode = ytEqAudioCtx.createGain();

            // Brickwall Limiter
            limiterNode = ytEqAudioCtx.createDynamicsCompressor();
            limiterNode.threshold.value = -0.1; // Catch peaks just under 0dB
            limiterNode.knee.value = 0.0;       // Hard knee
            limiterNode.ratio.value = 20.0;     // High ratio for brickwall
            limiterNode.attack.value = 0.001;   // Very fast attack
            limiterNode.release.value = 0.050;  // Fast release

            // Analyser Node for Spectrum Visualizer (High-res 2048 FFT for RTA)
            analyserNode = ytEqAudioCtx.createAnalyser();
            analyserNode.fftSize = 2048; // 1024 frequency bins
            analyserNode.smoothingTimeConstant = 0.75;
            analyserNode.minDecibels = -100;
            analyserNode.maxDecibels = -15;

            // 10-band EQ
            filterNodes = EQ_BANDS.map(freq => {
                const filter = ytEqAudioCtx.createBiquadFilter();
                filter.type = 'peaking';
                filter.frequency.value = freq;
                filter.Q.value = 1.41;
                return filter;
            });

            // Chain connections: Preamp -> Filters[] -> Normalizer -> Limiter -> Destination & Analyser
            let lastNode = preampNode;
            filterNodes.forEach(filter => {
                lastNode.connect(filter);
                lastNode = filter;
            });
            lastNode.connect(normalizerNode);
            normalizerNode.connect(limiterNode);
            limiterNode.connect(ytEqAudioCtx.destination);
            limiterNode.connect(analyserNode);

            audioGraphCtx = ytEqAudioCtx;
            applyEQSettingsToNodes();
            applyLimiterSettings();
            applyNormalizerGain();
        }

        // Attach or re-attach MediaElementAudioSourceNode only when the video element changes
        if (currentVideoElement !== video || !sourceNode) {
            if (sourceNode) {
                try { sourceNode.disconnect(); } catch (e) {}
            }

            if (video.__ytEqSourceNode && video.__ytEqAudioCtx === ytEqAudioCtx) {
                sourceNode = video.__ytEqSourceNode;
            } else {
                sourceNode = ytEqAudioCtx.createMediaElementSource(video);
                video.__ytEqSourceNode = sourceNode;
                video.__ytEqAudioCtx = ytEqAudioCtx;
            }

            sourceNode.connect(preampNode);
            currentVideoElement = video;
            applyEQSettingsToNodes();
            applyLimiterSettings();
            applyNormalizerGain();
        }
    } catch (e) {
        console.error('[YT EQ] Failed to create or connect audio nodes', e);
    }
}

function applyEQSettingsToNodes() {
    if (!preampNode || filterNodes.length === 0) return;

    // Math.pow(10, db / 20) for GainNode
    preampNode.gain.value = Math.pow(10, eqSettings.preamp / 20);
    filterNodes.forEach((filter, idx) => {
        filter.gain.value = eqSettings.bands[idx];
    });
}

function applyLimiterSettings() {
    if (!limiterNode) return;

    if (eqSettings.limiterEnabled) {
        // Activate Brickwall parameters
        limiterNode.threshold.value = -0.1;
        limiterNode.ratio.value = 20.0;
    } else {
        // Bypass effectively
        limiterNode.threshold.value = 0;
        limiterNode.ratio.value = 1.0;
    }
}

function applyNormalizerGain() {
    const ytMusicPlayerEl = isYTMusic ? document.querySelector('ytmusic-player') : null;
    const isShorts = !isYTMusic && window.location.pathname.startsWith('/shorts');
    let moviePlayer = (isShorts ? document.getElementById('shorts-player') : null) ||
                      (isYTMusic ? document.querySelector('ytmusic-player #movie_player') : null) ||
                      document.getElementById('movie_player') ||
                      (ytMusicPlayerEl && typeof ytMusicPlayerEl.getPlayer === 'function' ? ytMusicPlayerEl.getPlayer() : null) ||
                      document.querySelector('ytmusic-player-bar')?.playerApi ||
                      document.querySelector('ytmusic-player-bar')?.playerApi_ ||
                      document.querySelector('ytmusic-app')?.playerApi ||
                      document.querySelector('ytmusic-app')?.player_;

    if (moviePlayer && moviePlayer.wrappedJSObject) {
        moviePlayer = moviePlayer.wrappedJSObject;
    }

    let urlVideoId = new URLSearchParams(window.location.search).get('v') || '';
    if (!urlVideoId && isShorts) {
        const shortsMatch = window.location.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
        if (shortsMatch) urlVideoId = shortsMatch[1];
    }

    let playerVideoId = '';
    if (moviePlayer && typeof moviePlayer.getVideoData === 'function') {
        try {
            playerVideoId = moviePlayer.getVideoData()?.video_id || '';
        } catch (e) {}
    }
    const currentVideoId = playerVideoId || urlVideoId;

    // Read live player telemetry via getStatsForNerds() (in-memory getter, no UI side effects, always English)
    let stats = null;
    if (moviePlayer && typeof moviePlayer.getStatsForNerds === 'function') {
        try {
            stats = moviePlayer.getStatsForNerds();
        } catch (e) {}
    }

    let playerPct = null;
    let normalizedPct = null;
    let statsLoudnessDb = null;
    let activeItag = null;

    if (stats && typeof stats === 'object') {
        const statsVideoId = stats.docid ||
            (typeof stats.video_id_and_cpn === 'string' ? stats.video_id_and_cpn.trim().split(/[\s/]+/)[0] : '');
        const statsMatchesVideo = !currentVideoId || !statsVideoId || statsVideoId === currentVideoId;

        if (statsMatchesVideo) {
            if (stats.afmt) {
                const parsedItag = parseInt(stats.afmt, 10);
                if (Number.isFinite(parsedItag)) activeItag = parsedItag;
            }
            if (typeof stats.volume === 'string') {
                const pctMatch = stats.volume.match(/(\d+(?:\.\d+)?)%\s*\/\s*(\d+(?:\.\d+)?)%/);
                if (pctMatch) {
                    playerPct = parseFloat(pctMatch[1]);
                    normalizedPct = parseFloat(pctMatch[2]);
                }
                const loudMatch = stats.volume.match(/content\s+loudness\s*:?\s*([+-]?\d+(?:\.\d+)?)\s*dB/i);
                if (loudMatch) {
                    const parsedLoud = parseFloat(loudMatch[1]);
                    if (Number.isFinite(parsedLoud)) statsLoudnessDb = parsedLoud;
                }
            }
        }
    }

    const toFiniteNumber = (val) => {
        const num = typeof val === 'string' ? parseFloat(val) : val;
        return Number.isFinite(num) ? num : null;
    };

    let playerResponse = null;
    if (moviePlayer && typeof moviePlayer.getPlayerResponse === 'function') {
        try {
            const resp = moviePlayer.getPlayerResponse();
            const respVideoId = resp?.videoDetails?.videoId || '';
            if (resp && (!currentVideoId || !respVideoId || respVideoId === currentVideoId)) {
                playerResponse = resp;
            }
        } catch (e) {}
    }

    if (!playerResponse && currentVideoId) {
        const globalWindow = window.wrappedJSObject || window;
        const initResp = globalWindow.ytInitialPlayerResponse;
        if (initResp && initResp?.videoDetails?.videoId === currentVideoId) {
            playerResponse = initResp;
        }
    }

    let formatLoudnessDb = null;
    let fallbackAudioFormatLoudnessDb = null;
    const adaptiveFormats = playerResponse?.streamingData?.adaptiveFormats;
    if (Array.isArray(adaptiveFormats)) {
        for (const fmt of adaptiveFormats) {
            const fmtLoud = toFiniteNumber(fmt?.loudnessDb);
            if (fmtLoud === null) continue;
            if (activeItag !== null && Number(fmt.itag) === activeItag) {
                formatLoudnessDb = fmtLoud;
                break;
            }
            if (fallbackAudioFormatLoudnessDb === null && typeof fmt?.mimeType === 'string' && fmt.mimeType.startsWith('audio/')) {
                fallbackAudioFormatLoudnessDb = fmtLoud;
            }
        }
    }

    let effectiveConfigLoudnessDb = toFiniteNumber(playerResponse?.playerConfig?.audioConfig?.loudnessDb);
    if (effectiveConfigLoudnessDb !== null && statsLoudnessDb !== null && Math.abs(effectiveConfigLoudnessDb - statsLoudnessDb) > 0.25) {
        // Active stream (e.g. switched audio language track or DRC stream) differs from static default audioConfig
        effectiveConfigLoudnessDb = statsLoudnessDb;
    }

    // Priority: exact active stream format -> audioConfig -> Stats for Nerds -> fallback audio stream format
    const candidates = [formatLoudnessDb, effectiveConfigLoudnessDb, statsLoudnessDb, fallbackAudioFormatLoudnessDb];
    let detectedLoudnessDb = 0;
    for (const candidate of candidates) {
        if (candidate !== null) {
            detectedLoudnessDb = candidate;
            break;
        }
    }

    // Prevent double-boosting if YouTube did not actually attenuate video.volume (e.g. "100% / 100%")
    if (detectedLoudnessDb >= 1.5 && playerPct !== null && normalizedPct !== null && playerPct >= 20 && normalizedPct >= playerPct) {
        detectedLoudnessDb = 0;
    }

    const loudnessDb = detectedLoudnessDb > 0 ? detectedLoudnessDb : 0;
    lastLoudnessDb = loudnessDb;

    if (normalizerNode) {
        if (eqSettings.normalizerEnabled && loudnessDb > 0) {
            normalizerNode.gain.value = Math.pow(10, loudnessDb / 20);
        } else {
            normalizerNode.gain.value = 1;
        }
    }
    updateNormalizerUI(loudnessDb);
}

// UI DOM Elements
let eqContainer = null;
let eqToggleButton = null;
let normalizerStatusSpan = null;
let autohideObserver = null;
let observedPlayerElement = null;

function setupAutohidePrevention() {
    if (isYTMusic) return;
    const moviePlayer = getMoviePlayer();
    if (!moviePlayer) return;
    if (autohideObserver && observedPlayerElement === moviePlayer) return;

    if (autohideObserver) {
        try { autohideObserver.disconnect(); } catch (e) {}
    }

    autohideObserver = new MutationObserver(() => {
        const isEQOpen = eqContainer && eqContainer.classList.contains('yt-eq-visible');
        if (!isEQOpen) return;

        if (moviePlayer.classList.contains('ytp-autohide')) {
            moviePlayer.classList.remove('ytp-autohide');
        }

        // Mutual exclusion: if YouTube settings menu or active popup opens, close EQ
        const settingsMenu = moviePlayer.querySelector('.ytp-settings-menu') || document.querySelector('.ytp-settings-menu');
        if (settingsMenu && settingsMenu.style.display !== 'none' && settingsMenu.offsetHeight > 0) {
            setEQVisible(false);
        }
    });

    observedPlayerElement = moviePlayer;
    autohideObserver.observe(moviePlayer, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'aria-expanded']
    });
}

function getMoviePlayer() {
    if (isYTMusic) {
        return document.querySelector('ytmusic-app') || document.body;
    }
    return document.getElementById('movie_player') || 
           document.querySelector('.html5-video-player:not(#inline-preview-player)') || 
           document.querySelector('#player-theater-container') || 
           document.querySelector('#player');
}

function ensureUIAttached() {
    const targetParent = isYTMusic ? document.body : (getMoviePlayer() || document.body);
    if (!eqContainer) {
        createUI();
    }
    if (eqContainer && targetParent && eqContainer.parentElement !== targetParent) {
        targetParent.appendChild(eqContainer);
    }
    return !!eqContainer;
}

function closeYouTubePopups() {
    try {
        const settingsBtn = document.querySelector('.ytp-settings-button');
        if (settingsBtn && settingsBtn.getAttribute('aria-expanded') === 'true') {
            settingsBtn.click();
        }

        const popups = document.querySelectorAll('.ytp-popup, .ytp-settings-menu, .ytp-contextmenu');
        popups.forEach(popup => {
            if (popup !== eqContainer && !popup.contains(eqContainer) && !eqContainer.contains(popup)) {
                if (popup.style.display !== 'none') {
                    popup.style.display = 'none';
                }
            }
        });
    } catch (e) {}
}

function setEQVisible(visible) {
    ensureUIAttached();
    if (!eqContainer) return;

    const moviePlayer = getMoviePlayer();

    if (visible) {
        // Close any open settings or YouTube popup menus before opening EQ
        closeYouTubePopups();

        try {
            const video = getVideoElement();
            if (video) initWebAudio(video);
            applyNormalizerGain();
        } catch (e) {}

        eqContainer.classList.add('yt-eq-visible');
        if (eqToggleButton) eqToggleButton.classList.add('active');

        if (currentView === 'analyzer' && typeof startVisualizer === 'function') {
            startVisualizer();
        }

        if (moviePlayer && !isYTMusic) {
            moviePlayer.classList.add('yt-eq-active');
            moviePlayer.classList.remove('ytp-autohide');
            if (typeof moviePlayer.wakeUpControls === 'function') {
                moviePlayer.wakeUpControls();
            }
        }
        if (!isYTMusic) {
            setupAutohidePrevention();
        }
    } else {
        const activeInput = eqContainer.querySelector('.yt-eq-value-input');
        if (activeInput) {
            if (typeof activeInput.__ytEqFinish === 'function') {
                activeInput.__ytEqFinish(true);
            } else {
                try { activeInput.blur(); } catch (e) {}
            }
        }

        eqContainer.classList.remove('yt-eq-visible');
        if (eqToggleButton) eqToggleButton.classList.remove('active');

        if (typeof stopVisualizer === 'function') {
            stopVisualizer();
        }

        if (currentView === 'analyzer' && typeof switchView === 'function') {
            switchView('eq');
        }

        if (moviePlayer && !isYTMusic) {
            moviePlayer.classList.remove('yt-eq-active');
        }
    }
}

function updateNormalizerUI(loudnessDb = lastLoudnessDb) {
    if (!normalizerStatusSpan) return;
    if (eqSettings.normalizerEnabled) {
        normalizerStatusSpan.textContent = loudnessDb > 0
            ? `${getMsg('normalizerOff')} (+${loudnessDb.toFixed(1)}dB)`
            : getMsg('normalizerOff');
        normalizerStatusSpan.style.color = '#e8e8e8';
    } else {
        normalizerStatusSpan.textContent = getMsg('normalizerOn');
        normalizerStatusSpan.style.color = '#888';
    }
}

function createUI() {
    const targetParent = isYTMusic ? document.body : (getMoviePlayer() || document.body);
    const existingContainer = document.getElementById('yt-eq-container');
    if (existingContainer) {
        // Reuse existing container created by this script instance regardless of visibility state
        if (existingContainer === eqContainer && existingContainer.__ytEqVersion === YT_EQ_VERSION) {
            if (targetParent && existingContainer.parentElement !== targetParent) {
                targetParent.appendChild(existingContainer);
            }
            return;
        }
        try { existingContainer.remove(); } catch (e) {}
    }

    eqContainer = document.createElement('div');
    eqContainer.__ytEqVersion = YT_EQ_VERSION;
    eqContainer.id = 'yt-eq-container';
    eqContainer.className = 'yt-eq-container' + (isYTMusic ? ' ytmusic-mode' : '');

    // --- Header ---
    const header = document.createElement('div');
    header.className = 'yt-eq-header';

    // Left title in header
    const headerTitle = document.createElement('span');
    headerTitle.className = 'yt-eq-title-text';
    headerTitle.textContent = getMsg('title') || 'Equalizer';
    header.appendChild(headerTitle);

    // --- Mode Toggle ---
    const modeToggle = document.createElement('div');
    modeToggle.className = 'yt-eq-mode-toggle';
    
    const btnBasic = document.createElement('button');
    btnBasic.textContent = getMsg('modeBasic');
    btnBasic.className = `yt-eq-mode-btn ${eqSettings.mode === 'basic' ? 'active' : ''}`;
    
    const btnPro = document.createElement('button');
    btnPro.textContent = getMsg('modePro');
    btnPro.className = `yt-eq-mode-btn ${eqSettings.mode === 'pro' ? 'active' : ''}`;

    modeToggle.appendChild(btnBasic);
    modeToggle.appendChild(btnPro);

    // Spectrum Analyzer Toggle Button (replaces close button)
    const analyzerBtn = document.createElement('button');
    analyzerBtn.className = 'yt-eq-analyzer-btn';
    analyzerBtn.setAttribute('title', getMsg('spectrumAnalyzer'));
    analyzerBtn.setAttribute('aria-label', getMsg('spectrumAnalyzer'));

    const svgNS = "http://www.w3.org/2000/svg";
    const analyzerSvg = document.createElementNS(svgNS, "svg");
    analyzerSvg.setAttribute("class", "yt-eq-analyzer-icon");
    analyzerSvg.setAttribute("viewBox", "0 0 24 24");
    analyzerSvg.setAttribute("width", "20");
    analyzerSvg.setAttribute("height", "20");
    analyzerSvg.setAttribute("fill", "currentColor");

    const analyzerPath = document.createElementNS(svgNS, "path");
    // Material Symbols graphic_eq (frequency audio spectrum bars)
    analyzerPath.setAttribute("d", "M7 18h2V6H7v12zm4 4h2V2h-2v20zm-8-8h2v-4H3v4zm12 4h2V6h-2v12zm4-8v4h2v-4h-2z");
    analyzerSvg.appendChild(analyzerPath);
    analyzerBtn.appendChild(analyzerSvg);

    header.appendChild(modeToggle);
    header.appendChild(analyzerBtn);

    // --- Full Popup Spectrum Analyzer RTA Graph Container ---
    const visualizerContainer = document.createElement('div');
    visualizerContainer.className = 'yt-eq-visualizer-container';

    const canvas = document.createElement('canvas');
    canvas.className = 'yt-eq-visualizer-canvas';
    visualizerContainer.appendChild(canvas);

    let animId = null;
    let visualizerFreqData = null;
    let instantCurve = null;
    let peakCurve = null;

    const drawVisualizer = () => {
        if (!eqContainer || !eqContainer.classList.contains('yt-eq-visible') || currentView !== 'analyzer') {
            stopVisualizer();
            return;
        }

        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            animId = requestAnimationFrame(drawVisualizer);
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        const targetW = Math.round(rect.width * dpr);
        const targetH = Math.round(rect.height * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
        }

        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.scale(dpr, dpr);

        const W = rect.width;
        const H = rect.height;

        // Background (Transparent)
        ctx.clearRect(0, 0, W, H);

        // Layout Margins
        const leftMargin = 38;
        const rightMargin = 14;
        const topMargin = 22;
        const bottomMargin = 16;
        const graphW = Math.max(10, W - leftMargin - rightMargin);
        const graphH = Math.max(10, H - topMargin - bottomMargin);

        // dB Range: from -90 dB at bottom to -20 dB at top
        const minDb = -90;
        const maxDb = -20;
        const dbRange = maxDb - minDb;

        const dbToY = (db) => {
            const norm = (db - minDb) / dbRange;
            const clamped = Math.max(0, Math.min(1, norm));
            return topMargin + (1 - clamped) * graphH;
        };

        // Frequency Range: Logarithmic from 20 Hz to 20,000 Hz
        const minFreq = 20;
        const maxFreq = 20000;
        const logMin = Math.log10(minFreq);
        const logMax = Math.log10(maxFreq);
        const logRange = logMax - logMin;

        const freqToX = (freq) => {
            const norm = (Math.log10(freq) - logMin) / logRange;
            return leftMargin + norm * graphW;
        };

        const xToFreq = (x) => {
            const norm = (x - leftMargin) / graphW;
            return minFreq * Math.pow(maxFreq / minFreq, norm);
        };

        // 1. Draw Horizontal Grid Lines & dB Labels
        const dbSteps = [-24, -30, -36, -42, -48, -54, -60, -66, -72, -78, -84, -90];
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = '10px Roboto, Arial, sans-serif';

        dbSteps.forEach((dbVal) => {
            const y = dbToY(dbVal);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(leftMargin, y);
            ctx.lineTo(W - rightMargin, y);
            ctx.stroke();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
            ctx.fillText(String(dbVal), leftMargin - 6, y);
        });

        // 2. Draw Vertical Grid Lines & Frequency Labels (Logarithmic)
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.font = '11px Roboto, Arial, sans-serif';

        const decades = [
            [20, 30, 40, 50, 60, 70, 80, 90],
            [100, 200, 300, 400, 500, 600, 700, 800, 900],
            [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000],
            [10000, 20000]
        ];

        decades.forEach((decade) => {
            decade.forEach((freq) => {
                const x = freqToX(freq);
                if (x < leftMargin || x > W - rightMargin) return;

                const isMajor = (freq === 100 || freq === 1000 || freq === 10000);
                ctx.strokeStyle = isMajor ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.04)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x, topMargin);
                ctx.lineTo(x, topMargin + graphH);
                ctx.stroke();

                if (isMajor) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                    const label = freq === 100 ? '100' : (freq === 1000 ? '1k' : '10k');
                    ctx.fillText(label, x, topMargin - 4);
                }
            });
        });

        // Outer Grid Border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.strokeRect(leftMargin, topMargin, graphW, graphH);

        // 3. Audio Frequency Data
        const binCount = analyserNode ? analyserNode.frequencyBinCount : 0;
        if (binCount > 0) {
            if (!visualizerFreqData || visualizerFreqData.length !== binCount) {
                visualizerFreqData = new Float32Array(binCount);
            }
            if (ytEqAudioCtx && ytEqAudioCtx.state === 'running') {
                analyserNode.getFloatFrequencyData(visualizerFreqData);
            } else {
                visualizerFreqData.fill(-120);
            }
        }

        const sampleRate = (ytEqAudioCtx && ytEqAudioCtx.sampleRate) || 48000;
        const nyquist = sampleRate / 2;

        const numPoints = Math.floor(graphW);
        if (numPoints > 0) {
            if (!instantCurve || instantCurve.length !== numPoints) {
                instantCurve = new Float32Array(numPoints);
                peakCurve = new Float32Array(numPoints);
                instantCurve.fill(-100);
                peakCurve.fill(-100);
            }

            for (let i = 0; i < numPoints; i++) {
                const x = leftMargin + i;
                const freq1 = xToFreq(x);
                const freq2 = xToFreq(x + 1);

                let binLow = Math.floor((freq1 / nyquist) * binCount);
                let binHigh = Math.ceil((freq2 / nyquist) * binCount);
                binLow = Math.max(0, Math.min(binCount - 1, binLow));
                binHigh = Math.max(binLow, Math.min(binCount - 1, binHigh));

                let maxDbVal = -120;
                if (visualizerFreqData) {
                    for (let b = binLow; b <= binHigh; b++) {
                        const val = visualizerFreqData[b];
                        if (isFinite(val) && val > maxDbVal) {
                            maxDbVal = val;
                        }
                    }
                }
                if (maxDbVal < -100) maxDbVal = -100;

                // Asymmetric smooth physics (fast attack, liquid decay)
                const target = maxDbVal;
                const current = instantCurve[i];
                const diff = target - current;
                if (diff > 0) {
                    instantCurve[i] += diff * 0.38; // crisp responsive transient attack
                } else {
                    instantCurve[i] += diff * 0.16; // gentle buoyant decay
                }
            }

            // Spatial smoothing across neighboring frequency points (3-point Gaussian kernel)
            const displayCurve = new Float32Array(numPoints);
            for (let i = 0; i < numPoints; i++) {
                const prev = instantCurve[Math.max(0, i - 1)];
                const curr = instantCurve[i];
                const next = instantCurve[Math.min(numPoints - 1, i + 1)];
                displayCurve[i] = prev * 0.22 + curr * 0.56 + next * 0.22;
            }

            // Peak envelope update and 5-point smoothing
            for (let i = 0; i < numPoints; i++) {
                if (displayCurve[i] >= peakCurve[i]) {
                    peakCurve[i] = displayCurve[i];
                } else {
                    peakCurve[i] = Math.max(-100, peakCurve[i] - 0.22);
                }
            }

            const displayPeak = new Float32Array(numPoints);
            for (let i = 0; i < numPoints; i++) {
                const p0 = peakCurve[Math.max(0, i - 2)];
                const p1 = peakCurve[Math.max(0, i - 1)];
                const p2 = peakCurve[i];
                const p3 = peakCurve[Math.min(numPoints - 1, i + 1)];
                const p4 = peakCurve[Math.min(numPoints - 1, i + 2)];
                displayPeak[i] = (p0 + p1 * 2 + p2 * 3 + p3 * 2 + p4) / 9;
            }

            // Clip drawing inside graph rectangle
            ctx.save();
            ctx.beginPath();
            ctx.rect(leftMargin, topMargin, graphW, graphH);
            ctx.clip();

            // Helper: Trace silky smooth quadratic Bézier spline path through midpoints
            const traceSpline = (curveArr) => {
                ctx.beginPath();
                const startX = leftMargin;
                const startY = dbToY(curveArr[0]);
                ctx.moveTo(startX, startY);

                const step = 2;
                let prevX = startX;
                let prevY = startY;

                for (let i = step; i < numPoints; i += step) {
                    const currX = leftMargin + i;
                    const currY = dbToY(curveArr[i]);
                    const midX = (prevX + currX) / 2;
                    const midY = (prevY + currY) / 2;
                    ctx.quadraticCurveTo(prevX, prevY, midX, midY);
                    prevX = currX;
                    prevY = currY;
                }
                const lastX = leftMargin + numPoints - 1;
                const lastY = dbToY(curveArr[numPoints - 1]);
                ctx.quadraticCurveTo(prevX, prevY, lastX, lastY);
            };

            // 4. Subtle Translucent Gradient Fill Under Instant Curve
            traceSpline(displayCurve);
            ctx.lineTo(leftMargin + numPoints - 1, topMargin + graphH);
            ctx.lineTo(leftMargin, topMargin + graphH);
            ctx.closePath();
            const fillGrad = ctx.createLinearGradient(0, topMargin, 0, topMargin + graphH);
            fillGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
            fillGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.03)');
            fillGrad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
            ctx.fillStyle = fillGrad;
            ctx.fill();

            // 5. Primary Instantaneous Trace (Monochrome Crisp White Spline)
            traceSpline(displayCurve);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.lineJoin = 'round';
            ctx.stroke();

            // 6. Smoothed Peak Trace (Monochrome Subtle Silver/Gray Spline)
            traceSpline(displayPeak);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.lineWidth = 1.5;
            ctx.lineJoin = 'round';
            ctx.stroke();

            ctx.restore(); // Restore clip
        }

        ctx.restore(); // Restore scale
        animId = requestAnimationFrame(drawVisualizer);
    };

    startVisualizer = () => {
        if (currentView !== 'analyzer') return;
        try {
            const video = getVideoElement();
            if (video) initWebAudio(video);
            if (ytEqAudioCtx && ytEqAudioCtx.state === 'suspended' && canStartAudioContext()) {
                ytEqAudioCtx.resume().catch(() => {});
            }
        } catch (e) {}
        if (animId) return;
        animId = requestAnimationFrame(drawVisualizer);
    };

    stopVisualizer = () => {
        if (animId) {
            cancelAnimationFrame(animId);
            animId = null;
        }
    };

    const morphContainerHeight = (action) => {
        if (!eqContainer) {
            action();
            return;
        }
        const prevH = eqContainer.offsetHeight;
        action();
        const newH = eqContainer.offsetHeight;
        if (prevH && newH && prevH !== newH) {
            eqContainer.style.height = `${prevH}px`;
            eqContainer.style.transition = 'height 0.35s cubic-bezier(0.2, 0, 0, 1)';
            void eqContainer.offsetHeight; // Force reflow
            eqContainer.style.height = `${newH}px`;

            let cleanedUp = false;
            const cleanup = () => {
                if (cleanedUp) return;
                cleanedUp = true;
                if (eqContainer) {
                    eqContainer.style.height = '';
                    eqContainer.style.transition = '';
                    eqContainer.removeEventListener('transitionend', onTransitionEnd);
                }
            };

            const onTransitionEnd = (e) => {
                if (e.target === eqContainer && e.propertyName === 'height') {
                    cleanup();
                }
            };
            eqContainer.addEventListener('transitionend', onTransitionEnd);
            setTimeout(cleanup, 400);
        }
    };

    switchView = (targetView) => {
        if (currentView === targetView) return;
        morphContainerHeight(() => {
            currentView = targetView;
            if (currentView === 'analyzer') {
                const eqTitle = getMsg('title') || 'Equalizer';
                const specTitle = getMsg('spectrumAnalyzer') || 'Spectrum Analyzer';
                eqContainer.classList.add('yt-eq-spectrum-view');
                analyzerBtn.classList.add('active');
                analyzerBtn.setAttribute('title', eqTitle);
                analyzerBtn.setAttribute('aria-label', eqTitle);
                headerTitle.textContent = specTitle;
                startVisualizer();
            } else {
                const eqTitle = getMsg('title') || 'Equalizer';
                const specTitle = getMsg('spectrumAnalyzer') || 'Spectrum Analyzer';
                eqContainer.classList.remove('yt-eq-spectrum-view');
                analyzerBtn.classList.remove('active');
                analyzerBtn.setAttribute('title', specTitle);
                analyzerBtn.setAttribute('aria-label', specTitle);
                headerTitle.textContent = eqTitle;
                stopVisualizer();
            }
        });
    };

    analyzerBtn.onclick = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        switchView(currentView === 'eq' ? 'analyzer' : 'eq');
    };

    // --- Preset Controls ---
    const presetContainer = document.createElement('div');
    presetContainer.className = 'yt-eq-preset-container';

    const presetLabel = document.createElement('span');
    presetLabel.textContent = getMsg('preset') + ': ';
    presetLabel.className = 'yt-eq-preset-label';

    const presetSelect = document.createElement('select');
    presetSelect.className = 'yt-eq-preset-select';
    
    const toPresetSelectValue = (presetKey) => {
        if (!presetKey || presetKey === 'Custom' || presetKey === 'unsaved') {
            return 'unsaved';
        }
        if (presetKey.startsWith('custom:')) {
            const name = presetKey.slice(7);
            return eqSettings.customPresets?.some(p => p.name === name) ? presetKey : 'default:Flat';
        }
        if (presetKey.startsWith('default:')) {
            const id = presetKey.slice(8);
            return DEFAULT_PRESETS.some(p => p.id === id) ? presetKey : 'default:Flat';
        }
        // Backwards compatibility for legacy unprefixed activePreset values
        if (DEFAULT_PRESETS.some(p => p.id === presetKey)) {
            return `default:${presetKey}`;
        }
        if (eqSettings.customPresets?.some(p => p.name === presetKey)) {
            return `custom:${presetKey}`;
        }
        return 'default:Flat';
    };

    const renderPresetOptions = () => {
        presetSelect.textContent = '';
        const customOptGroup = document.createElement('optgroup');
        customOptGroup.label = getMsg('customPresetsGroup') || 'Custom Presets';
        const defaultOptGroup = document.createElement('optgroup');
        defaultOptGroup.label = getMsg('defaultPresetsGroup') || 'Default Presets';

        // Add custom presets first if any
        if (eqSettings.customPresets && eqSettings.customPresets.length > 0) {
            eqSettings.customPresets.forEach(p => {
                const opt = document.createElement('option');
                opt.value = `custom:${p.name}`;
                opt.textContent = p.name;
                customOptGroup.appendChild(opt);
            });
            presetSelect.appendChild(customOptGroup);
        }

        DEFAULT_PRESETS.forEach(p => {
            const opt = document.createElement('option');
            opt.value = `default:${p.id}`;
            opt.textContent = getMsg(`preset${p.id}`) || p.id;
            defaultOptGroup.appendChild(opt);
        });
        presetSelect.appendChild(defaultOptGroup);

        const resolvedValue = toPresetSelectValue(eqSettings.activePreset);
        if (resolvedValue === 'unsaved') {
            const customUnsavedOpt = document.createElement('option');
            customUnsavedOpt.value = 'unsaved';
            customUnsavedOpt.textContent = getMsg('customUnsaved');
            presetSelect.insertBefore(customUnsavedOpt, presetSelect.firstChild);
        } else if (resolvedValue === 'default:Flat' && eqSettings.activePreset !== 'Flat' && eqSettings.activePreset !== 'default:Flat') {
            eqSettings.activePreset = 'Flat';
        }

        presetSelect.value = resolvedValue;
    };
    renderPresetOptions();

    let proSliders = []; // Declare early to use in applyPreset
    let basicKnobs = []; // Declare early to use in applyPreset

    const applyPreset = (presetObj) => {
        eqSettings.preamp = presetObj.preamp;
        eqSettings.bands = [...presetObj.bands];
        applyEQSettingsToNodes();
        basicKnobs.forEach(k => k.render());
        proSliders.forEach(s => s.render());
        saveSettings();
    };

    const updateDeleteBtnVisibility = (val = eqSettings.activePreset) => {
        const resolved = toPresetSelectValue(val);
        presetDeleteBtn.style.display = resolved.startsWith('custom:') ? 'flex' : 'none';
    };

    presetSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val.startsWith('default:')) {
            const id = val.slice(8);
            const defPreset = DEFAULT_PRESETS.find(p => p.id === id);
            if (defPreset) {
                eqSettings.activePreset = id;
                applyPreset(defPreset);
            }
        } else if (val.startsWith('custom:')) {
            const name = val.slice(7);
            const custPreset = eqSettings.customPresets?.find(p => p.name === name);
            if (custPreset) {
                eqSettings.activePreset = `custom:${name}`;
                applyPreset(custPreset);
            }
        }
        renderPresetOptions();
        updateDeleteBtnVisibility(eqSettings.activePreset);
    });

    const presetDeleteBtn = document.createElement('button');
    presetDeleteBtn.className = 'yt-eq-preset-delete';
    
    // Create SVG for trash can
    const delSvgNS = "http://www.w3.org/2000/svg";
    const delSvg = document.createElementNS(delSvgNS, "svg");
    delSvg.setAttribute("viewBox", "0 -960 960 960");
    delSvg.setAttribute("width", "100%");
    delSvg.setAttribute("height", "100%");
    const delPath = document.createElementNS(delSvgNS, "path");
    delPath.setAttribute("d", "M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z");
    delSvg.appendChild(delPath);
    presetDeleteBtn.appendChild(delSvg);

    presetDeleteBtn.title = getMsg('deleteTitle');
    presetDeleteBtn.setAttribute('aria-label', getMsg('deleteTitle'));
    presetDeleteBtn.style.display = 'none';
    presetDeleteBtn.onclick = () => {
        const resolved = toPresetSelectValue(eqSettings.activePreset);
        if (!resolved.startsWith('custom:')) return;
        const targetName = resolved.slice(7);
        isModalDialogOpen = true;
        try {
            if (confirm(getMsg('deleteConfirm'))) {
                eqSettings.customPresets = eqSettings.customPresets.filter(p => p.name !== targetName);
                eqSettings.activePreset = 'Flat';
                saveSettings();
                renderPresetOptions();
                applyPreset(DEFAULT_PRESETS.find(p => p.id === 'Flat'));
                updateDeleteBtnVisibility('Flat');
            }
        } finally {
            setTimeout(() => { isModalDialogOpen = false; }, 300);
        }
    };

    const presetSaveBtn = document.createElement('button');
    presetSaveBtn.className = 'yt-eq-preset-save';
    presetSaveBtn.textContent = getMsg('save');
    presetSaveBtn.onclick = () => {
        isModalDialogOpen = true;
        try {
            const name = window.prompt(getMsg('customNamePrompt'), 'My Preset');
            if (name && name.trim()) {
                const newPreset = {
                    name: name.trim(),
                    bands: [...eqSettings.bands],
                    preamp: eqSettings.preamp
                };
                if (!eqSettings.customPresets) eqSettings.customPresets = [];
                const existingIdx = eqSettings.customPresets.findIndex(p => p.name === newPreset.name);
                if (existingIdx >= 0) {
                    eqSettings.customPresets[existingIdx] = newPreset;
                } else {
                    eqSettings.customPresets.push(newPreset);
                }
                eqSettings.activePreset = `custom:${newPreset.name}`;
                saveSettings();
                renderPresetOptions();
                updateDeleteBtnVisibility(eqSettings.activePreset);
            }
        } finally {
            setTimeout(() => { isModalDialogOpen = false; }, 300);
        }
    };

    const presetSelectWrapper = document.createElement('div');
    presetSelectWrapper.className = 'yt-eq-preset-select-wrapper';
    presetSelectWrapper.appendChild(presetSelect);
    presetSelectWrapper.appendChild(presetDeleteBtn);

    presetContainer.appendChild(presetLabel);
    presetContainer.appendChild(presetSelectWrapper);
    presetContainer.appendChild(presetSaveBtn);

    // After renderPresetOptions is called initially, update delete button
    setTimeout(() => updateDeleteBtnVisibility(eqSettings.activePreset), 100);

    // ====== BASIC MODE (3-Knob) ======
    const basicWrapper = document.createElement('div');
    basicWrapper.className = 'yt-eq-mode-wrapper';
    if (eqSettings.mode === 'basic') basicWrapper.classList.add('active');

    const basicContent = document.createElement('div');
    basicContent.className = 'yt-eq-basic-controls yt-eq-mode-content';
    basicWrapper.appendChild(basicContent);

    // ====== Inline numeric value editor (click value -> type) ======
    // Syntax:  "6" / "6dB"  -> set absolute value
    //          "+2" / "-1.5" -> relative (add/subtract from current)
    //          "=-4"         -> set absolute (use for negative absolute values)
    // Keys:    Enter = apply, Esc = cancel, Up/Down = ±0.1 (Shift: ±1)
    const clampDb = (v) => Math.round(Math.max(-20, Math.min(20, v)) * 10) / 10;

    const parseValueInput = (raw, current) => {
        let s = String(raw).trim().replace(/db$/i, '').replace(/[＋]/g, '+').replace(/[－−ー]/g, '-').replace(/[＝]/g, '=').trim();
        s = s.replace(/[０-９．]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
        if (!s) return null;
        if (s.startsWith('=')) {
            const n = parseFloat(s.slice(1));
            return Number.isFinite(n) ? n : null;
        }
        if (s.startsWith('+') || s.startsWith('-')) {
            const n = parseFloat(s);
            return Number.isFinite(n) ? current + n : null;
        }
        const n = parseFloat(s);
        return Number.isFinite(n) ? n : null;
    };

    const syncAllControls = () => {
        basicKnobs.forEach(k => k.render());
        proSliders.forEach(s => s.render());
    };

    const attachValueEditor = (valEl, getVal, onValChange) => {
        valEl.classList.add('yt-eq-value-editable');
        valEl.setAttribute('title', getMsg('enterValue'));

        const commit = (newVal) => {
            const clamped = clampDb(newVal);
            if (Math.abs(clamped - clampDb(getVal())) < 1e-6) {
                syncAllControls();
                return;
            }
            onValChange(clamped);
            eqSettings.activePreset = 'Custom';
            renderPresetOptions();
            updateDeleteBtnVisibility('Custom');
            syncAllControls();
            saveSettings();
        };

        // Mouse wheel over the value nudges it (Shift = 1dB steps)
        valEl.addEventListener('wheel', (e) => {
            if (valEl.dataset.editing) return;
            e.preventDefault();
            e.stopPropagation();
            const step = e.shiftKey ? 1 : 0.1;
            commit(getVal() + (e.deltaY < 0 ? step : -step));
        }, { passive: false });

        valEl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (valEl.dataset.editing) return;
            valEl.dataset.editing = '1';

            const initialVal = clampDb(getVal());
            let dirty = false;
            let arrowMode = false;
            let currentEditVal = initialVal;

            const input = document.createElement('input');
            input.type = 'text';
            input.inputMode = 'decimal';
            input.className = 'yt-eq-value-input';
            input.value = initialVal.toFixed(1);
            input.setAttribute('placeholder', '+2 / -2 / 5');
            input.setAttribute('title', getMsg('enterValue'));
            input.setAttribute('aria-label', getMsg('enterValue'));

            valEl.textContent = '';
            valEl.appendChild(input);
            input.focus();
            input.select();

            input.addEventListener('input', () => {
                dirty = true;
                arrowMode = false;
            });

            let finished = false;
            const finish = (apply) => {
                if (finished) return;
                finished = true;
                const rawVal = input.value;
                delete valEl.dataset.editing;
                try { input.remove(); } catch (err) {}
                if (!apply || !dirty) {
                    syncAllControls(); // restore label text without modifying settings
                    return;
                }
                if (arrowMode) {
                    commit(currentEditVal);
                    return;
                }
                const parsed = parseValueInput(rawVal, initialVal);
                if (parsed !== null) {
                    commit(parsed);
                } else {
                    syncAllControls();
                }
            };
            input.__ytEqFinish = finish;

            const stopKeys = (ev) => ev.stopPropagation(); // keep YouTube shortcuts (k, j, l, 0-9, arrows...) from firing
            input.addEventListener('keyup', stopKeys);
            input.addEventListener('keypress', stopKeys);
            input.addEventListener('keydown', (ev) => {
                ev.stopPropagation();
                if (ev.isComposing) return;
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    finish(true);
                } else if (ev.key === 'Escape') {
                    ev.preventDefault();
                    finish(false);
                } else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
                    ev.preventDefault();
                    const base = (dirty && !arrowMode)
                        ? (parseValueInput(input.value, initialVal) ?? currentEditVal)
                        : currentEditVal;
                    const step = ev.shiftKey ? 1 : 0.1;
                    currentEditVal = clampDb(base + (ev.key === 'ArrowUp' ? step : -step));
                    input.value = currentEditVal.toFixed(1);
                    dirty = true;
                    arrowMode = true;
                    input.select();
                }
            });
            input.addEventListener('mousedown', (ev) => ev.stopPropagation());
            input.addEventListener('click', (ev) => ev.stopPropagation());
            input.addEventListener('blur', () => finish(true));
        });
    };

    const createRotaryKnob = (label, getVal, onValChange) => {
        const container = document.createElement('div');
        container.className = 'yt-eq-knob-container';

        const labelEl = document.createElement('div');
        labelEl.className = 'yt-eq-knob-label';
        labelEl.textContent = label;

        const wrapper = document.createElement('div');
        wrapper.className = 'yt-eq-knob-wrapper';

        // Use SVG for rounded rings
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("viewBox", "0 0 84 84");
        svg.setAttribute("class", "yt-eq-knob-svg");

        const r = 38; 
        const c = 42;
        const circumference = 2 * Math.PI * r;
        const maxDash = 0.75 * circumference;

        const bg = document.createElementNS(svgNS, "circle");
        bg.setAttribute("cx", c);
        bg.setAttribute("cy", c);
        bg.setAttribute("r", r);
        bg.setAttribute("fill", "none");
        bg.setAttribute("stroke", "rgba(255, 255, 255, 0.15)");
        bg.setAttribute("stroke-width", "8");
        bg.setAttribute("stroke-linecap", "round");
        bg.setAttribute("stroke-dasharray", `${maxDash} ${circumference}`);
        bg.style.transform = "rotate(135deg)";
        bg.style.transformOrigin = "50% 50%";

        const fg = document.createElementNS(svgNS, "circle");
        fg.setAttribute("cx", c);
        fg.setAttribute("cy", c);
        fg.setAttribute("r", r);
        fg.setAttribute("fill", "none");
        fg.setAttribute("stroke", "#ffffff");
        fg.setAttribute("stroke-width", "8");
        fg.setAttribute("stroke-linecap", "round");
        fg.setAttribute("stroke-dasharray", `0 ${circumference}`);
        fg.style.transform = "rotate(135deg)";
        fg.style.transformOrigin = "50% 50%";
        fg.style.filter = "drop-shadow(0 0 2px rgba(255, 255, 255, 0.8))";

        svg.appendChild(bg);
        svg.appendChild(fg);

        const center = document.createElement('div');
        center.className = 'yt-eq-knob-center';

        const indicator = document.createElement('div');
        indicator.className = 'yt-eq-knob-indicator';

        center.appendChild(indicator);
        wrapper.appendChild(svg);
        wrapper.appendChild(center);

        const valEl = document.createElement('div');
        valEl.className = 'yt-eq-knob-value';

        container.appendChild(labelEl);
        container.appendChild(wrapper);
        container.appendChild(valEl);

        let activePointerId = null;
        let startY = 0;
        let startVal = 0;
        let valueChanged = false;
        const SENSITIVITY = 0.3;

        const render = () => {
            const val = getVal();
            let pct = (val + 20) / 40;
            if (pct < 0) pct = 0;
            if (pct > 1) pct = 1;

            const fillLength = pct * maxDash;
            fg.setAttribute("stroke-dasharray", `${fillLength} ${circumference}`);

            const rotDeg = -135 + (pct * 270);
            center.style.transform = `rotate(${rotDeg}deg)`;

            if (!valEl.dataset.editing) {
                valEl.textContent = `${val > 0 ? '+' : ''}${val.toFixed(1)}dB`;
            }
        };

        wrapper.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            activePointerId = e.pointerId;
            startY = e.clientY;
            startVal = getVal();
            valueChanged = false;
            document.body.style.userSelect = 'none';
            try { wrapper.setPointerCapture(e.pointerId); } catch (err) {}
        });

        wrapper.addEventListener('pointermove', (e) => {
            if (activePointerId !== e.pointerId) return;
            const dy = startY - e.clientY;
            const newVal = clampDb(startVal + (dy * SENSITIVITY));
            if (Math.abs(newVal - getVal()) > 1e-6) {
                onValChange(newVal);
                render();
                proSliders.forEach(s => s.render()); // Sync pro sliders
                if (!valueChanged) {
                    valueChanged = true;
                    eqSettings.activePreset = 'Custom';
                    renderPresetOptions();
                    updateDeleteBtnVisibility('Custom');
                }
            }
        });

        const finishPointerDrag = (e) => {
            if (activePointerId !== e.pointerId) return;
            activePointerId = null;
            document.body.style.userSelect = '';
            try {
                if (wrapper.hasPointerCapture(e.pointerId)) {
                    wrapper.releasePointerCapture(e.pointerId);
                }
            } catch (err) {}
            if (valueChanged) {
                valueChanged = false;
                saveSettings();
            }
        };

        wrapper.addEventListener('pointerup', finishPointerDrag);
        wrapper.addEventListener('pointercancel', finishPointerDrag);

        // Double click to reset knob to 0dB (matches 10-band slider behavior)
        wrapper.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (Math.abs(getVal()) < 1e-6) return;
            onValChange(0);
            render();
            proSliders.forEach(s => s.render());
            eqSettings.activePreset = 'Custom';
            renderPresetOptions();
            updateDeleteBtnVisibility('Custom');
            saveSettings();
        });

        attachValueEditor(valEl, getVal, onValChange);

        render();
        return { container, render };
    };

    const getAvgBand = (indices) => {
        const sum = indices.reduce((a, idx) => a + eqSettings.bands[idx], 0);
        return sum / indices.length;
    };

    const setBandGroup = (indices, val) => {
        indices.forEach(idx => {
            eqSettings.bands[idx] = val;
        });
        applyEQSettingsToNodes();
    };

    const knobPreamp = createRotaryKnob(getMsg('preamp'), () => eqSettings.preamp, (val) => {
        eqSettings.preamp = val;
        applyEQSettingsToNodes();
    });
    const knobLow = createRotaryKnob(getMsg('low'), () => getAvgBand([0, 1, 2]), (val) => setBandGroup([0, 1, 2], val));
    const knobMid = createRotaryKnob(getMsg('mid'), () => getAvgBand([3, 4, 5, 6]), (val) => setBandGroup([3, 4, 5, 6], val));
    const knobHigh = createRotaryKnob(getMsg('high'), () => getAvgBand([7, 8, 9]), (val) => setBandGroup([7, 8, 9], val));

    basicKnobs.push(knobPreamp, knobLow, knobMid, knobHigh);

    basicContent.appendChild(knobPreamp.container);
    basicContent.appendChild(knobLow.container);
    basicContent.appendChild(knobMid.container);
    basicContent.appendChild(knobHigh.container);

    // ====== PRO MODE (10-Slider) ======
    const proWrapper = document.createElement('div');
    proWrapper.className = 'yt-eq-mode-wrapper';
    if (eqSettings.mode === 'pro') proWrapper.classList.add('active');

    const proContent = document.createElement('div');
    proContent.className = 'yt-eq-pro-controls yt-eq-mode-content';
    proWrapper.appendChild(proContent);

    const createSlider = (label, getVal, onValChange) => {
        const container = document.createElement('div');
        container.className = 'yt-eq-slider-col';

        const valEl = document.createElement('div');
        valEl.className = 'yt-eq-slider-val';

        const sliderWrapper = document.createElement('div');
        sliderWrapper.className = 'yt-eq-vertical-slider-wrapper';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '-20';
        slider.max = '20';
        slider.step = '0.1';
        slider.className = 'yt-eq-vertical-slider';

        const labelEl = document.createElement('div');
        labelEl.className = 'yt-eq-slider-label';
        labelEl.textContent = label;

        sliderWrapper.appendChild(slider);
        container.appendChild(valEl);
        container.appendChild(sliderWrapper);
        container.appendChild(labelEl);

        const render = () => {
            const val = getVal();
            slider.value = val;
            if (!valEl.dataset.editing) {
                valEl.textContent = `${val > 0 ? '+' : ''}${val.toFixed(1)}`;
            }
            
            // Fill background dynamically for slider track
            const pct = (val + 20) / 40 * 100;
            slider.style.background = `linear-gradient(to right, rgba(255, 255, 255, 0.8) ${pct}%, rgba(255, 255, 255, 0.1) ${pct}%)`;
        };

        slider.addEventListener('input', (e) => {
            const newVal = parseFloat(e.target.value);
            onValChange(newVal);
            render();
            basicKnobs.forEach(k => k.render()); // Sync basic knobs
            eqSettings.activePreset = 'Custom';
            renderPresetOptions();
            updateDeleteBtnVisibility('Custom');
        });

        slider.addEventListener('change', () => {
            saveSettings();
        });

        // Double click to reset
        slider.addEventListener('dblclick', () => {
            if (Math.abs(getVal()) < 1e-6) return;
            onValChange(0);
            render();
            basicKnobs.forEach(k => k.render());
            eqSettings.activePreset = 'Custom';
            renderPresetOptions();
            updateDeleteBtnVisibility('Custom');
            saveSettings();
        });

        attachValueEditor(valEl, getVal, onValChange);

        render();
        return { container, render };
    };

    const sliderPreamp = createSlider(getMsg('preamp'), () => eqSettings.preamp, (val) => {
        eqSettings.preamp = val;
        applyEQSettingsToNodes();
    });
    proSliders.push(sliderPreamp);
    proContent.appendChild(sliderPreamp.container);

    const eqBandsGroup = document.createElement('div');
    eqBandsGroup.className = 'yt-eq-pro-bands';

    EQ_BANDS_LABELS.forEach((label, idx) => {
        const sliderBand = createSlider(label, () => eqSettings.bands[idx], (val) => {
            eqSettings.bands[idx] = val;
            applyEQSettingsToNodes();
        });
        proSliders.push(sliderBand);
        eqBandsGroup.appendChild(sliderBand.container);
    });

    proContent.appendChild(eqBandsGroup);

    // --- Mode Toggle Logic ---
    const switchMode = (mode) => {
        morphContainerHeight(() => {
            eqSettings.mode = mode;
            saveSettings();
            if (mode === 'basic') {
                btnBasic.classList.add('active');
                btnPro.classList.remove('active');
                basicWrapper.classList.add('active');
                proWrapper.classList.remove('active');
            } else {
                btnPro.classList.add('active');
                btnBasic.classList.remove('active');
                proWrapper.classList.add('active');
                basicWrapper.classList.remove('active');
            }
        });
    };
    btnBasic.onclick = () => switchMode('basic');
    btnPro.onclick = () => switchMode('pro');

    // --- Footer ---
    const footer = document.createElement('div');
    footer.className = 'yt-eq-footer';

    const footerLeft = document.createElement('div');
    footerLeft.className = 'yt-eq-footer-left';

    // Normalizer Toggle Switch Area
    const normalizerWrapper = document.createElement('div');
    normalizerWrapper.className = 'yt-eq-toggle-wrapper';

    normalizerStatusSpan = document.createElement('span');
    normalizerStatusSpan.textContent = eqSettings.normalizerEnabled ? getMsg('normalizerOff') : getMsg('normalizerOn');

    const switchLabel = document.createElement('label');
    switchLabel.className = 'yt-eq-switch';
    const switchInput = document.createElement('input');
    switchInput.type = 'checkbox';
    switchInput.checked = eqSettings.normalizerEnabled;
    const switchSpan = document.createElement('span');
    switchSpan.className = 'yt-eq-slider-toggle';

    switchInput.addEventListener('change', (e) => {
        eqSettings.normalizerEnabled = e.target.checked;
        saveSettings();
        applyNormalizerGain();
    });

    switchLabel.appendChild(switchInput);
    switchLabel.appendChild(switchSpan);

    normalizerWrapper.appendChild(normalizerStatusSpan);
    normalizerWrapper.appendChild(switchLabel);

    // Limiter Toggle Switch Area
    const limiterWrapper = document.createElement('div');
    limiterWrapper.className = 'yt-eq-toggle-wrapper';

    const limiterStatusSpan = document.createElement('span');
    limiterStatusSpan.textContent = getMsg('limiter');
    limiterStatusSpan.style.color = eqSettings.limiterEnabled ? '#e8e8e8' : '#888';

    const limiterSwitchLabel = document.createElement('label');
    limiterSwitchLabel.className = 'yt-eq-switch';
    const limiterSwitchInput = document.createElement('input');
    limiterSwitchInput.type = 'checkbox';
    limiterSwitchInput.checked = eqSettings.limiterEnabled;
    const limiterSwitchSpan = document.createElement('span');
    limiterSwitchSpan.className = 'yt-eq-slider-toggle';

    limiterSwitchInput.addEventListener('change', (e) => {
        eqSettings.limiterEnabled = e.target.checked;
        saveSettings();
        applyLimiterSettings();
        limiterStatusSpan.style.color = e.target.checked ? '#e8e8e8' : '#888';
    });

    limiterSwitchLabel.appendChild(limiterSwitchInput);
    limiterSwitchLabel.appendChild(limiterSwitchSpan);

    limiterWrapper.appendChild(limiterStatusSpan);
    limiterWrapper.appendChild(limiterSwitchLabel);

    footerLeft.appendChild(normalizerWrapper);
    footerLeft.appendChild(limiterWrapper);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'yt-eq-reset-btn';
    resetBtn.textContent = getMsg('reset');
    resetBtn.onclick = () => {
        eqSettings.preamp = 0;
        eqSettings.bands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        eqSettings.activePreset = 'Flat';
        applyEQSettingsToNodes();
        basicKnobs.forEach(k => k.render());
        proSliders.forEach(s => s.render());
        renderPresetOptions();
        updateDeleteBtnVisibility('Flat');
        saveSettings();
    };

    footer.appendChild(footerLeft);
    footer.appendChild(resetBtn);

    // Sync UI when settings arrive asynchronously or change in another tab
    refreshUIFromSettings = () => {
        if (!eqContainer) return;
        const isBasic = eqSettings.mode === 'basic';
        btnBasic.classList.toggle('active', isBasic);
        btnPro.classList.toggle('active', !isBasic);
        basicWrapper.classList.toggle('active', isBasic);
        proWrapper.classList.toggle('active', !isBasic);

        renderPresetOptions();
        updateDeleteBtnVisibility(eqSettings.activePreset);
        syncAllControls();

        switchInput.checked = eqSettings.normalizerEnabled;
        updateNormalizerUI();

        limiterSwitchInput.checked = eqSettings.limiterEnabled;
        limiterStatusSpan.style.color = eqSettings.limiterEnabled ? '#e8e8e8' : '#888';
    };

    // --- Body Views Assembly ---
    const bodyWrapper = document.createElement('div');
    bodyWrapper.className = 'yt-eq-body-wrapper';

    const eqBody = document.createElement('div');
    eqBody.className = 'yt-eq-eq-body';
    eqBody.appendChild(presetContainer);
    eqBody.appendChild(basicWrapper);
    eqBody.appendChild(proWrapper);
    eqBody.appendChild(footer);

    bodyWrapper.appendChild(eqBody);
    bodyWrapper.appendChild(visualizerContainer);

    eqContainer.appendChild(header);
    eqContainer.appendChild(bodyWrapper);

    targetParent.appendChild(eqContainer);

    // Setup initial state visually
    eqContainer.classList.remove('yt-eq-visible');

    // Click outside to close (attached once globally)
    setupClickOutside();

    // update status right away if loudness is already known
    applyNormalizerGain();
}

let isModalDialogOpen = false;
let clickOutsideAttached = false;
function setupClickOutside() {
    if (clickOutsideAttached) return;
    clickOutsideAttached = true;

    // Close when clicking inside the page but outside the EQ panel
    // Capture phase ensures clicking other YouTube controls (settings, player, captions) closes EQ first
    document.addEventListener('click', (e) => {
        if (!eqContainer || !eqContainer.classList.contains('yt-eq-visible')) return;

        const isClickInsideEQ = eqContainer.contains(e.target);
        const toggleBtn = document.getElementById('ytp-eq-button');
        const isClickOnToggle = toggleBtn && (toggleBtn === e.target || toggleBtn.contains(e.target));

        // Don't close if clicking inside container or on toggle button
        if (!isClickInsideEQ && !isClickOnToggle) {
            setEQVisible(false);
        }
    }, true);

    // Close when clicking outside the browser window (window loses focus) or switching apps/windows
    window.addEventListener('blur', () => {
        if (isModalDialogOpen) return;
        if (eqContainer && eqContainer.classList.contains('yt-eq-visible')) {
            setEQVisible(false);
        }
    });

    // Close when switching tabs
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && eqContainer && eqContainer.classList.contains('yt-eq-visible')) {
            setEQVisible(false);
        }
    });
}

function injectEQButton() {
    let rightControls = null;
    if (isYTMusic) {
        rightControls = document.querySelector('ytmusic-player-bar .right-controls-buttons') ||
                        document.querySelector('ytmusic-player-bar .right-controls');
    } else {
        rightControls = document.querySelector('#movie_player .ytp-right-controls') ||
                        document.querySelector('.html5-video-player:not(#inline-preview-player) .ytp-right-controls');
    }
    if (!rightControls) return;

    const toggleHandler = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        ensureUIAttached();
        const isVisible = eqContainer && eqContainer.classList.contains('yt-eq-visible');
        setEQVisible(!isVisible);
    };

    const existingBtn = document.getElementById('ytp-eq-button');
    if (existingBtn) {
        if (rightControls.contains(existingBtn)) {
            eqToggleButton = existingBtn;
            eqToggleButton.onclick = toggleHandler;
            return;
        }
        try { existingBtn.remove(); } catch (e) {}
    }

    eqToggleButton = document.createElement('button');
    eqToggleButton.id = 'ytp-eq-button';
    eqToggleButton.className = isYTMusic 
        ? 'ytmusic-player-bar-eq-btn ytp-eq-button' 
        : 'ytp-eq-button ytp-button';
    eqToggleButton.setAttribute('title', getMsg('tooltip'));
    eqToggleButton.setAttribute('aria-label', getMsg('tooltip'));

    const svgNS = "http://www.w3.org/2000/svg";
    const btnSvg = document.createElementNS(svgNS, "svg");
    btnSvg.setAttribute("viewBox", "0 0 24 24");
    btnSvg.setAttribute("width", "100%");
    btnSvg.setAttribute("height", "100%");
    btnSvg.setAttribute("fill", isYTMusic ? "currentColor" : "#ffffff");

    const btnPath = document.createElementNS(svgNS, "path");
    btnPath.setAttribute("d", "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z");
    btnSvg.appendChild(btnPath);

    eqToggleButton.appendChild(btnSvg);
    eqToggleButton.onclick = toggleHandler;

    // Append / insert the EQ button to the right controls.
    try {
        if (!rightControls.contains(eqToggleButton)) {
            if (isYTMusic) {
                // In YouTube Music, place right after volume control (before repeat-button)
                const repeatBtn = rightControls.querySelector('#repeat-button') ||
                                  rightControls.querySelector('.repeat');
                const volumeControl = rightControls.querySelector('.volume-control') ||
                                      rightControls.querySelector('#volume');
                if (volumeControl && volumeControl.nextSibling) {
                    rightControls.insertBefore(eqToggleButton, volumeControl.nextSibling);
                } else if (repeatBtn) {
                    rightControls.insertBefore(eqToggleButton, repeatBtn);
                } else {
                    rightControls.prepend(eqToggleButton);
                }
            } else {
                // Place it at the far left of the right controls list
                rightControls.prepend(eqToggleButton);
            }
        }
    } catch (e) {
        try {
            rightControls.appendChild(eqToggleButton);
        } catch (e2) { }
    }
}

let normalizerFollowupTimer1 = null;
let normalizerFollowupTimer2 = null;
function scheduleNormalizerSync() {
    try { applyNormalizerGain(); } catch (e) {}
    clearTimeout(normalizerFollowupTimer1);
    clearTimeout(normalizerFollowupTimer2);
    normalizerFollowupTimer1 = setTimeout(() => {
        try { applyNormalizerGain(); } catch (e) {}
    }, 350);
    normalizerFollowupTimer2 = setTimeout(() => {
        try { applyNormalizerGain(); } catch (e) {}
    }, 1200);
}

// Core attachment logic with isolated try-catches so nothing blocks UI injection
function tryAttach() {
    try {
        createUI();
    } catch (e) {}
    try {
        injectEQButton();
    } catch (e) {}
    const video = getVideoElement();
    if (video) {
        try {
            if (!video.paused || (eqContainer && eqContainer.classList.contains('yt-eq-visible'))) {
                initWebAudio(video);
            }
            applyNormalizerGain();
            if (!video.dataset.ytEqAttached) {
                const onMediaPlay = () => {
                    try {
                        initWebAudio(video);
                        scheduleNormalizerSync();
                    } catch (err) {}
                };
                const onMediaLoaded = () => {
                    try {
                        if (!video.paused) initWebAudio(video);
                        scheduleNormalizerSync();
                    } catch (err) {}
                };
                const onVolumeChange = () => {
                    try {
                        applyNormalizerGain();
                    } catch (err) {}
                };
                video.addEventListener('loadedmetadata', onMediaLoaded);
                video.addEventListener('loadeddata', onMediaLoaded);
                video.addEventListener('canplay', onMediaLoaded);
                video.addEventListener('play', onMediaPlay);
                video.addEventListener('playing', onMediaPlay);
                video.addEventListener('volumechange', onVolumeChange);
                video.dataset.ytEqAttached = 'true';
            }
        } catch (e) {}
    }
}

// Initialization and Event Loops
function init() {
    loadSettings();
    setupUserGestureAudioUnlock();
    tryAttach();

    // Global capture listener to catch video play/playing/volumechange events anywhere on page (crucial for YT Music & Shorts SPA)
    ['play', 'playing'].forEach(evtName => {
        document.addEventListener(evtName, (e) => {
            if (e.target && e.target.tagName === 'VIDEO') {
                try {
                    initWebAudio(e.target);
                    scheduleNormalizerSync();
                } catch (err) {}
            }
        }, true);
    });
    document.addEventListener('volumechange', (e) => {
        if (e.target && e.target.tagName === 'VIDEO') {
            try {
                applyNormalizerGain();
            } catch (err) {}
        }
    }, true);

    // Polling fallback (stops after button is stable or 30s timeout)
    let totalChecks = 0;
    let attachedChecks = 0;
    const checkPlayer = setInterval(() => {
        totalChecks++;
        tryAttach();
        const btn = document.getElementById('ytp-eq-button');
        if (btn && ++attachedChecks > 20) {
            clearInterval(checkPlayer);
        } else if (totalChecks > 60) {
            clearInterval(checkPlayer);
        }
    }, 500);

    // MutationObserver to catch controls bar creation immediately
    try {
        const observer = new MutationObserver(() => {
            const hasButton = document.getElementById('ytp-eq-button');
            const hasControls = isYTMusic 
                ? (document.querySelector('ytmusic-player-bar .right-controls-buttons') || document.querySelector('ytmusic-player-bar .right-controls'))
                : (document.querySelector('#movie_player .ytp-right-controls') || document.querySelector('.html5-video-player:not(#inline-preview-player) .ytp-right-controls'));
            if (hasControls && !hasButton) {
                tryAttach();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}

    // YouTube Music track & player change observer (ignores 1s playback timer ticks)
    if (isYTMusic) {
        try {
            let lastTrackSignature = '';
            let trackDebounceTimer = null;
            const trackObserver = new MutationObserver(() => {
                if (!document.getElementById('ytp-eq-button')) {
                    try { injectEQButton(); } catch (err) {}
                }
                const playerBar = document.querySelector('ytmusic-player-bar');
                if (!playerBar) return;
                const titleText = playerBar.querySelector('.title')?.textContent?.trim() || '';
                const bylineText = playerBar.querySelector('.byline')?.textContent?.trim() || '';
                const sig = `${titleText}|${bylineText}`;
                if (sig && sig !== lastTrackSignature) {
                    lastTrackSignature = sig;
                    clearTimeout(trackDebounceTimer);
                    trackDebounceTimer = setTimeout(() => {
                        tryAttach();
                        applyNormalizerGain();
                        setTimeout(applyNormalizerGain, 800);
                    }, 250);
                }
            });
            const observePlayerBar = () => {
                const playerBar = document.querySelector('ytmusic-player-bar');
                if (playerBar) {
                    const middleControls = playerBar.querySelector('.middle-controls');
                    const rightControls = playerBar.querySelector('.right-controls');
                    if (middleControls && rightControls) {
                        trackObserver.observe(middleControls, { childList: true, subtree: true, characterData: true });
                        trackObserver.observe(rightControls, { childList: true, subtree: true });
                    } else {
                        trackObserver.observe(playerBar, { childList: true, subtree: true, characterData: true });
                    }
                } else {
                    setTimeout(observePlayerBar, 1000);
                }
            };
            observePlayerBar();
        } catch (e) {}
    }
}

// Synchronize state when script is re-injected or SPA navigates
window.__YT_EQ_SYNC__ = () => {
    tryAttach();
};

// SPA support
window.addEventListener('yt-navigate-finish', () => {
    setTimeout(tryAttach, 300);
    setTimeout(tryAttach, 1000);
});

window.addEventListener('yt-page-data-updated', () => {
    setTimeout(tryAttach, 300);
    setTimeout(tryAttach, 1000);
});

window.addEventListener('ytmusic-navigate', () => {
    setTimeout(tryAttach, 300);
    setTimeout(tryAttach, 1000);
});

window.addEventListener('ytmusic-player-bar-action', () => {
    setTimeout(tryAttach, 200);
});

init();

})();

