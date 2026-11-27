import { featureState, TECHNICAL } from './budget.js';
import { BUILTIN_MODULES } from './defaults.js';
import {
    listOfTerms, MAX_CONFIG_SIZE, MAX_EXAMPLES, MAX_MODULES, MAX_PRESETS, normalizeOptions, parseSettings, POSITIONS,
} from './settings.js';

const create = (tag, className = '', text = '') => {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
};

function button(text, action) {
    const node = create('button', 'rp-button', text);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
}

function selectOptions(input, values) {
    input.replaceChildren(...values.map(([value, label]) => new Option(label, value)));
}

function field(label, type, value, onChange, attributes = {}) {
    const wrap = create('label', `rp-field ${type === 'checkbox' ? 'rp-check' : ''}`);
    const caption = create('span', '', label);
    const input = create(type === 'textarea' || type === 'select' ? type : 'input', type === 'checkbox' ? '' : 'text_pole');
    if (input.tagName === 'INPUT') input.type = type;
    Object.assign(input, attributes);
    if (type === 'select') selectOptions(input, value.options);
    if (type === 'checkbox') input.checked = value;
    else input.value = type === 'select' ? value.selected : value;
    const event = ['number', 'select', 'checkbox'].includes(type) ? 'change' : 'input';
    input.addEventListener(event, () => onChange(type === 'checkbox' ? input.checked : type === 'number' ? input.valueAsNumber : input.value, input));
    wrap.append(...(type === 'checkbox' ? [input, caption] : [caption, input]));
    return wrap;
}

const positionChoices = Object.entries(POSITIONS);
const id = () => `local-${Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')}`;
const DEFAULT_CONSUMPTION = 65;

export function createPanel(controller) {
    const panel = create('details', 'rp-panel');
    panel.id = 'rp-anti-slop';
    panel.innerHTML = `
        <summary>Roleplay Anti-Slop Manager <span class="rp-summary"></span></summary>
        <div class="rp-content">
            <div class="rp-top"><label class="rp-check"><input type="checkbox" class="rp-enabled">启用扩展</label></div>
            <div class="rp-budget">
                <label class="rp-budget-label">
                    <span>全局消耗控制 <strong class="rp-budget-level"></strong></span>
                    <input type="range" class="rp-budget-slider" min="1" max="99" step="1" value="65">
                </label>
                <div class="rp-budget-footer"><span class="rp-estimate"></span><span class="rp-budget-actions"></span></div>
                <p class="rp-budget-help rp-muted"></p>
            </div>
            <div class="rp-presets">
                <label class="rp-field">组合预设<select class="rp-preset text_pole"></select></label>
                <label class="rp-field">预设名称<input class="rp-preset-name text_pole" maxlength="80" type="text"></label>
                <div class="rp-preset-actions rp-actions"></div>
            </div>
            <p class="rp-feedback" role="status" hidden></p>
            <details class="rp-section" open>
                <summary>提示词模块 <span class="rp-module-count"></span></summary>
                <div class="rp-section-body"><div class="rp-module-list"></div><div class="rp-module-actions rp-actions"></div></div>
            </details>
            <details class="rp-section">
                <summary>注入位置与末端强化</summary>
                <div class="rp-section-body rp-injection-fields"></div>
            </details>
            <details class="rp-section">
                <summary>动态词库与句式 <span class="rp-sample-size"></span></summary>
                <div class="rp-section-body">
                    <div class="rp-dynamic-fields"></div>
                    <div class="rp-results"></div>
                </div>
            </details>
            <details class="rp-section">
                <summary>注入预览 <span class="rp-preview-size"></span></summary>
                <div class="rp-section-body rp-preview"></div>
            </details>
            <div class="rp-file-actions rp-actions"></div>
            <input type="file" class="rp-import" accept=".json,application/json" hidden>
        </div>`;
    const find = selector => panel.querySelector(selector);
    const presetSelect = find('.rp-preset');
    const presetName = find('.rp-preset-name');
    const enabled = find('.rp-enabled');
    const budgetSlider = find('.rp-budget-slider');
    const fileInput = find('.rp-import');
    const feedback = find('.rp-feedback');
    const moduleList = find('.rp-module-list');
    let resultsKey;

    const notify = message => {
        feedback.hidden = !message;
        feedback.textContent = message;
    };
    const change = callback => {
        notify('');
        controller.change(callback);
    };

    function toggleFeature(id, checked, setManual) {
        change((settings, preset) => {
            if (settings.consumptionLevel === null) {
                setManual(preset, checked);
                return;
            }
            const excluded = new Set(preset.options.budgetExcluded);
            if (checked) excluded.delete(id);
            else excluded.add(id);
            preset.options.budgetExcluded = [...excluded];
        });
    }

    function renderStyleExamples(list, module, focusId) {
        const cards = module.examples.map(example => {
            const card = create('fieldset', 'rp-style-example');
            card.dataset.example = example.id;
            const legend = create('legend', '', example.name);
            const meta = create('div', 'rp-grid');
            meta.append(field('名称', 'text', example.name, value => {
                change(() => { example.name = value.trim() || '未命名示例'; });
                legend.textContent = example.name;
            }, { maxLength: 80 }), field('示例类型', 'select', {
                selected: example.kind, options: [['positive', '正例'], ['negative', '反例']],
            }, value => change(() => { example.kind = value; })));
            const actions = create('div', 'rp-actions');
            actions.append(field('启用此示例', 'checkbox', example.enabled, value => change(() => { example.enabled = value; })),
                button('删除示例', () => {
                    if (!confirm(`删除文风示例「${example.name}」？`)) return;
                    change(() => { module.examples = module.examples.filter(item => item.id !== example.id); });
                    renderStyleExamples(list, module);
                    list.querySelector('.rp-add-example').focus();
                }));
            card.append(legend, meta, field('内容', 'textarea', example.text,
                value => change(() => { example.text = value; }), { rows: 4, maxLength: 8000 }), actions);
            return card;
        });
        const add = button('新增文风示例', () => {
            if (module.examples.length >= MAX_EXAMPLES) return notify(`每个模块最多 ${MAX_EXAMPLES} 条文风示例。`);
            const example = { id: id(), name: '新示例', text: '', kind: 'positive', enabled: true };
            change(() => { module.examples.push(example); });
            renderStyleExamples(list, module, example.id);
        });
        add.classList.add('rp-add-example');
        list.replaceChildren(...cards, add);
        if (focusId) list.querySelector(`[data-example="${focusId}"] input[type="text"]`)?.select();
    }

    function renderModules(openId, focusControl) {
        const open = new Set([...moduleList.querySelectorAll('details[open]')].map(node => node.dataset.id));
        if (openId) open.add(openId);
        const { modules } = controller.view.preset;
        moduleList.replaceChildren(...modules.map((module, index) => {
            const row = create('div', 'rp-module');
            const title = create('label', 'rp-check rp-module-title');
            const toggle = create('input');
            toggle.type = 'checkbox';
            toggle.dataset.feature = module.id;
            toggle.addEventListener('change', () => toggleFeature(module.id, toggle.checked, (_, value) => { module.enabled = value; }));
            const titleText = create('span', '', module.name);
            title.append(toggle, titleText);
            const editor = create('details', 'rp-editor');
            editor.dataset.id = module.id;
            editor.open = open.has(module.id);
            const summary = create('summary', '', '编辑');
            summary.setAttribute('aria-label', `编辑 ${module.name}`);
            const actions = create('div', 'rp-actions');
            const move = offset => {
                change(() => { [modules[index + offset], modules[index]] = [modules[index], modules[index + offset]]; });
                renderModules(openId, [module.id, offset < 0 ? 'up' : 'down']);
            };
            const up = button('↑', () => move(-1));
            const down = button('↓', () => move(1));
            for (const [control, action, label] of [[up, 'up', '上移'], [down, 'down', '下移']]) {
                control.dataset.move = `${module.id}-${action}`;
                control.setAttribute('aria-label', `${label} ${module.name}`);
                control.title = label;
            }
            up.disabled = index === 0;
            down.disabled = index === modules.length - 1;
            const duplicate = button('复制模块', () => {
                if (modules.length >= MAX_MODULES) return notify(`每套预设最多 ${MAX_MODULES} 个模块。`);
                const copy = { ...structuredClone(module), id: id(), name: `${module.name} 副本`.slice(0, 80) };
                change(() => { modules.splice(index + 1, 0, copy); });
                renderModules(copy.id);
            });
            const remove = button('删除模块', () => {
                if (!confirm(`从当前预设删除「${module.name}」？`)) return;
                change((_, preset) => {
                    modules.splice(index, 1);
                    preset.options.budgetExcluded = preset.options.budgetExcluded.filter(item => item !== module.id);
                });
                renderModules();
            });
            actions.append(duplicate, remove);
            const body = create('div', 'rp-editor-body');
            const rename = field('模块名称', 'text', module.name, value => {
                change(() => { module.name = value.trim() || '未命名模块'; });
                titleText.textContent = module.name;
                summary.setAttribute('aria-label', `编辑 ${module.name}`);
                up.setAttribute('aria-label', `上移 ${module.name}`);
                down.setAttribute('aria-label', `下移 ${module.name}`);
            }, { maxLength: 80 });
            body.append(rename, field('注入位置', 'select', {
                selected: module.position, options: [['inherit', '跟随预设默认位置'], ...positionChoices],
            }, value => change(() => { module.position = value; })), field('提示词', 'textarea', module.text,
                value => change(() => { module.text = value; }), { rows: 3, maxLength: 8000 }));
            if (module.examples) {
                const list = create('div', 'rp-style-list');
                renderStyleExamples(list, module);
                body.append(list);
            }
            body.append(actions);
            editor.append(summary, body);
            row.append(title, up, down, editor);
            return row;
        }));
        renderFeatureSwitches(controller.view);
        if (focusControl) {
            const [moduleId, direction] = focusControl;
            const control = moduleList.querySelector(`button[data-move="${moduleId}-${direction}"]:enabled`) ??
                moduleList.querySelector(`button[data-move^="${moduleId}-"]:enabled`);
            control?.focus();
        }
    }

    function setOption(key, value, nested = false, input) {
        change((_, preset) => {
            const options = preset.options;
            if (nested) options.dynamics[key] = value;
            else options[key] = value;
            preset.options = normalizeOptions(options);
            if (input?.type === 'number') input.value = (nested ? preset.options.dynamics : preset.options)[key];
        });
    }

    function renderInjectionFields() {
        const options = controller.view.preset.options;
        const set = key => (value, input) => setOption(key, value, false, input);
        const grid = create('div', 'rp-grid');
        grid.append(field('预设默认位置', 'select', { selected: options.position, options: positionChoices }, set('position')),
            field('聊天内按深度注入', 'number', options.depth, set('depth'), { min: 0, max: 100, step: 1 }),
            field('总注入上限（字符）', 'number', options.maxChars, set('maxChars'), { min: 160, max: 16000, step: 1 }));
        const tail = field('启用末端强化（聊天深度 0）', 'checkbox', options.tailEnabled, value =>
            toggleFeature(TECHNICAL.tail, value, (preset, checked) => { preset.options.tailEnabled = checked; }));
        tail.querySelector('input').dataset.feature = TECHNICAL.tail;
        find('.rp-injection-fields').replaceChildren(grid, tail,
            field('末端提示词', 'textarea', options.tailText, set('tailText'), { rows: 3, maxLength: 4000 }));
    }

    function renderDynamicFields() {
        const options = controller.view.preset.options.dynamics;
        const grid = create('div', 'rp-grid');
        const set = key => (value, input) => setOption(key, value, true, input);
        const switches = create('div', 'rp-actions');
        for (const [key, label] of [['words', '统计高频词并更新词库'], ['patterns', '检测重复句式']]) {
            const control = field(label, 'checkbox', options[key], value =>
                toggleFeature(TECHNICAL[key], value, (preset, checked) => { preset.options.dynamics[key] = checked; }));
            control.querySelector('input').dataset.feature = TECHNICAL[key];
            switches.append(control);
        }
        for (const [key, label, min, max, step] of [
            ['window', '最近中文角色回复数', 1, 60, 1], ['minReplies', '最少重复回复数', 1, 60, 1],
            ['decay', '每轮权重衰减', 0.1, 1, 0.01], ['maxChars', '动态注入上限（字符）', 0, 1200, 1],
            ['maxItems', '最多注入词条与句式数', 0, 30, 1],
        ]) grid.append(field(label, 'number', options[key], set(key), { min, max, step }));
        const lists = create('div', 'rp-grid');
        for (const [key, label] of [['blacklist', '黑名单'], ['whitelist', '白名单'], ['names', '额外角色名和别名']]) {
            lists.append(field(label, 'textarea', options[key].join('\n'), value => setOption(key, listOfTerms(value, key === 'names'), true),
                { rows: 3, maxLength: 10000, placeholder: '每行一项，也可用逗号分隔' }));
        }
        find('.rp-dynamic-fields').replaceChildren(switches, grid, lists,
            create('p', 'rp-muted', '白名单和角色名优先过滤。普通高频词只列入统计。黑名单可手动指定需要减少的词。'));
        renderFeatureSwitches(controller.view);
    }

    function renderResults(view) {
        const { analysis, prompt, effective, settings } = view;
        const key = JSON.stringify([analysis, prompt.words, prompt.patterns, settings.enabled, effective.options.dynamics.words, effective.options.dynamics.patterns]);
        if (key === resultsKey) return;
        resultsKey = key;
        const results = find('.rp-results');
        const frequency = create('details', 'rp-subsection');
        frequency.open = results.querySelector('.rp-frequency')?.open ?? true;
        frequency.classList.add('rp-frequency');
        frequency.append(create('summary', '', `高频词统计（${analysis.frequencies.length}）`));
        const lexicon = create('details', 'rp-subsection');
        lexicon.open = results.querySelector('.rp-lexicon')?.open ?? true;
        lexicon.classList.add('rp-lexicon');
        lexicon.append(create('summary', '', `动态词库（${analysis.lexicon.length}）`));
        const patterns = create('details', 'rp-subsection');
        patterns.open = results.querySelector('.rp-patterns')?.open ?? true;
        patterns.classList.add('rp-patterns');
        patterns.append(create('summary', '', `重复句式（${analysis.patterns.length}）`));
        const labels = { normal: '普通高频', seed: '内置八股词', narrative: '重复叙事短语', blacklist: '黑名单' };
        const displayRows = (target, rows, kind, emptyText) => {
            if (!rows.length) return target.append(create('p', 'rp-muted', emptyText));
            const list = create('ul', 'rp-stat-list');
            for (const item of rows) {
                const row = create('li');
                const hit = kind === 'patterns' ? prompt.patterns.includes(item.id) : prompt.words.includes(item.term);
                row.append(create('span', 'rp-stat-term', item.term ?? item.label));
                row.append(create('span', 'rp-muted', `${labels[item.type] ? `${labels[item.type]} · ` : ''}${item.replies} 轮 · ${item.count} 次 · 权重 ${item.score.toFixed(2)}${hit ? ' · 已纳入注入' : ''}`));
                if (kind === 'frequency' && item.type === 'normal') {
                    row.append(button('加入黑名单', () => {
                        const { blacklist } = controller.view.preset.options.dynamics;
                        if (blacklist.length >= 200) return notify('黑名单最多 200 项。');
                        setOption('blacklist', [...blacklist, item.term], true);
                        renderDynamicFields();
                    }));
                }
                list.append(row);
            }
            target.append(list);
        };
        displayRows(frequency, analysis.frequencies, 'frequency', '暂无达到阈值的高频词。');
        displayRows(lexicon, analysis.lexicon, 'lexicon', '暂无满足条件的八股词。');
        displayRows(patterns, analysis.patterns, 'patterns', '暂无达到阈值的重复句式。');
        results.replaceChildren(frequency, lexicon, patterns);
    }

    function renderFeatureSwitches({ preset, settings }) {
        const manual = new Map(preset.modules.map(module => [module.id, module.enabled]));
        manual.set(TECHNICAL.tail, preset.options.tailEnabled);
        manual.set(TECHNICAL.words, preset.options.dynamics.words);
        manual.set(TECHNICAL.patterns, preset.options.dynamics.patterns);
        for (const control of panel.querySelectorAll('input[data-feature]')) {
            const id = control.dataset.feature;
            const state = featureState(id, manual.get(id), settings.consumptionLevel, preset.options.budgetExcluded);
            control.checked = state.enabled;
            control.disabled = !state.available;
            control.parentElement.title = state.available ? '' : `消耗档位达到 ${state.minimum} 时可开启`;
        }
    }

    function update(view) {
        const { settings, preset, effective, prompt, analysis, startupError } = view;
        enabled.checked = settings.enabled;
        find('.rp-summary').textContent = settings.enabled ? preset.name : '已关闭';
        const level = settings.consumptionLevel;
        budgetSlider.value = level ?? DEFAULT_CONSUMPTION;
        budgetSlider.setAttribute('aria-valuetext', level === null ? `待应用 ${budgetSlider.value} 档` : `${level} 档`);
        find('.rp-budget-level').textContent = level === null ? `手动 · ${budgetSlider.value} 档待应用` : `${level} / 99`;
        find('.rp-estimate').textContent = `预计额外输入 ≈ ${prompt.estimatedTokens} Token`;
        budgetAction.textContent = level === null ? '应用档位' : '恢复预设开关';
        find('.rp-budget-help').textContent = level === null ? '拖动滑块或应用当前档位。档位按原排名取舍模块。' : '99 档开放全部模块与动态功能。文风示例仍按各自开关使用。';
        renderFeatureSwitches(view);
        find('.rp-module-count').textContent = `${effective.modules.filter(module => module.enabled).length} / ${preset.modules.length} 已启用`;
        find('.rp-sample-size').textContent = `已分析 ${analysis.sampleSize} 轮`;
        find('.rp-preview-size').textContent = `${prompt.length} / ${preset.options.maxChars} 字符 · ≈ ${prompt.estimatedTokens} Token`;
        const preview = find('.rp-preview');
        preview.replaceChildren();
        if (!prompt.blocks.length) preview.append(create('p', 'rp-muted', settings.enabled ? '当前没有可注入的内容。' : '扩展已关闭，预览为空。'));
        for (const block of prompt.blocks) {
            const title = block.position === 'chat' ? `聊天内 · 深度 ${block.depth}` : POSITIONS[block.position];
            preview.append(create('h4', '', title), create('pre', '', block.text));
        }
        if (prompt.omitted.length) preview.append(create('p', 'rp-muted', `受字符上限限制，以下内容未注入：${prompt.omitted.join('、')}`));
        if (startupError) notify(startupError);
        renderResults(view);
    }

    function renderSettings() {
        const { settings, preset } = controller.view;
        selectOptions(presetSelect, settings.presets.map(item => [item.id, item.name]));
        presetSelect.value = preset.id;
        presetName.value = preset.name;
        deletePreset.disabled = settings.presets.length === 1;
        moduleList.replaceChildren();
        renderModules();
        renderDynamicFields();
        renderInjectionFields();
        update(controller.view);
    }

    enabled.addEventListener('change', () => change(settings => { settings.enabled = enabled.checked; }));
    function setConsumption(level) {
        change(settings => {
            settings.consumptionLevel = level;
            if (level === 99) {
                for (const preset of settings.presets) preset.options.budgetExcluded = [];
            }
        });
    }
    budgetSlider.addEventListener('input', () => setConsumption(budgetSlider.valueAsNumber));
    const budgetAction = button('', () => setConsumption(controller.view.settings.consumptionLevel === null ? budgetSlider.valueAsNumber : null));
    find('.rp-budget-actions').append(budgetAction);
    presetSelect.addEventListener('change', () => {
        change(settings => { settings.activePresetId = presetSelect.value; });
        renderSettings();
    });
    presetName.addEventListener('change', () => {
        change((_, preset) => { preset.name = presetName.value.trim() || '未命名预设'; });
        renderSettings();
    });
    const saveCopy = button('另存为新预设', () => {
        const { settings, preset } = controller.view;
        if (settings.presets.length >= MAX_PRESETS) return notify(`最多保存 ${MAX_PRESETS} 套预设。`);
        const copy = { ...structuredClone(preset), id: id(), name: `${preset.name} 副本`.slice(0, 80) };
        change(current => {
            current.presets.push(copy);
            current.activePresetId = copy.id;
        });
        renderSettings();
        presetName.select();
    });
    const deletePreset = button('删除预设', () => {
        const { preset, settings } = controller.view;
        if (settings.presets.length === 1 || !confirm(`删除预设「${preset.name}」？`)) return;
        change(current => {
            current.presets = current.presets.filter(item => item.id !== preset.id);
            current.activePresetId = current.presets[0].id;
        });
        renderSettings();
    });
    find('.rp-preset-actions').append(saveCopy, deletePreset);
    find('.rp-module-actions').append(button('新增模块', () => {
        if (controller.view.preset.modules.length >= MAX_MODULES) return notify(`每套预设最多 ${MAX_MODULES} 个模块。`);
        const module = { id: id(), name: '新模块', text: '', enabled: true, position: 'inherit' };
        change((_, preset) => { preset.modules.push(module); });
        renderModules(module.id);
    }), button('恢复缺少的内置模块', () => {
        const { modules } = controller.view.preset;
        const missing = BUILTIN_MODULES.filter(original => !modules.some(module => module.id === original.id));
        if (!missing.length) return notify('当前预设已包含全部内置模块。');
        if (modules.length + missing.length > MAX_MODULES) return notify(`每套预设最多 ${MAX_MODULES} 个模块。`);
        change(() => { modules.push(...structuredClone(missing)); });
        renderModules();
        notify(`已恢复 ${missing.length} 个内置模块。`);
    }));
    find('.rp-file-actions').append(button('导出 JSON', () => {
        const blob = new Blob([JSON.stringify(controller.view.settings, null, 2)], { type: 'application/json;charset=utf-8' });
        if (blob.size > MAX_CONFIG_SIZE) return notify('配置超过 4 MB，请精简后再导出。');
        const url = URL.createObjectURL(blob);
        const link = create('a');
        link.href = url;
        link.download = 'roleplay-anti-slop-settings.json';
        panel.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }), button('导入 JSON', () => fileInput.click()));
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        fileInput.value = '';
        if (!file) return;
        try {
            if (file.size > MAX_CONFIG_SIZE) throw new Error('配置文件不能超过 4 MB。');
            const settings = parseSettings(await file.text());
            if (!confirm('导入将替换本扩展现有的全部预设和开关。继续？')) return;
            change(() => settings);
            renderSettings();
            notify('配置已导入。');
        } catch (error) {
            notify(error.message);
        }
    });
    renderSettings();
    return { element: panel, update };
}
