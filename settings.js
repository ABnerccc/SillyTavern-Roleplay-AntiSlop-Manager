import { DEFAULT_OPTIONS, defaultSettings } from './defaults.js';

export const SETTINGS_KEY = 'roleplay_anti_slop_manager';
export const POSITIONS = { before: '故事提示词前', after: '故事提示词后', chat: '聊天内（指定深度）' };
export const MAX_CONFIG_SIZE = 4 * 1024 * 1024;
export const MAX_PRESETS = 16;
export const MAX_MODULES = 64;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = (value, fallback, max) => typeof value === 'string' ? value.slice(0, max).toWellFormed() : fallback;
const boolean = (value, fallback) => typeof value === 'boolean' ? value : fallback;

function number(value, fallback, min, max, integer = true) {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, integer ? Math.round(value) : value));
}

export function normalizeTerm(value) {
    return value.normalize('NFKC').trim().toLowerCase();
}

export function listOfTerms(value, names = false) {
    const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\n,，、;；]+/u) : [];
    const limit = names ? /^[\p{L}\p{N} ·.'’_-]{1,48}$/u : /^\p{Script=Han}{1,16}$/u;
    return [...new Set(list.filter(item => typeof item === 'string').map(normalizeTerm)
        .filter(item => limit.test(item)))].slice(0, 200);
}

export function normalizeOptions(input = {}) {
    const original = DEFAULT_OPTIONS;
    const options = isObject(input) ? input : {};
    const dynamics = isObject(options.dynamics) ? options.dynamics : {};
    const defaults = original.dynamics;
    return {
        position: Object.hasOwn(POSITIONS, options.position) ? options.position : original.position,
        depth: number(options.depth, original.depth, 0, 100),
        maxChars: number(options.maxChars, original.maxChars, 160, 16000),
        tailEnabled: boolean(options.tailEnabled, original.tailEnabled),
        tailText: string(options.tailText, original.tailText, 4000),
        dynamics: {
            words: boolean(dynamics.words, defaults.words),
            patterns: boolean(dynamics.patterns, defaults.patterns),
            window: number(dynamics.window, defaults.window, 1, 60),
            minReplies: number(dynamics.minReplies, defaults.minReplies, 1, 60),
            decay: number(dynamics.decay, defaults.decay, 0.1, 1, false),
            maxChars: number(dynamics.maxChars, defaults.maxChars, 0, 1200),
            maxItems: number(dynamics.maxItems, defaults.maxItems, 0, 30),
            blacklist: listOfTerms(dynamics.blacklist),
            whitelist: listOfTerms(dynamics.whitelist),
            names: listOfTerms(dynamics.names, true),
        },
    };
}

function validId(value) {
    return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/u.test(value);
}

function normalizeModule(item, ids) {
    if (!isObject(item) || !validId(item.id) || ids.has(item.id) || typeof item.name !== 'string' || typeof item.text !== 'string') {
        throw new Error('配置含有无效或重复的模块。');
    }
    ids.add(item.id);
    return {
        id: item.id,
        name: string(item.name, '', 80).trim() || '未命名模块',
        text: string(item.text, '', 8000),
        enabled: boolean(item.enabled, true),
        position: Object.hasOwn(POSITIONS, item.position) ? item.position : 'inherit',
        ...(item.id === 'examples' || Object.hasOwn(item, 'positive') || Object.hasOwn(item, 'negative') ? {
            positive: string(item.positive, '', 8000), negative: string(item.negative, '', 8000),
        } : {}),
    };
}

export function validateSettings(input) {
    if (!isObject(input) || input.version !== 1 || typeof input.enabled !== 'boolean' ||
        !Array.isArray(input.presets) || input.presets.length < 1 || input.presets.length > MAX_PRESETS) {
        throw new Error('请选择本扩展导出的第 1 版配置。');
    }
    const ids = new Set();
    const presets = input.presets.map(preset => {
        if (!isObject(preset) || !validId(preset.id) || ids.has(preset.id) || typeof preset.name !== 'string' ||
            !Array.isArray(preset.modules) || preset.modules.length > MAX_MODULES || !isObject(preset.options)) {
            throw new Error('配置含有无效或重复的预设。');
        }
        ids.add(preset.id);
        const moduleIds = new Set();
        return {
            id: preset.id, name: string(preset.name, '', 80).trim() || '未命名预设',
            modules: preset.modules.map(module => normalizeModule(module, moduleIds)),
            options: normalizeOptions(preset.options),
        };
    });
    if (!ids.has(input.activePresetId)) throw new Error('当前预设在文件中不存在。');
    return { version: 1, enabled: input.enabled, activePresetId: input.activePresetId, presets };
}

export function loadSettings(input) {
    return input === undefined ? defaultSettings() : validateSettings(input);
}

export function activePreset(settings) {
    return settings.presets.find(preset => preset.id === settings.activePresetId);
}

export function parseSettings(json) {
    if (new TextEncoder().encode(json).length > MAX_CONFIG_SIZE) throw new Error('配置文件不能超过 4 MB。');
    let input;
    try {
        input = JSON.parse(json.replace(/^\uFEFF/u, ''));
    } catch {
        throw new Error('配置文件不是有效的 JSON。');
    }
    return validateSettings(input);
}
