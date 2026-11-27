import { normalizeTerm } from './settings.js';

const HAN = /\p{Script=Han}/u;
const HAN_TERM = /^\p{Script=Han}{2,10}$/u;
const HAN_RUNS = /\p{Script=Han}+/gu;
const STOP = new Set(`我们 你们 他们 她们 它们 这个 那个 这些 那些 什么 怎么 为什么 因为 所以 但是 如果 只是 还是 以及 然后 可以 已经 没有 一直 起来 下去 过去 回来 以后 之前 现在 这里 那里 自己 知道 觉得 看到 看见 听到 听见 说话 点头 摇头 声音 时候 东西 一点 一下 一些 一种 一个 两个 那样 这样 只要 当然 不过 可能 确实 应该 对方 彼此 两人 对面 旁边`.split(' '));
const SEEDS = `一抹弧度 不易察觉 意味深长 难以言喻 眼底闪过 眼中闪过 空气凝固 空气仿佛凝固 命运的齿轮 悄然转动 呼吸一滞 薄唇轻启 嘴角勾起 眼神晦暗 晦暗不明 划过一丝 泛起涟漪 如释重负 嘴角微扬 喉结滚动 声音沙哑 几不可察 指尖微颤 无声地叹了口气 低笑一声 目光幽深 带着几分 染上一层 不容置疑 无法抗拒 久久未语`.split(' ');
const STYLE_PHRASE = /^(?:(?:微微|轻轻|缓缓|悄然|不自觉|下意识|不经意|若有若无)(?:地)?(?:抬|垂|偏|侧|皱|眯|颤|笑|叹|勾|顿|滚|收|握|攥)|(?:眼底|眼眸|眼神|眸光|嘴角|指尖|嗓音|尾音)(?:闪|掠|浮|勾|扬|颤|染|泄|溢))/u;

// Every expression is static and bounded to a sentence or short group of clauses.
const PATTERNS = [
    ['negation', '否定后转折', '减少「不是……而是……」式解释，直接写观察或动作。', /(?:并?不是|并?非)[^。！？!?\n]{1,32}[，,]\s*(?:而是|更像|只不过|只是|却)/gu],
    ['as-if', '仿佛式氛围描写', '减少「仿佛／像是……」式虚设氛围，落到具体声音、物件或动作。', /(?:好像|仿佛|像是|宛如)[^。！？!?\n，,]{3,32}/gu],
    ['not-by-choice', '下意识的动作', '少用「不由得／下意识地」引出动作，直接写人物行动。', /(?:不由自主地?|不由得|下意识地?)[^。！？!?\n，,]{1,18}/gu],
    ['trace', '带着一丝的语气描写', '减少「带着一丝／透着几分」式语气标签，让对白和动作承担语气。', /(?:带着|透着|含着|染上|掠过|闪过)(?:一丝|一抹|几分|一层)[^。！？!?\n，,]{1,14}/gu],
    ['ambient', '一时之间的氛围转场', '少用「一时之间／那一瞬间」开启气氛转场，写清具体发生的变化。', /(?:^|[。！？!?\n])\s*(?:一时之间|一瞬之间|那一瞬间|刹那间)[，,。]?/gu],
    ['breath', '停顿后才开口', '减少反复铺垫沉默与呼吸，按场景需要直接接动作或对白。', /(?:沉默了(?:一会儿|片刻|良久)|深吸一口气|顿了(?:顿|一下))[^。！？!?\n]{0,12}(?:开口|说道|才说)/gu],
    ['staccato', '连续三个短句', '减少连续三个极短的叙事句，按事件关系调整句长。', /(?:^|[。！？!?\n])\s*\p{Script=Han}{1,6}。\s*\p{Script=Han}{1,6}。\s*\p{Script=Han}{1,6}。/gu],
    ['no-answer', '先否定回答再用动作', '减少反复用「没有回答，只是……」转入动作，按人物习惯回应。', /(?:没有|并未)(?:立刻|马上)?(?:回答|说话|回应|开口)[，,。]\s*(?:只是|却|而是)/gu],
];

const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;
const quotes = /「[^」\n]*」|『[^』\n]*』|“[^”\n]*”|‘[^’\n]*’|"[^"\n]*"/gu;
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

function cleanText(value) {
    return normalizeTerm(value.slice(0, 6000))
        .replace(/```[\s\S]*?(?:```|$)|`[^`\n]+`/gu, ' ')
        .replace(/<(think|thinking|analysis)(?:\s[^>]*)?>[\s\S]*?(?:<\/\1\s*>|$)/giu, ' ')
        .replace(/<[^>\n]{1,150}>|https?:\/\/[^\s]+/gu, ' ');
}

function readReplies(chat, window) {
    const replies = [];
    for (let index = chat.length - 1; index >= 0 && replies.length < window; index--) {
        const message = chat[index];
        if (!message || message.is_user !== false || message.is_system || typeof message.mes !== 'string') continue;
        const text = cleanText(message.mes);
        if (HAN.test(text)) replies.push({ text, name: message.name });
    }
    return replies;
}

function nameFilter(names, explicit) {
    const configured = explicit.map(normalizeTerm);
    const known = names.filter(name => typeof name === 'string' && name.length <= 120).map(normalizeTerm).filter(Boolean);
    const all = [...new Set([...configured, ...known])].sort((a, b) => b.length - a.length);
    const masked = all.filter(name => [...name].length > 1 || configured.includes(name));
    return { all, matcher: masked.length ? new RegExp(masked.map(escapeRegex).join('|'), 'gu') : null };
}

function phraseCandidates(text, terms) {
    const counts = new Map();
    const add = term => counts.set(term, (counts.get(term) ?? 0) + 1);
    for (const term of terms) {
        for (let at = text.indexOf(term); at !== -1; at = text.indexOf(term, at + term.length)) add(term);
    }
    for (const match of text.matchAll(HAN_RUNS)) {
        if (segmenter) {
            const words = Array.from(segmenter.segment(match[0]), part => part.segment);
            for (const [index, word] of words.entries()) {
                const next = words[index + 1] ?? '';
                if (HAN_TERM.test(word) && !terms.has(word) && !STOP.has(word)) add(word);
                const pair = word + next;
                if (next && HAN_TERM.test(pair) && !terms.has(pair) && STYLE_PHRASE.test(pair)) add(pair);
            }
        } else {
            const chars = [...match[0]];
            for (let i = 0; i + 1 < chars.length; i++) {
                const pair = chars[i] + chars[i + 1];
                if (!STOP.has(pair) && !terms.has(pair)) add(pair);
            }
        }
    }
    return counts;
}

function record(map, id, count, age, decay) {
    const item = map.get(id) ?? { count: 0, replies: 0, score: 0 };
    item.count += count;
    item.replies++;
    item.score += decay ** age * Math.min(count, 3);
    map.set(id, item);
}

const ranked = (a, b) => b.score - a.score || b.replies - a.replies || b.count - a.count || (b.term?.length ?? 0) - (a.term?.length ?? 0);

export function analyzeChat(chat, knownNames, options) {
    if (!options.words && !options.patterns) return { sampleSize: 0, frequencies: [], lexicon: [], patterns: [] };
    const replies = readReplies(chat, options.window);
    const names = nameFilter([...knownNames, ...replies.map(reply => reply.name)], options.names);
    const blocked = term => options.whitelist.some(word => term.includes(word)) || names.all.includes(term) ||
        [...term].length > 1 && names.matcher !== null && term.replace(names.matcher, '') !== term;
    const blacklist = new Set(options.blacklist.filter(term => !blocked(term)));
    const seeds = new Set(SEEDS);
    const lexiconTerms = new Set([...seeds, ...blacklist]);
    const frequencyCounts = new Map();
    const narrativeCounts = new Map();
    const patternCounts = new Map();
    for (const [age, reply] of replies.entries()) {
        const text = names.matcher ? reply.text.replace(names.matcher, ' ') : reply.text;
        const narrative = text.replace(quotes, ' ');
        if (options.words) {
            for (const [term, count] of phraseCandidates(text, lexiconTerms)) {
                if (!blocked(term)) record(frequencyCounts, term, count, age, options.decay);
            }
            for (const [term, count] of phraseCandidates(narrative, lexiconTerms)) {
                if (STYLE_PHRASE.test(term)) record(narrativeCounts, term, count, age, options.decay);
            }
        }
        if (options.patterns) {
            for (const [id, , , pattern] of PATTERNS) {
                const count = Array.from(narrative.matchAll(pattern)).length;
                if (count) record(patternCounts, id, count, age, options.decay);
            }
        }
    }
    const stats = [...frequencyCounts].map(([term, metrics]) => ({
        term, ...metrics,
        type: blacklist.has(term) ? 'blacklist'
            : seeds.has(term) ? 'seed'
                : (narrativeCounts.get(term)?.replies ?? 0) >= options.minReplies ? 'narrative' : 'normal',
    })).sort(ranked);
    const repeated = stats.filter(item => item.replies >= options.minReplies);
    const lexicon = options.words ? [...blacklist].map(term => stats.find(item => item.term === term) ?? {
        term, count: 0, replies: 0, score: 0, type: 'blacklist',
    }) : [];
    for (const item of repeated) {
        if (item.type === 'normal' || item.type === 'blacklist') continue;
        if (lexicon.some(other => other.term.includes(item.term) || item.term.includes(other.term))) continue;
        lexicon.push(item);
    }
    const patterns = PATTERNS.flatMap(([id, label, advice]) => {
        const stats = patternCounts.get(id);
        return stats && stats.replies >= options.minReplies ? [{ id, label, advice, ...stats }] : [];
    }).sort(ranked);
    return { sampleSize: replies.length, frequencies: repeated.slice(0, 40), lexicon, patterns };
}
