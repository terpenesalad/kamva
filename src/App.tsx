import { useEffect } from 'react';
import { useUI, usePrefs } from './store/ui';
import { useEditor } from './store/editor';
import { Editor } from './editor/Editor';
import { Home } from './home/Home';
import { Toasts } from './components/Toasts';
import { Dialogs } from './editor/dialogs/Dialogs';
import { useMenuCommands } from './editor/shortcuts';
import { platform } from './lib/platform';
import { autosave, openDesignPath, restoreLibraryFonts } from './lib/actions';

function useTheme() {
  const theme = usePrefs((s) => s.theme);
  const accent = usePrefs((s) => s.accent);
  const uiScale = usePrefs((s) => s.uiScale);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent);
    // readable text on the accent colour
    const n = parseInt(accent.slice(1, 7), 16);
    const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    document.documentElement.style.setProperty('--accent-ink', l > 0.62 ? '#14121a' : '#ffffff');
  }, [accent]);
  useEffect(() => {
    document.documentElement.style.fontSize = `${13 * uiScale}px`;
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
}

export function App() {
  const screen = useUI((s) => s.screen);
  useTheme();
  useMenuCommands();

  useEffect(() => {
    void restoreLibraryFonts();
    void platform.pendingOpen().then((p) => {
      if (p) void openDesignPath(p);
    });
    const off1 = platform.onOpenFile((p) => void openDesignPath(p));
    const off2 = platform.onRequestClose(async () => {
      // keep a copy in the design library so nothing is ever lost
      if (useEditor.getState().design) await autosave(true);
      platform.confirmClose();
    });
    const beforeUnload = () => void autosave(true);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      off1();
      off2();
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);

  return (
    <>
      {screen === 'editor' && useEditor.getState().design ? <Editor /> : <HomeScreen />}
      <Toasts />
    </>
  );
}

function HomeScreen() {
  return (
    <>
      <Home />
      <Dialogs />
    </>
  );
}
