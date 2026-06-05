// Audio Context state
let audioCtx = null;
let sourceNode = null;
let preampNode = null;
let normalizerNode = null;
let limiterNode = null;
let filterNodes = [];
let currentVideoElement = null;

// EQ Configuration
const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const EQ_BANDS_LABELS = ['32Hz', '64Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'];

const I18N_FALLBACK = {
    ja: {
        title: 'イコライザー', preamp: 'Pre', low: '低音', mid: '中域', high: 'トレブル',
        normalizerOff: 'ノーマライザー無効化', normalizerOn: 'ノーマライザー', limiter: '音割れ防止 (Limiter)',
        reset: 'リセット', tooltip: 'イコライザー', modeBasic: '3-Band', modePro: '10-Band',
        preset: 'プリセット', save: '保存', customNamePrompt: 'プリセット名を入力してください:',
        presetFlat: 'フラット', presetBassBoost: '低音ブースト', presetVocal: 'ボーカル強調',
        presetCinematic: 'シネマティック', presetPodcast: 'ポッドキャスト',
        customPresetsGroup: 'カスタム', defaultPresetsGroup: 'デフォルト',
        deleteTitle: 'プリセットを削除', deleteConfirm: 'このプリセットを削除しますか？',
        customUnsaved: 'カスタム'
    },
    en: {
        title: 'Equalizer', preamp: 'Preamp', low: 'Low', mid: 'Mid', high: 'High',
        normalizerOff: 'Normalizer Disabled', normalizerOn: 'Normalizer', limiter: 'Limiter (Anti-clip)',
        reset: 'Reset', tooltip: 'Equalizer', modeBasic: '3-Band', modePro: '10-Band',
        preset: 'Preset', save: 'Save', customNamePrompt: 'Enter preset name:',
        presetFlat: 'Flat', presetBassBoost: 'Bass Boost', presetVocal: 'Vocal Clarity',
        presetCinematic: 'Cinematic', presetPodcast: 'Podcast',
        customPresetsGroup: 'Custom Presets', defaultPresetsGroup: 'Default Presets',
        deleteTitle: 'Delete Preset', deleteConfirm: 'Are you sure you want to delete this preset?',
        customUnsaved: 'Custom (Unsaved)'
    }
};

const getMsg = (key) => {
    try {
        const msg = chrome.i18n.getMessage(key);
        if (msg) return msg;
    } catch (e) {}
    const lang = navigator.language.startsWith('ja') ? 'ja' : 'en';
    return I18N_FALLBACK[lang][key] || key;
};

// Default Settings
const DEFAULT_SETTINGS = {
    preamp: 0,
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    enabled: true,
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

let eqSettings = { ...DEFAULT_SETTINGS };

// Load settings
function loadSettings() {
    try {
        const saved = localStorage.getItem('yt-eq-settings');
        if (saved) {
            try {
                eqSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
            } catch (e) {
                console.error('Failed to parse EQ settings', e);
            }
        }
    } catch (e) {
        console.warn('localStorage access denied or unavailable', e);
    }
}

// Save settings
function saveSettings() {
    try {
        localStorage.setItem('yt-eq-settings', JSON.stringify(eqSettings));
    } catch (e) {
        console.warn('localStorage access denied or unavailable', e);
    }
}

function initWebAudio(video) {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    if (currentVideoElement !== video) {
        if (sourceNode) {
            sourceNode.disconnect();
        }

        try {
            sourceNode = audioCtx.createMediaElementSource(video);

            // Create Nodes
            preampNode = audioCtx.createGain();
            normalizerNode = audioCtx.createGain();

            // Create Brickwall Limiter
            limiterNode = audioCtx.createDynamicsCompressor();
            limiterNode.threshold.value = -0.1; // Catch peaks just under 0dB
            limiterNode.knee.value = 0.0;       // Hard knee
            limiterNode.ratio.value = 20.0;     // High ratio for brickwall
            limiterNode.attack.value = 0.001;   // Very fast attack
            limiterNode.release.value = 0.050;  // Fast release

            // Create 10-band EQ
            filterNodes = EQ_BANDS.map(freq => {
                const filter = audioCtx.createBiquadFilter();
                filter.type = 'peaking';
                filter.frequency.value = freq;
                filter.Q.value = 1.41; // typical Q value
                return filter;
            });

            // Chain connections: Source -> Preamp -> Filters[] -> Normalizer -> Limiter -> Destination
            sourceNode.connect(preampNode);
            let lastNode = preampNode;

            filterNodes.forEach(filter => {
                lastNode.connect(filter);
                lastNode = filter;
            });

            lastNode.connect(normalizerNode);
            normalizerNode.connect(limiterNode);
            limiterNode.connect(audioCtx.destination);

            currentVideoElement = video;
            applyEQSettingsToNodes();
            applyLimiterSettings();

        } catch (e) {
            console.error('[YT EQ] Failed to create or connect audio nodes', e);
        }
    }
}

function applyEQSettingsToNodes() {
    if (!preampNode || filterNodes.length === 0) return;

    if (eqSettings.enabled) {
        // Math.pow(10, db / 20) for GainNode
        preampNode.gain.value = Math.pow(10, eqSettings.preamp / 20);
        filterNodes.forEach((filter, idx) => {
            filter.gain.value = eqSettings.bands[idx];
        });
    } else {
        preampNode.gain.value = 1;
        filterNodes.forEach(filter => {
            filter.gain.value = 0;
        });
    }
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
    const moviePlayer = document.getElementById('movie_player');
    if (!moviePlayer || typeof moviePlayer.getPlayerResponse !== 'function') return;

    const playerResponse = moviePlayer.getPlayerResponse();
    const config = playerResponse?.playerConfig?.audioConfig ||
        window.ytInitialPlayerResponse?.playerConfig?.audioConfig;

    const loudnessDb = config?.loudnessDb || 0;

    // Normalizer applies gain.value based on loudnessDb
    if (normalizerNode) {
        if (eqSettings.normalizerEnabled && loudnessDb > 0) {
            const gainMultiplier = Math.pow(10, loudnessDb / 20);
            normalizerNode.gain.value = gainMultiplier;
            updateNormalizerUI(loudnessDb);
        } else {
            normalizerNode.gain.value = 1;
            updateNormalizerUI(loudnessDb);
        }
    }
}

// UI DOM Elements
let eqContainer = null;
let eqToggleButton = null;
let normalizerStatusSpan = null;

function updateNormalizerUI(loudnessDb) {
    if (normalizerStatusSpan) {
        if (eqSettings.normalizerEnabled && loudnessDb > 0) {
            normalizerStatusSpan.textContent = `${getMsg('normalizerOn')} +${loudnessDb.toFixed(1)}dB`;
            normalizerStatusSpan.style.color = '#e8e8e8';
        } else {
            normalizerStatusSpan.textContent = getMsg('normalizerOff');
            normalizerStatusSpan.style.color = '#888';
        }
    }
}

function createUI() {
    if (document.getElementById('yt-eq-container')) return;

    eqContainer = document.createElement('div');
    eqContainer.id = 'yt-eq-container';
    eqContainer.className = 'yt-eq-container yt-eq-visible';

    // --- Header ---
    const header = document.createElement('div');
    header.className = 'yt-eq-header';

    const titleMain = document.createElement('div');
    titleMain.className = 'yt-eq-title-main';

    const svgNS = "http://www.w3.org/2000/svg";
    const iconSvg = document.createElementNS(svgNS, "svg");
    iconSvg.setAttribute("width", "18");
    iconSvg.setAttribute("height", "18");
    iconSvg.setAttribute("viewBox", "0 0 24 24");
    iconSvg.setAttribute("fill", "#ffffff");
    const iconPath = document.createElementNS(svgNS, "path");
    iconPath.setAttribute("d", "M12 3v9.28a4.39 4.39 0 0 0-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z");
    iconSvg.appendChild(iconPath);

    const titleText = document.createElement('span');
    titleText.className = 'yt-eq-title-text';
    titleText.textContent = getMsg('title');

    titleMain.appendChild(iconSvg);
    titleMain.appendChild(titleText);

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

    const closeBtn = document.createElement('button');
    closeBtn.className = 'yt-eq-close';
    closeBtn.textContent = '\u2715';
    closeBtn.onclick = () => {
        eqContainer.classList.remove('yt-eq-visible');
        if (eqToggleButton) eqToggleButton.classList.remove('active');
    };

    header.appendChild(titleMain);
    header.appendChild(modeToggle);
    header.appendChild(closeBtn);

    // --- Preset Controls ---
    const presetContainer = document.createElement('div');
    presetContainer.className = 'yt-eq-preset-container';

    const presetLabel = document.createElement('span');
    presetLabel.textContent = getMsg('preset') + ': ';
    presetLabel.className = 'yt-eq-preset-label';

    const presetSelect = document.createElement('select');
    presetSelect.className = 'yt-eq-preset-select';
    
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
                opt.value = p.name;
                opt.textContent = p.name;
                customOptGroup.appendChild(opt);
            });
            presetSelect.appendChild(customOptGroup);
        }

        DEFAULT_PRESETS.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = getMsg(`preset${p.id}`) || p.id;
            defaultOptGroup.appendChild(opt);
        });
        presetSelect.appendChild(defaultOptGroup);

        if (eqSettings.activePreset === 'Custom') {
            const customUnsavedOpt = document.createElement('option');
            customUnsavedOpt.value = 'Custom';
            customUnsavedOpt.textContent = getMsg('customUnsaved');
            presetSelect.insertBefore(customUnsavedOpt, presetSelect.firstChild);
        }
        
        // Custom check: if activePreset doesn't exist anymore, set to Flat
        let exists = DEFAULT_PRESETS.some(p => p.id === eqSettings.activePreset) || 
                     (eqSettings.customPresets && eqSettings.customPresets.some(p => p.name === eqSettings.activePreset)) ||
                     eqSettings.activePreset === 'Custom';
        if (!exists) eqSettings.activePreset = 'Flat';
        
        presetSelect.value = eqSettings.activePreset;
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

    const updateDeleteBtnVisibility = (val) => {
        const isCustom = eqSettings.customPresets && eqSettings.customPresets.some(p => p.name === val);
        presetDeleteBtn.style.display = isCustom ? 'flex' : 'none';
    };

    presetSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        eqSettings.activePreset = val;
        
        const defPreset = DEFAULT_PRESETS.find(p => p.id === val);
        if (defPreset) {
            applyPreset(defPreset);
        } else {
            const custPreset = eqSettings.customPresets.find(p => p.name === val);
            if (custPreset) {
                applyPreset(custPreset);
            }
        }
        
        renderPresetOptions();
        updateDeleteBtnVisibility(val);
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
    presetDeleteBtn.style.display = 'none';
    presetDeleteBtn.onclick = () => {
        if (confirm(getMsg('deleteConfirm'))) {
            eqSettings.customPresets = eqSettings.customPresets.filter(p => p.name !== eqSettings.activePreset);
            eqSettings.activePreset = 'Flat';
            saveSettings();
            renderPresetOptions();
            applyPreset(DEFAULT_PRESETS.find(p => p.id === 'Flat'));
            updateDeleteBtnVisibility('Flat');
        }
    };

    const presetSaveBtn = document.createElement('button');
    presetSaveBtn.className = 'yt-eq-preset-save';
    presetSaveBtn.textContent = getMsg('save');
    presetSaveBtn.onclick = () => {
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
            eqSettings.activePreset = newPreset.name;
            saveSettings();
            renderPresetOptions();
            updateDeleteBtnVisibility(newPreset.name);
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
    const basicContent = document.createElement('div');
    basicContent.className = 'yt-eq-basic-controls yt-eq-mode-content';
    if (eqSettings.mode === 'basic') basicContent.classList.add('active');

    const createRotaryKnob = (label, getVal, onValChange) => {
        const container = document.createElement('div');
        container.className = 'yt-eq-knob-container';

        const labelEl = document.createElement('div');
        labelEl.className = 'yt-eq-knob-label';
        labelEl.textContent = label;

        const wrapper = document.createElement('div');
        wrapper.className = 'yt-eq-knob-wrapper';

        const bg = document.createElement('div');
        bg.className = 'yt-eq-knob-bg';

        const fg = document.createElement('div');
        fg.className = 'yt-eq-knob-fg';

        const center = document.createElement('div');
        center.className = 'yt-eq-knob-center';

        const indicator = document.createElement('div');
        indicator.className = 'yt-eq-knob-indicator';

        center.appendChild(indicator);
        wrapper.appendChild(bg);
        wrapper.appendChild(fg);
        wrapper.appendChild(center);

        const valEl = document.createElement('div');
        valEl.className = 'yt-eq-knob-value';

        container.appendChild(labelEl);
        container.appendChild(wrapper);
        container.appendChild(valEl);

        let isDragging = false;
        let startY = 0;
        let startVal = 0;
        const SENSITIVITY = 0.3;

        const render = () => {
            const val = getVal();
            let pct = (val + 20) / 40;
            if (pct < 0) pct = 0;
            if (pct > 1) pct = 1;

            const fillDeg = pct * 270;
            fg.style.background = `conic-gradient(from 225deg, #ffffff ${fillDeg}deg, transparent ${fillDeg}deg)`;

            const rotDeg = -135 + (pct * 270);
            indicator.style.transform = `rotate(${rotDeg}deg)`;
            center.style.transform = `rotate(${rotDeg}deg)`;

            valEl.textContent = `${val > 0 ? '+' : ''}${val.toFixed(1)}dB`;
        };

        wrapper.addEventListener('mousedown', (e) => {
            isDragging = true;
            startY = e.clientY;
            startVal = getVal();
            document.body.style.userSelect = 'none';
            eqSettings.activePreset = 'Custom'; // Modify invalidates preset
            renderPresetOptions();
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dy = startY - e.clientY;
            const newVal = Math.max(-20, Math.min(20, startVal + (dy * SENSITIVITY)));
            onValChange(newVal);
            render();
            proSliders.forEach(s => s.render()); // Sync pro sliders
        });

        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.userSelect = '';
                saveSettings();
            }
        });

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
    const proContent = document.createElement('div');
    proContent.className = 'yt-eq-pro-controls yt-eq-mode-content';
    if (eqSettings.mode === 'pro') proContent.classList.add('active');

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
            valEl.textContent = `${val > 0 ? '+' : ''}${val.toFixed(1)}`;
            
            // Fill background dynamically for webkit slider
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
        });

        slider.addEventListener('change', () => {
            saveSettings();
        });

        // Double click to reset
        slider.addEventListener('dblclick', () => {
            onValChange(0);
            render();
            basicKnobs.forEach(k => k.render());
            eqSettings.activePreset = 'Custom';
            renderPresetOptions();
            saveSettings();
        });

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
        eqSettings.mode = mode;
        saveSettings();
        if (mode === 'basic') {
            btnBasic.classList.add('active');
            btnPro.classList.remove('active');
            basicContent.classList.add('active');
            proContent.classList.remove('active');
        } else {
            btnPro.classList.add('active');
            btnBasic.classList.remove('active');
            proContent.classList.add('active');
            basicContent.classList.remove('active');
        }
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
    normalizerStatusSpan.textContent = getMsg('normalizerOff');

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
        saveSettings();
    };

    footer.appendChild(footerLeft);
    footer.appendChild(resetBtn);

    eqContainer.appendChild(header);
    eqContainer.appendChild(presetContainer);
    eqContainer.appendChild(basicContent);
    eqContainer.appendChild(proContent);
    eqContainer.appendChild(footer);

    const moviePlayer = document.getElementById('movie_player') || document.body;
    moviePlayer.appendChild(eqContainer);

    // Setup initial state visually
    eqContainer.classList.remove('yt-eq-visible');

    // Click outside to close
    document.addEventListener('click', (e) => {
        if (!eqContainer.classList.contains('yt-eq-visible')) return;

        const isClickInsideEQ = eqContainer.contains(e.target);
        const isClickOnToggle = eqToggleButton && eqToggleButton.contains(e.target);
        
        // Don't close if clicking a prompt (which blocks UI anyway)

        if (!isClickInsideEQ && !isClickOnToggle) {
            eqContainer.classList.remove('yt-eq-visible');
            if (eqToggleButton) eqToggleButton.classList.remove('active');
        }
    });

    // update status right away if loudness is already known
    applyNormalizerGain();
}

function injectEQButton() {
    if (document.getElementById('ytp-eq-button')) return;

    const rightControls = document.querySelector('.ytp-right-controls');
    if (!rightControls) return;

    eqToggleButton = document.createElement('button');
    eqToggleButton.id = 'ytp-eq-button';
    eqToggleButton.className = 'ytp-eq-button ytp-button';
    eqToggleButton.setAttribute('title', getMsg('tooltip'));

    const svgNS = "http://www.w3.org/2000/svg";
    const btnSvg = document.createElementNS(svgNS, "svg");
    btnSvg.setAttribute("viewBox", "0 0 24 24");
    btnSvg.setAttribute("width", "100%");
    btnSvg.setAttribute("height", "100%");
    btnSvg.setAttribute("fill", "#ffffff");

    const btnPath = document.createElementNS(svgNS, "path");
    btnPath.setAttribute("d", "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z");
    btnSvg.appendChild(btnPath);

    eqToggleButton.appendChild(btnSvg);

    eqToggleButton.onclick = () => {
        if (!audioCtx) {
            // Attempt initialization if not done yet
            const video = document.querySelector('video');
            if (video) initWebAudio(video);
        }
        const isVisible = eqContainer.classList.contains('yt-eq-visible');
        if (isVisible) {
            eqContainer.classList.remove('yt-eq-visible');
            eqToggleButton.classList.remove('active');
        } else {
            eqContainer.classList.add('yt-eq-visible');
            eqToggleButton.classList.add('active');
        }
    };

    // Append the EQ button to the right controls.
    try {
        if (!rightControls.contains(eqToggleButton)) {
            // Place it at the far left of the right controls list
            rightControls.prepend(eqToggleButton);
        }
    } catch (e) {
        console.warn('[YT EQ] Failed to prepend button, falling back to append', e);
        try {
            rightControls.appendChild(eqToggleButton);
        } catch (e2) { }
    }
}

// Initialization and Event Loops
function init() {
    loadSettings();

    let checkCount = 0;
    const checkPlayer = setInterval(() => {
        const video = document.querySelector('video');
        const controls = document.querySelector('.ytp-right-controls');

        if (video && controls) {
            clearInterval(checkPlayer);

            initWebAudio(video);
            applyNormalizerGain();

            createUI();
            injectEQButton();

            if (!video.dataset.ytEqAttached) {
                video.addEventListener('loadeddata', () => {
                    initWebAudio(video);
                    applyNormalizerGain();
                });
                video.dataset.ytEqAttached = 'true';
            }
        }

        if (++checkCount > 100) clearInterval(checkPlayer);
    }, 500);
}

// SPA support
window.addEventListener('yt-navigate-finish', () => {
    setTimeout(() => {
        const video = document.querySelector('video');
        if (video) {
            initWebAudio(video);
            applyNormalizerGain();
        }
        injectEQButton(); // Re-inject if control bar was fully recreated
    }, 800);
});

window.addEventListener('yt-page-data-updated', () => {
    setTimeout(() => {
        const video = document.querySelector('video');
        if (video) {
            initWebAudio(video);
            applyNormalizerGain();
        }
    }, 800);
});

init();
