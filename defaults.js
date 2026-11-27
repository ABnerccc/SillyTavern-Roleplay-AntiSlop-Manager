const moduleDefinitions = [
    ['autonomy', '角色自主性', '按角色已有的欲望、责任、关系与判断决定行动。即使玩家没有提问，角色也可以继续手头的事、提出自己的要求或离场。'],
    ['examples', '高质量文风示例', '参考下面的语言密度、对白节奏和动作细节。示例仅用于文风，故事沿当前角色与场景继续。'],
    ['plain-prose', '反过度文学化', '用具体动词和当下相关的细节落笔。删去重复修饰、堆叠的感官描写，以及对普通动作硬套的宏大比喻。'],
    ['dialogue', '自然对白', '按人物的教育、关系和场合写对白。允许省略、抢话、答偏和沉默。人物的用词与说话长度应有差别。'],
    ['sycophancy', '反讨好玩家', '让人物依据自己的利害和证据回应玩家。保留质疑、拒绝、冷淡和判断错误的可能，称赞要有场景内的理由。'],
    ['loop', '反上下文循环', '辨认已来回发生的争执、试探、安慰或肢体反应。若情境已有变化，就用一次行动、一条新信息或一个实际后果向前推进。'],
    ['melodrama', '反情绪戏剧化', '反应强度应符合事件、关系和人物惯常表现。普通插曲宜用轻微反应或手边动作处理，把强烈反应留给真正有分量的事件。'],
    ['viewpoint', '反全知视角', '角色只凭所见所闻、亲身经历和有来源的消息行动。对隐情可怀疑、误判或追问，保持所知与叙述视点一致。'],
    ['syntax', '去模板化句式', '随内容变化调整句长和句法。减少重复的二段式否定转折、三连短句、平行枚举和反复出现的叙事起手式。'],
    ['show', '展示而非解释', '通过动作选择、物件、停顿和言下之意提供线索。动作已经表达的意义留给读者推断，必要背景才清楚交代。'],
    ['positivity', '反过度正面化', '保留坏结果、误会、难堪和未经解决的分歧。和解、赞美和成长需要角色有相应的动机或行为。'],
    ['lexicon', '去八股词汇', '减少可直接套用到任意场景的陈词，如“眼底闪过”“空气仿佛凝固”“一抹意味深长的笑”。优先写此处能观察到的具体变化。'],
    ['player-control', '禁止代替玩家', '保留玩家角色的控制权。只写 NPC、环境和玩家已经明确行动的外在后果，把玩家的新台词、动作、想法、感觉和决定留给玩家。'],
    ['pacing', '自然剧情节奏', '按事件因果和行动成本安排推进幅度。允许场景停一下或略过琐碎步骤，重要的转折应有铺垫和后续。'],
    ['echo', '反复述玩家', '直接从后果或对手的反应接续上一轮。只有澄清或误会确有必要时，才短引玩家原话。'],
    ['open-close', '自然开头与结尾', '从上一刻尚未完成的动作、话头或眼前变化切入。结尾落在此刻的动作、具体回应或留给玩家的余地，少用感想总结和套话悬念。'],
    ['psychology', '心理复杂性', '角色可以嘴硬、护短、看错人，或同时怀有相冲突的动机。让矛盾从言行中出现，容许角色对自己的动机理解有限。'],
    ['convenience', '反剧情便利性', '关键帮助、线索和道具须有已建立的来源或可追溯的引入过程。角色的技能、钱、时间和人脉都有边界。'],
    ['relationships', '关系渐进式发展', '让信任、亲密或敌意随一连串具体接触逐步变化。重要事件可以改变关系，旧习惯、防备和利害仍有惯性。'],
    ['world', '世界自主运转', '让未出场人物和机构也按自己的时间表工作、行动、传话。用能被当前视点察觉的迹象或后果呈现他们的活动。'],
    ['mundanity', '日常感与自然幽默', '给日常劳动、走神、尴尬和闲谈留空间。幽默可来自人物习惯、误听或具体处境，笑点过后事情照常继续。'],
    ['physical', '物理与空间真实性', '延续上一轮的人物位置、门窗与物件状态。动作受距离、视野、手里拿的东西、所需时间及角色能力限制。'],
];

export const BUILTIN_MODULES = moduleDefinitions.map(([id, name, text], index) => ({
    id, name, text, enabled: index < 16, position: 'inherit',
    ...(id === 'examples' ? { examples: [
        { id: 'style-positive', name: '动作和对白', kind: 'positive', enabled: true,
            text: '「后门。」她把钥匙推过来，又往回拨了半寸。「回来别拧死，我还要出去。」\n\n雨顺着外套滴到地砖上。陈叔把拖把递给他：「你站那儿就行。顺便把脚底蹭两下。」' },
        { id: 'style-negative', name: '套话和过度渲染', kind: 'negative', enabled: true,
            text: '她嘴角勾起一抹意味深长的弧度，仿佛命运的齿轮在这一刻悄然转动。\n\n他沉默了。很久。久到空气仿佛凝固，整个世界都在等待一个答案。' },
    ] } : {}),
}));

export const DEFAULT_OPTIONS = {
    position: 'after', depth: 2, maxChars: 5000, budgetExcluded: [],
    tailEnabled: true,
    tailText: '接续当前场景，用人物当下会说的话、会做的事写下一步。保留玩家角色的决定权。',
    dynamics: {
        words: true, patterns: true, window: 12, minReplies: 2, decay: 0.86,
        maxChars: 280, maxItems: 8, blacklist: [], whitelist: [], names: [],
    },
};

export function defaultSettings() {
    const makePreset = (id, name, enabled) => ({
        id, name, options: structuredClone(DEFAULT_OPTIONS),
        modules: BUILTIN_MODULES.map((module, index) => ({
            ...structuredClone(module), enabled: enabled(index),
        })),
    });
    return {
        version: 2, enabled: true, activePresetId: 'balanced', consumptionLevel: null,
        presets: [
            makePreset('balanced', '均衡', index => index < 16),
            makePreset('light', '轻量', index => [0, 1, 2, 3, 4, 7, 12, 14].includes(index)),
            makePreset('complete', '全部模块', () => true),
        ],
    };
}
