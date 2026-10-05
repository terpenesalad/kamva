import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/app.css';
import './styles/editor.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);

// Debug handle for automated testing and power users (DevTools console)
import { useEditor } from './store/editor';
import { useUI, usePrefs } from './store/ui';
import * as actions from './lib/actions';
import * as canvasCtl from './editor/canvas/controller';
(window as any).kamvaDebug = {
  useEditor,
  useUI,
  usePrefs,
  actions,
  get canvas() {
    return canvasCtl.activeCanvas;
  },
};
