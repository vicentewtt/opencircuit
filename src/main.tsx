import { render } from 'solid-js/web';
import { App } from './app/App';
import { initI18n } from './i18n';
import { initPwa } from './pwa/pwa';
import { initTheme } from './theme/theme';
import './styles/global.css';

initTheme();
initI18n();
initPwa();

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found');
}

render(() => <App />, root);
