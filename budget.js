import { BUILTIN_MODULES } from './defaults.js';

// Earlier ranked modules unlock first, independently of the user's injection order.
const moduleLevels = [1, 8, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53, 57, 61, 65, 70, 75, 80, 85, 91, 99];
const thresholds = new Map(BUILTIN_MODULES.map((module, index) => [module.id, moduleLevels[index]]));
export const TECHNICAL = { tail: '@tail', words: '@words', patterns: '@patterns' };
thresholds.set(TECHNICAL.tail, 6);
thresholds.set(TECHNICAL.words, 43);
thresholds.set(TECHNICAL.patterns, 63);

export function featureState(id, manual, level, excluded) {
    const minimum = thresholds.get(id) ?? 99;
    const available = level === null || level >= minimum;
    const enabled = level === null ? manual : available && !excluded.includes(id);
    return { enabled, available, minimum };
}

export function effectivePreset(preset, level) {
    if (level === null) return preset;
    const { options, modules } = preset;
    const enabled = id => featureState(id, false, level, options.budgetExcluded).enabled;
    return {
        ...preset,
        modules: modules.map(module => ({ ...module, enabled: enabled(module.id) })),
        options: {
            ...options,
            tailEnabled: enabled(TECHNICAL.tail),
            dynamics: { ...options.dynamics, words: enabled(TECHNICAL.words), patterns: enabled(TECHNICAL.patterns) },
        },
    };
}

export function estimateInputTokens(blocks) {
    let estimate = 0;
    for (const { text } of blocks) {
        estimate += 4;
        for (const segment of text.matchAll(/[a-z0-9]+|\s+|./giu)) {
            const part = segment[0];
            if (/^[a-z0-9]+$/iu.test(part)) estimate += Math.max(1, Math.ceil(part.length / 4));
            else if (/^\s+$/u.test(part)) estimate += part.length / 4;
            else if (/\p{Script=Han}/u.test(part)) estimate += 1.2;
            else estimate += part.length > 1 ? 2 : 1;
        }
    }
    return Math.ceil(estimate);
}
