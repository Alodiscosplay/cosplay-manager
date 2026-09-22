import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import { mode, demarrer, brancherEvenements } from './store/store';
import './styles.css';

// `?demo` dans l'URL : lance directement le mode démo (pratique pour essayer ou tester).
if (new URLSearchParams(location.search).has('demo') && mode.value !== 'demo') mode.value = 'demo';
if (mode.value) void demarrer(mode.value);
brancherEvenements();
registerSW({ immediate: true });

render(<App />, document.getElementById('app')!);
