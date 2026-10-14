import { AudioLines, Clock, Copy, Eye, EyeOff, Maximize2, Scissors, Trash2 } from 'lucide-react';
import type { MenuItem } from '../../components/ui';
import { MOD } from '../../components/ui';
import { useEditor, findElement } from '../../store/editor';
import { detachAudio, fitPageToVideos, splitElementsAtPlayhead } from './edits';
import { toggleHidden } from '../elementActions';

/** Right-click menu for an element bar on the timeline (acts on the selection) */
export function elementMenuItems(id: string): MenuItem[] {
  const st = useEditor.getState();
  const f = findElement(st.design, id);
  if (!f) return [];
  const ids = st.selection.includes(id) ? st.selection : [id];
  const el = f.el;
  const items: MenuItem[] = [
    { label: 'Split at playhead', icon: <Scissors size={16} />, shortcut: 'S', onClick: () => splitElementsAtPlayhead(ids) },
    { label: 'Duplicate', icon: <Copy size={16} />, shortcut: `${MOD}+D`, onClick: () => st.duplicateElements(ids) },
    {
      label: 'Show for the whole page',
      icon: <Maximize2 size={16} />,
      disabled: !el.timing,
      onClick: () =>
        st.updateElements(ids, (x) => {
          delete x.timing;
        }),
    },
  ];
  if (el.type === 'video') {
    items.push(
      { label: 'Detach audio', icon: <AudioLines size={16} />, disabled: el.muted, onClick: () => detachAudio(el.id) },
      { label: 'Fit page to video', icon: <Clock size={16} />, onClick: () => fitPageToVideos(f.page.id) },
    );
  }
  items.push(
    { label: el.hidden ? 'Show' : 'Hide', icon: el.hidden ? <Eye size={16} /> : <EyeOff size={16} />, onClick: () => toggleHidden(el.id) },
    { sep: true },
    { label: 'Delete', icon: <Trash2 size={16} />, shortcut: 'Del', danger: true, onClick: () => st.deleteElements(ids) },
  );
  return items;
}
