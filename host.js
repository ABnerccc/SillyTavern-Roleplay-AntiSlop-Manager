import { analyzeChat } from './analysis.js';
import { effectivePreset } from './budget.js';
import { defaultSettings } from './defaults.js';
import { buildPrompt, PROMPT_PREFIX } from './prompt.js';
import { activePreset, loadSettings, SETTINGS_KEY } from './settings.js';

const ROLEPLAY_TYPES = new Set(['normal', 'regenerate', 'swipe', 'continue', 'append']);
const REFRESH_EVENTS = [
    'MESSAGE_RECEIVED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED',
    'CHARACTER_MESSAGE_RENDERED', 'CHARACTER_EDITED', 'PERSONA_CHANGED',
];

function getKnownNames(context) {
    const { characters = [], groups = [], groupId, characterId } = context;
    const group = groupId == null ? null : groups.find(item => String(item.id) === String(groupId));
    const members = new Set(group?.members ?? []);
    return [context.name1, context.name2, characters[characterId]?.name,
        ...characters.filter(character => members.has(character.avatar)).map(character => character.name)];
}

function removeInjection(context, key) {
    context.setExtensionPrompt(key, '', -1, 0, false, 0);
    if (context.extensionPrompts) delete context.extensionPrompts[key];
}

export function createController(getContext, onView = () => {}) {
    const initial = getContext();
    let settings;
    let startupError = '';
    try {
        settings = loadSettings(initial.extensionSettings[SETTINGS_KEY]);
    } catch {
        settings = defaultSettings();
        settings.enabled = false;
        startupError = '原有配置无法读取。扩展暂时关闭。导入有效配置或修改设置后会保存当前配置。';
    }
    const listeners = [];
    const keys = new Set();
    let generationActive = false;
    let view;
    let analysis;
    let analysisOptions;
    let revision = 0;
    let evaluatedRevision = -1;

    function clearInjections() {
        const context = getContext();
        for (const key of Object.keys(context.extensionPrompts ?? {})) {
            if (key.startsWith(PROMPT_PREFIX)) keys.add(key);
        }
        for (const key of keys) removeInjection(context, key);
        keys.clear();
    }

    function applyInjections(blocks) {
        const context = getContext();
        const nextKeys = new Set(blocks.map(block => block.key));
        for (const key of keys) {
            if (!nextKeys.has(key)) removeInjection(context, key);
        }
        for (const block of blocks) {
            context.setExtensionPrompt(block.key, block.text, block.positionValue, block.depth, false, block.role);
        }
        keys.clear();
        for (const key of nextKeys) keys.add(key);
    }

    function refresh() {
        const context = getContext();
        const preset = activePreset(settings);
        const effective = effectivePreset(preset, settings.consumptionLevel);
        const optionsKey = JSON.stringify(effective.options.dynamics);
        if (analysisOptions !== optionsKey || evaluatedRevision !== revision) {
            analysis = analyzeChat(context.chat ?? [], getKnownNames(context), effective.options.dynamics);
            analysisOptions = optionsKey;
            evaluatedRevision = revision;
        }
        const prompt = buildPrompt(effective, analysis, settings.enabled);
        if (generationActive) applyInjections(prompt.blocks);
        view = { settings, preset, effective, analysis, prompt, startupError };
        onView(view);
    }

    const chatUpdate = () => {
        revision++;
        refresh();
    };
    const end = () => {
        generationActive = false;
        clearInjections();
    };
    const begin = (type, _options, _dryRun) => {
        // Undefined is SillyTavern's normal default. Quiet and impersonation must leave the registry empty.
        generationActive = ROLEPLAY_TYPES.has(type ?? 'normal');
        if (!generationActive) end();
        chatUpdate();
    };
    const listen = (name, callback, last = false) => {
        const type = initial.eventTypes[name];
        if (!type) return;
        if (last && typeof initial.eventSource.makeLast === 'function') initial.eventSource.makeLast(type, callback);
        else initial.eventSource.on(type, callback);
        listeners.push([type, callback]);
    };

    end();
    listen('GENERATION_AFTER_COMMANDS', begin, true);
    listen('GENERATE_AFTER_DATA', (_payload, dryRun) => { if (dryRun) end(); }, true);
    listen('GENERATION_ENDED', end);
    listen('GENERATION_STOPPED', end);
    listen('CHAT_CHANGED', () => { end(); chatUpdate(); });
    for (const event of REFRESH_EVENTS) listen(event, chatUpdate);
    refresh();

    return {
        get view() { return view; },
        change(update) {
            settings = typeof update === 'function' ? (update(settings, activePreset(settings)) ?? settings) : update;
            const context = getContext();
            context.extensionSettings[SETTINGS_KEY] = settings;
            context.saveSettingsDebounced();
            startupError = '';
            if (!settings.enabled) clearInjections();
            refresh();
        },
        dispose() {
            end();
            for (const [event, callback] of listeners) initial.eventSource.removeListener(event, callback);
        },
    };
}
