import { createController } from './host.js';
import { createPanel } from './panel.js';

const getContext = () => globalThis.SillyTavern.getContext();
const { eventSource, eventTypes } = getContext();
let controller;

eventSource.on(eventTypes.APP_INITIALIZED, () => {
    const target = document.querySelector('#extensions_settings2') ?? document.querySelector('#extensions_settings');
    if (!target || document.getElementById('rp-anti-slop')) return;
    let panel;
    controller = createController(getContext, view => panel?.update(view));
    panel = createPanel(controller);
    target.append(panel.element);
});

export function onDisable() {
    controller?.dispose();
    controller = undefined;
    document.getElementById('rp-anti-slop')?.remove();
}
