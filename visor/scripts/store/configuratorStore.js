import { DEFAULT_CONFIGURATION } from '../data/modules.js';

let state = { ...DEFAULT_CONFIGURATION };
const listeners = new Set();

function emit() {
  const snapshot = getState();
  listeners.forEach(listener => listener(snapshot));
  document.dispatchEvent(new CustomEvent('configuration-changed', { detail: snapshot }));
}

export function getState() {
  return { ...state };
}

export function setConfigValue(key, value) {
  if (state[key] === value) return;
  state = { ...state, [key]: value };
  emit();
}

export function resetConfig() {
  state = { ...DEFAULT_CONFIGURATION };
  emit();
}

export function subscribe(listener) {
  listeners.add(listener);
  listener(getState());
  return () => listeners.delete(listener);
}
