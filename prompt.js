import { estimateInputTokens } from './budget.js';

// SillyTavern 1.19.1 public/script.js membership and role enum values.
export const PROMPT_PREFIX = 'roleplay-anti-slop-manager:';
const POSITIONS = { before: 2, after: 0, chat: 1 };
const SYSTEM_ROLE = 0;

function dynamicContent(analysis, limit, maxItems) {
    const lines = [];
    const words = [];
    const wordLine = items => `近期写作提醒：减少重复使用${items.map(term => `「${term}」`).join('、')}。`;
    for (const { term } of analysis.lexicon) {
        if (words.length === maxItems) break;
        if (wordLine([...words, term]).length <= limit) words.push(term);
    }
    if (words.length) lines.push(wordLine(words));
    let count = words.length;
    const patterns = [];
    for (const pattern of analysis.patterns) {
        if (count === maxItems) break;
        const advice = `句式提醒：${pattern.advice}`;
        if ([...lines, advice].join('\n').length > limit) continue;
        lines.push(advice);
        patterns.push(pattern.id);
        count++;
    }
    return { text: lines.join('\n'), words, patterns };
}

export function buildPrompt(preset, analysis, enabled) {
    const { options, modules } = preset;
    const result = { blocks: [], length: 0, estimatedTokens: 0, omitted: [], words: [], patterns: [] };
    if (!enabled) return result;
    const groups = new Map();
    const seen = new Set();
    const keyFor = (position, depth) => `${position}:${position === 'chat' ? depth : 0}`;
    const add = (label, text, position, depth) => {
        if (!text || seen.has(text)) return;
        const key = keyFor(position, depth);
        const separatorLength = groups.has(key) ? 2 : 0;
        if (result.length + text.length + separatorLength > options.maxChars) {
            result.omitted.push(label);
            return;
        }
        const group = groups.get(key) ?? { position, depth: position === 'chat' ? depth : 0, parts: [] };
        groups.set(key, group);
        result.length += text.length + separatorLength;
        group.parts.push(text);
        seen.add(text);
    };

    const tail = options.tailEnabled ? options.tailText.trim() : '';
    if (tail) add('末端强化', tail, 'chat', 0);
    for (const module of modules) {
        if (!module.enabled) continue;
        const position = module.position === 'inherit' ? options.position : module.position;
        add(module.name, module.text.trim(), position, options.depth);
        for (const example of module.examples ?? []) {
            if (!example.enabled || !example.text.trim()) continue;
            const kind = example.kind === 'negative' ? '文风反例，仅用于识别并减少这类表达' : '文风正例';
            const name = example.name.replace(/\s+/gu, ' ').trim();
            add(`${module.name} · ${name}`, `【${kind} · ${name}】\n${example.text.trim()}`, position, options.depth);
        }
    }
    const needsSeparator = groups.has(keyFor('chat', 0)) ? 2 : 0;
    const eligible = {
        lexicon: options.dynamics.words ? analysis.lexicon : [],
        patterns: options.dynamics.patterns ? analysis.patterns : [],
    };
    const dynamic = dynamicContent(eligible, Math.min(options.dynamics.maxChars, options.maxChars - result.length - needsSeparator), options.dynamics.maxItems);
    add('动态提醒', dynamic.text, 'chat', 0);
    result.words = dynamic.words;
    result.patterns = dynamic.patterns;
    result.blocks = [...groups.values()].map(({ position, depth, parts }) => {
        if (position === 'chat' && depth === 0 && tail && parts[0] === tail) parts.push(parts.shift());
        return {
            key: `${PROMPT_PREFIX}${keyFor(position, depth)}`,
            position, positionValue: POSITIONS[position], depth, role: SYSTEM_ROLE,
            text: parts.join('\n\n'),
        };
    }).sort((a, b) => Object.keys(POSITIONS).indexOf(a.position) - Object.keys(POSITIONS).indexOf(b.position) || b.depth - a.depth);
    result.estimatedTokens = estimateInputTokens(result.blocks);
    return result;
}
