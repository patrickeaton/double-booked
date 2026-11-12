import './style.css';
import { mountUI } from './ui';
import { S } from './state';

mountUI(document.getElementById('app')!);

if (import.meta.env.DEV) {
  Object.assign(window, { __S: S });
  import('./engine').then((engine) => Object.assign(window, { __E: engine }));
}
