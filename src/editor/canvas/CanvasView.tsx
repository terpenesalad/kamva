import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Copy, Clipboard, CopyPlus, Trash2, Lock, Unlock, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, Group, Ungroup,
  ImageIcon, Paintbrush, Scissors, Crop, AlignCenter, Link2, FlipHorizontal, Eraser,
} from 'lucide-react';
import { CanvasController, useView, setActiveCanvas, activeCanvas } from './controller';
import { useEditor, findElement } from '../../store/editor';
import { useUI, usePrefs } from '../../store/ui';
import { ContextMenu, MenuItem, MOD } from '../../components/ui';
import { importFiles, placeAsset, replaceMedia, ensureUploadAsset } from '../../lib/actions';
import { align, deleteSelection, flip, groupSelection, setAsBackground, toggleLock, ungroupSelection } from '../elementActions';
import type { TextElement } from '../../types';
import { fillPrimaryColor } from '../../lib/color';
import { displayText } from '../../lib/render/builder';
import { Rulers } from './Rulers';
import { handleLibraryDrop } from '../dnd';
import { idb, UploadRecord } from '../../lib/idb';
import { removeBackground } from '../../lib/bgremove';

export function CanvasView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<CanvasController | null>(null);
  const menu = useView((s) => s.menu);
  const cropActive = useView((s) => s.cropActive);
  const showRulers = usePrefs((s) => s.showRulers);
  const canvasBg = usePrefs((s) => s.canvasBg);
  const [dropHint, setDropHint] = useState(false);

  useLayoutEffect(() => {
    const host = hostRef.current!;
    const c = new CanvasController(host);
    ctrlRef.current = c;
    setActiveCanvas(c);
    const ro = new ResizeObserver(() => c.resize(host.clientWidth, host.clientHeight));
    ro.observe(host);
    return () => {
      ro.disconnect();
      c.destroy();
      setActiveCanvas(null);
    };
  }, []);

  // space-to-pan
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e)) {
        ctrlRef.current?.setSpace(true);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && ctrlRef.current?.setSpace(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropHint(false);
    const c = ctrlRef.current;
    if (!c) return;
    const at = c.clientToDesign(e.clientX, e.clientY);
    const target = c.elementAtClient(e.clientX, e.clientY);
    // Drag from Kamva's own panels
    const lib = e.dataTransfer.getData('application/x-kamva');
    if (lib) {
      await handleLibraryDrop(JSON.parse(lib), at, target);
      return;
    }
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    // single image dropped onto an image/frame replaces it
    const targetEl = target ? findElement(useEditor.getState().design, target)?.el : null;
    if (files.length === 1 && targetEl && (targetEl.type === 'image' || targetEl.type === 'video') && /^(image|video)\//.test(files[0].type)) {
      await importFiles(files, { place: false });
      const assets = useEditor.getState().design?.assets || {};
      const last = Object.values(assets).filter((a) => a.name === files[0].name).pop();
      if (last) await replaceMedia(targetEl.id, last.id);
      return;
    }
    await importFiles(files, { at });
  };

  return (
    <div className={'canvas-wrap' + (showRulers ? ' with-rulers' : '')}>
      {showRulers && <Rulers />}
      <div
        ref={hostRef}
        className={'canvas-host' + (dropHint ? ' drop' : '')}
        style={canvasBg ? { background: canvasBg } : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          if (!dropHint) setDropHint(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDropHint(false);
        }}
        onDrop={onDrop}
        onContextMenu={(e) => e.preventDefault()}
      />
      <TextEditor />
      {cropActive && (
        <div className="crop-bar">
          <Crop size={16} />
          <span>Drag the photo to reposition. Drag the handles to crop.</span>
          <button className="btn sm" onClick={() => ctrlRef.current?.resetCrop()}>
            Reset
          </button>
          <button className="btn sm primary" onClick={() => ctrlRef.current?.commitCrop()}>
            Done
          </button>
        </div>
      )}
      {menu && <CanvasMenu x={menu.x} y={menu.y} id={menu.id} onClose={() => useView.setState({ menu: null })} />}
    </div>
  );
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

// ---------------------------------------------------------------------------
// Inline text editor overlay
// ---------------------------------------------------------------------------
function TextEditor() {
  const rect = useView((s) => s.textRect);
  const id = useEditor((s) => s.editingTextId);
  const el = useEditor((s) => (id ? (findElement(s.design, id)?.el as TextElement | undefined) : undefined));
  const ref = useRef<HTMLTextAreaElement>(null);
  const [initial, setInitial] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setInitial(null);
      return;
    }
    setInitial(el?.text ?? '');
    setTimeout(() => {
      const ta = ref.current;
      if (!ta) return;
      ta.focus();
      ta.select();
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!id || !rect || !el || el.type !== 'text') return null;
  const z = rect.zoom;
  const color = fillPrimaryColor(el.fill);
  const finish = () => useEditor.getState().setEditingText(null);
  return (
    <textarea
      ref={ref}
      className="text-editor"
      value={el.text}
      spellCheck
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        minHeight: rect.h,
        transform: `rotate(${rect.rotation}deg)`,
        fontFamily: `"${el.fontFamily}"`,
        fontSize: el.fontSize * z,
        fontWeight: el.fontWeight === 'bold' ? 700 : 400,
        fontStyle: el.fontStyle,
        lineHeight: el.lineHeight,
        letterSpacing: el.letterSpacing * z,
        textAlign: el.align === 'justify' ? 'justify' : el.align,
        textTransform: el.transform === 'none' ? undefined : el.transform,
        textDecoration: [el.underline ? 'underline' : '', el.strike ? 'line-through' : ''].join(' ').trim() || undefined,
        color: color === 'transparent' ? '#000' : color,
        caretColor: usePrefs.getState().accent,
      }}
      onChange={(e) => useEditor.getState().updateElements([id], { text: e.target.value } as any, 'text-edit:' + id)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          finish();
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) finish();
      }}
      onBlur={() => {
        // empty text boxes are removed, like Canva
        const cur = findElement(useEditor.getState().design, id)?.el as TextElement | undefined;
        finish();
        if (cur && !cur.text.trim()) useEditor.getState().deleteElements([id]);
        void initial;
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}
export { displayText };

// ---------------------------------------------------------------------------
// Right-click menu
// ---------------------------------------------------------------------------
function CanvasMenu({ x, y, id, onClose }: { x: number; y: number; id: string | null; onClose: () => void }) {
  const st = useEditor.getState();
  const sel = st.selection;
  const page = st.design?.pages.find((p) => p.id === st.activePageId);
  const els = page?.elements.filter((e) => sel.includes(e.id)) || [];
  const el = els[0];
  const multi = els.length > 1;
  const grouped = els.length > 1 && els.every((e) => e.groupId && e.groupId === els[0].groupId);
  const media = el && (el.type === 'image' || el.type === 'video') && el.assetId;
  const items: MenuItem[] = [];
  if (!id) {
    items.push(
      { label: 'Paste', icon: <Clipboard size={16} />, shortcut: `${MOD}+V`, onClick: () => st.paste(), disabled: !st.clipboard },
      { sep: true },
      { label: 'Add page', icon: <CopyPlus size={16} />, onClick: () => st.addPage(st.activePageId) },
      { label: 'Change background', icon: <Paintbrush size={16} />, onClick: () => useUI.setState({ panel: 'background' }) },
    );
  } else {
    items.push(
      { label: 'Copy', icon: <Copy size={16} />, shortcut: `${MOD}+C`, onClick: () => st.copy(sel) },
      { label: 'Cut', icon: <Scissors size={16} />, shortcut: `${MOD}+X`, onClick: () => st.cut(sel) },
      { label: 'Paste', icon: <Clipboard size={16} />, shortcut: `${MOD}+V`, onClick: () => st.paste(), disabled: !st.clipboard },
      { label: 'Duplicate', icon: <CopyPlus size={16} />, shortcut: `${MOD}+D`, onClick: () => st.duplicateElements(sel) },
      { label: 'Delete', icon: <Trash2 size={16} />, shortcut: 'Del', onClick: deleteSelection, danger: true },
      { sep: true },
      { label: 'Copy style', icon: <Paintbrush size={16} />, shortcut: `${MOD}+Alt+C`, onClick: () => el && st.copyStyle(el.id), disabled: multi },
      { label: 'Paste style', icon: <Paintbrush size={16} />, shortcut: `${MOD}+Alt+V`, onClick: () => st.pasteStyle(sel), disabled: !st.styleClipboard },
      { sep: true },
      { label: 'Bring forward', icon: <ArrowUp size={16} />, shortcut: `${MOD}+]`, onClick: () => st.reorder(sel, 'up') },
      { label: 'Bring to front', icon: <ChevronsUp size={16} />, shortcut: `${MOD}+Alt+]`, onClick: () => st.reorder(sel, 'top') },
      { label: 'Send backward', icon: <ArrowDown size={16} />, shortcut: `${MOD}+[`, onClick: () => st.reorder(sel, 'down') },
      { label: 'Send to back', icon: <ChevronsDown size={16} />, shortcut: `${MOD}+Alt+[`, onClick: () => st.reorder(sel, 'bottom') },
      { sep: true },
    );
    if (multi && !grouped) items.push({ label: 'Group', icon: <Group size={16} />, shortcut: `${MOD}+G`, onClick: groupSelection });
    if (grouped || el?.groupId) items.push({ label: 'Ungroup', icon: <Ungroup size={16} />, shortcut: `${MOD}+Shift+G`, onClick: ungroupSelection });
    items.push(
      { label: 'Align to page', icon: <AlignCenter size={16} />, onClick: () => align('center', true) },
      { label: 'Flip horizontally', icon: <FlipHorizontal size={16} />, onClick: () => flip('x') },
      { label: els.every((e) => e.locked) ? 'Unlock' : 'Lock', icon: els.every((e) => e.locked) ? <Unlock size={16} /> : <Lock size={16} />, shortcut: `${MOD}+Shift+L`, onClick: toggleLock },
      { label: 'Add link…', icon: <Link2 size={16} />, onClick: () => window.dispatchEvent(new CustomEvent('kamva-link', { detail: el?.id })), disabled: multi },
    );
    if (media) {
      items.push(
        { sep: true },
        { label: 'Crop', icon: <Crop size={16} />, onClick: () => st.setCrop(el.id) },
        { label: 'Set image as background', icon: <ImageIcon size={16} />, onClick: setAsBackground },
      );
      if (el.type === 'image') items.push({ label: 'Remove background', icon: <Eraser size={16} />, onClick: () => removeBackground(el.id) });
    }
  }
  return <ContextMenu x={x} y={y} items={items} onClose={onClose} />;
}

// Re-export so other modules can reach the live controller
export { activeCanvas, placeAsset, ensureUploadAsset, idb };
export type { UploadRecord };
