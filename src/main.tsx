import { render } from 'preact';

import { App } from './App';
import './style.css';

const appRoot = document.querySelector('#app');

if (!appRoot) {
  throw new Error('App root element was not found.');
}

render(<App />, appRoot);
