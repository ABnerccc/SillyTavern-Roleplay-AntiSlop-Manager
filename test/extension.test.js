import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeChat } from '../analysis.js';
import { defaultSettings } from '../defaults.js';
import { createController } from '../host.js';
import { buildPrompt, PROMPT_PREFIX } from '../prompt.js';
import { activePreset, normalizeOptions, parseSettings, SETTINGS_KEY, validateSettings } from '../settings.js';

const assistant = (mes, name = '林秋') => ({ mes, name, is_user: false });
const user = mes => ({ mes, name: '苏河', is_user: true });
const dynamics = overrides => normalizeOptions({ dynamics: overrides }).dynamics;
const empty = { lexicon: [], patterns: [] };
const ownEntries = context => Object.entries(context.extensionPrompts).filter(([key]) => key.startsWith(PROMPT_PREFIX));

test('内置预设含按原排名排列的 22 个独立模块和正反例', () => {
    const settings = defaultSettings();
    const preset = activePreset(settings);
    assert.deepEqual(preset.modules.map(module => module.name), [
        '角色自主性', '高质量文风示例', '反过度文学化', '自然对白', '反讨好玩家', '反上下文循环', '反情绪戏剧化',
        '反全知视角', '去模板化句式', '展示而非解释', '反过度正面化', '去八股词汇', '禁止代替玩家', '自然剧情节奏',
        '反复述玩家', '自然开头与结尾', '心理复杂性', '反剧情便利性', '关系渐进式发展', '世界自主运转', '日常感与自然幽默',
        '物理与空间真实性',
    ]);
    assert.deepEqual(preset.modules.map(module => module.enabled), [...Array(16).fill(true), ...Array(6).fill(false)]);
    assert.ok(preset.modules.every(module => module.text.trim()));
    assert.ok(preset.modules[1].positive && preset.modules[1].negative);
    preset.modules[0].text = '自定义';
    assert.notEqual(settings.presets[1].modules[0].text, '自定义');
});

test('JSON 往返保留设置、预设顺序、示例和注入位置，并拒绝错误结构', () => {
    const settings = defaultSettings();
    settings.enabled = false;
    settings.activePresetId = 'light';
    const preset = activePreset(settings);
    preset.modules.reverse();
    preset.modules[0].position = 'before';
    preset.options.dynamics.blacklist = ['特殊用词'];
    assert.deepEqual(parseSettings('\uFEFF' + JSON.stringify(settings)), settings);
    assert.throws(() => parseSettings('{'), /JSON/);
    assert.throws(() => validateSettings({ ...settings, version: 2 }), /第 1 版/);
    assert.throws(() => validateSettings({ ...settings, activePresetId: 'gone' }), /不存在/);
    settings.presets[0].modules.push(settings.presets[0].modules[0]);
    assert.throws(() => validateSettings(settings), /重复的模块/);
});

test('输入范围、列表去重、排除异常词和额外角色名', () => {
    const options = normalizeOptions({ depth: -4, maxChars: 50000, position: '__proto__', dynamics: {
        minReplies: 1000, decay: -2, blacklist: '眼底闪过，眼底闪过\n改用。\n林秋',
        whitelist: ['空气', 'drop-in', 3], names: 'Ａｖａ\n陈·格莱',
    } });
    assert.equal(options.depth, 0);
    assert.equal(options.maxChars, 16000);
    assert.equal(options.position, 'after');
    assert.equal(options.dynamics.minReplies, 60);
    assert.equal(options.dynamics.decay, 0.1);
    assert.deepEqual(options.dynamics.blacklist, ['眼底闪过', '林秋']);
    assert.deepEqual(options.dynamics.whitelist, ['空气']);
    assert.deepEqual(options.dynamics.names, ['ava', '陈·格莱']);
});

test('只统计最近 N 条中文角色回复，过滤常见词、专名、白名单、代码和思考文本', () => {
    const chat = Object.freeze([
        assistant('命运的齿轮转了。'), assistant('命运的齿轮转了。'),
        assistant('林秋和苏河看见橘子。眼底闪过一丝不悦。那不是寒风，而是窗开了。空气凝固。'),
        user('这是玩家专用词。空气凝固。'), assistant('Nothing in Chinese.'),
        { ...assistant('系统专用词空气凝固。'), is_system: true },
        assistant('林秋说这些橘子还没熟。眼底闪过疑问。那不是敲门，而是水管响。空气凝固。'),
        assistant('<think>空气凝固，这些是思考</think>```空气凝固```'),
    ].map(Object.freeze));
    const before = JSON.stringify(chat);
    const result = analyzeChat(chat, ['苏河'], dynamics({ window: 2, whitelist: ['空气'], blacklist: ['未出现词', '空气凝固', '林秋'] }));
    assert.equal(result.sampleSize, 2);
    assert.deepEqual(result.lexicon.map(item => item.term), ['未出现词', '眼底闪过']);
    assert.deepEqual(result.patterns.map(item => item.id), ['negation']);
    assert.equal(result.frequencies.find(item => item.term === '橘子').type, 'normal');
    assert.ok(result.frequencies.every(item => !/命运|空气|林秋|苏河|这些|专用词/.test(item.term)));
    assert.equal(JSON.stringify(chat), before);
});

test('同一回复内的多次命中不能达成阈值，旧回复按轮衰减，纯对白不计入句式', () => {
    const chat = [
        assistant('眼底闪过疑问。带着一丝犹豫向前。'), assistant('眼底闪过好奇。'),
        assistant('不易察觉，不易察觉，不易察觉。'), assistant('「那不是仓库，而是菜市场。」'),
        assistant('「这不是苹果，而是萝卜。」眼底闪过疑问。'),
    ];
    const result = analyzeChat(chat, [], dynamics({ decay: 0.5 }));
    const repeated = result.lexicon.find(item => item.term === '眼底闪过');
    assert.equal(repeated.replies, 3);
    assert.equal(repeated.score, 1 + 0.5 ** 3 + 0.5 ** 4);
    assert.ok(!result.frequencies.some(item => item.term === '不易察觉'));
    assert.ok(!result.patterns.some(item => item.id === 'negation'));
    assert.equal(analyzeChat(chat, [], dynamics({ window: 2 })).lexicon.length, 0);
});

test('动态普通词仅供统计，重复叙事短语可以自动进入词库', () => {
    const chat = [assistant('那只鹦鹉微微垂眼。'), assistant('鹦鹉微微垂眼后才伸嘴。')];
    const { frequencies, lexicon } = analyzeChat(chat, [], dynamics());
    assert.equal(frequencies.find(item => item.term === '鹦鹉').type, 'normal');
    assert.ok(!lexicon.some(item => item.term === '鹦鹉'));
    assert.ok(lexicon.some(item => item.type === 'narrative' && item.term.startsWith('微微垂')));
});

test('相同位置只建一个注入，深度 0 的末端强化排在本扩展最后', () => {
    const preset = activePreset(defaultSettings());
    preset.options.position = 'chat';
    preset.options.depth = 0;
    preset.options.tailText = '最后检查';
    const newModule = (name, text, position) => ({ id: name, name, text, position, enabled: true });
    preset.modules = [newModule('a', '第一个模块', 'inherit'), newModule('b', '第二个模块', 'chat'),
        newModule('c', '第一个模块', 'before'), newModule('d', '故事之前', 'before'), newModule('e', '故事之后', 'after')];
    const prompt = buildPrompt(preset, { lexicon: [{ term: '眼底闪过' }], patterns: [] }, true);
    assert.deepEqual(prompt.blocks.map(block => [block.positionValue, block.depth, block.role]), [[2, 0, 0], [0, 0, 0], [1, 0, 0]]);
    assert.match(prompt.blocks[2].text, /^第一个模块\n\n第二个模块[\s\S]*最后检查$/u);
    assert.equal(prompt.blocks.flatMap(block => block.text.match(/第一个模块/gu) ?? []).length, 1);
    assert.equal(new Set(prompt.blocks.map(block => block.key)).size, 3);
    assert.equal(buildPrompt(preset, empty, false).blocks.length, 0);
});

test('总体和动态字符上限会保留完整提示，不截断正反例或句式', () => {
    const preset = activePreset(defaultSettings());
    preset.options.maxChars = 160;
    preset.options.dynamics.maxChars = 24;
    preset.options.dynamics.maxItems = 1;
    const prompt = buildPrompt(preset, { lexicon: [{ term: '眼底闪过' }, { term: '喉结滚动' }],
        patterns: [{ id: 'long', advice: '长句提醒'.repeat(30) }] }, true);
    assert.equal(prompt.length, prompt.blocks.reduce((sum, block) => sum + block.text.length, 0));
    assert.ok(prompt.length <= 160);
    assert.ok(prompt.omitted.includes('高质量文风示例'));
    assert.deepEqual(prompt.patterns, []);
    assert.ok(prompt.words.length <= 1);
    assert.ok(prompt.blocks.some(block => block.text.endsWith(preset.options.tailText)));
});

function mockHost() {
    const eventTypes = Object.fromEntries(['GENERATION_AFTER_COMMANDS', 'GENERATE_AFTER_DATA', 'GENERATION_ENDED', 'GENERATION_STOPPED',
        'CHAT_CHANGED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'MESSAGE_RECEIVED',
        'CHARACTER_MESSAGE_RENDERED', 'CHARACTER_EDITED', 'PERSONA_CHANGED'].map(name => [name, name]));
    const callbacks = new Map();
    let saves = 0;
    const on = (event, callback) => callbacks.set(event, [...(callbacks.get(event) ?? []), callback]);
    const context = {
        eventTypes, extensionSettings: {}, extensionPrompts: { other: { value: '其他扩展' } },
        chat: [], characters: [], groups: [],
        eventSource: { on, makeLast: on, removeListener(event, callback) {
            callbacks.set(event, callbacks.get(event).filter(item => item !== callback));
        } },
        setExtensionPrompt(key, value, position, depth, scan = false, role = 0) {
            context.extensionPrompts[key] = { value, position, depth, scan, role };
        },
        saveSettingsDebounced() { saves++; },
    };
    return { context, emit: (event, ...args) => (callbacks.get(event) ?? []).forEach(fn => fn(...args)), saves: () => saves };
}

test('生成和预览使用相同内容，重复发送、换位置、禁用和结束时清理注册项', () => {
    const { context, emit, saves } = mockHost();
    const instance = createController(() => ({ ...context }));
    assert.equal(ownEntries(context).length, 0);
    assert.ok(instance.view.prompt.blocks.length > 0);
    emit('GENERATION_AFTER_COMMANDS', 'normal', {}, true);
    const registered = ownEntries(context);
    assert.equal(registered.length, instance.view.prompt.blocks.length);
    assert.deepEqual(Object.values(Object.fromEntries(registered)).map(entry => entry.value).sort(), instance.view.prompt.blocks.map(block => block.text).sort());
    assert.ok(registered.every(([, entry]) => entry.scan === false));
    emit('GENERATE_AFTER_DATA', {}, true);
    assert.equal(ownEntries(context).length, 0);
    emit('GENERATION_AFTER_COMMANDS', 'normal', {}, false);
    emit('GENERATION_AFTER_COMMANDS', 'normal', {}, false);
    assert.deepEqual(ownEntries(context), registered);
    instance.change((_, preset) => { preset.options.position = 'before'; });
    assert.ok(!ownEntries(context).some(([key]) => key.endsWith('after:0')));
    instance.change(settings => { settings.enabled = false; });
    assert.equal(ownEntries(context).length, 0);
    assert.equal(instance.view.prompt.blocks.length, 0);
    instance.change(settings => { settings.enabled = true; });
    emit('GENERATION_AFTER_COMMANDS', 'quiet', {}, false);
    assert.equal(ownEntries(context).length, 0);
    emit('GENERATION_AFTER_COMMANDS', 'impersonate', {}, false);
    assert.equal(ownEntries(context).length, 0);
    emit('GENERATION_AFTER_COMMANDS', 'swipe', {}, false);
    assert.ok(ownEntries(context).length);
    emit('GENERATION_STOPPED');
    assert.equal(ownEntries(context).length, 0);
    emit('GENERATION_AFTER_COMMANDS', 'continue', {}, false);
    assert.ok(ownEntries(context).length);
    emit('GENERATION_ENDED');
    assert.equal(ownEntries(context).length, 0);
    assert.equal(saves(), 3);
    assert.equal(context.extensionSettings[SETTINGS_KEY].enabled, true);
    assert.equal(context.extensionPrompts.other.value, '其他扩展');
    instance.dispose();
    emit('GENERATION_AFTER_COMMANDS', 'normal', {}, false);
    assert.equal(ownEntries(context).length, 0);
});

test('聊天切换和修改重新统计，不修改聊天内容，持久化配置可重新加载', () => {
    const { context, emit } = mockHost();
    context.chat = Object.freeze([assistant('眼底闪过疑问。'), assistant('眼底闪过好奇。')].map(Object.freeze));
    const instance = createController(() => context);
    assert.ok(instance.view.prompt.words.includes('眼底闪过'));
    emit('GENERATION_AFTER_COMMANDS', 'normal');
    assert.ok(ownEntries(context).length);
    context.chat = Object.freeze([assistant('新聊天。')].map(Object.freeze));
    emit('CHAT_CHANGED');
    assert.equal(ownEntries(context).length, 0);
    assert.deepEqual(instance.view.prompt.words, []);
    context.chat = [assistant('新聊天。'), assistant('眼底闪过疑问。'), assistant('眼底闪过好奇。')];
    emit('MESSAGE_EDITED');
    assert.ok(instance.view.prompt.words.includes('眼底闪过'));
    instance.change(settings => { settings.activePresetId = 'light'; });
    instance.dispose();
    const reloaded = createController(() => context);
    assert.equal(reloaded.view.preset.id, 'light');
});
