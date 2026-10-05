import { useDeferredValue, useMemo, useState } from 'react';
import { LayoutTemplate } from 'lucide-react';
import type { Template } from '../../types';
import { useEditor } from '../../store/editor';
import { useUI } from '../../store/ui';
import { applyTemplate } from '../../lib/actions';
import { BUILT_IN_TEMPLATES, TEMPLATE_CATEGORIES, templateMatches } from '../../lib/templates';
import { TemplateCard } from '../../home/TemplateCard';
import { deleteUserTemplate, useUserTemplates } from '../../home/Home';
import { Modal } from '../../components/ui';
import { EmptyState, PanelHead, SearchBox, SectionHead } from './common';
import '../../home/home.css';

const sameAspect = (t: Template, w: number, h: number) => Math.abs(t.width / t.height / (w / h) - 1) <= 0.03;

async function applyWithToast(t: Template) {
  const st = useEditor.getState();
  const page = st.design?.pages.find((p) => p.id === st.activePageId);
  const empty = !!page && page.elements.length === 0 && !page.background.assetId;
  const n = t.pages.length;
  try {
    await applyTemplate(t, empty ? 'replace' : 'add');
    const what = n === 1 ? 'page' : `${n} pages`;
    useUI.getState().toast(empty ? `Applied ${t.name}` + (n > 1 ? ` (${n} pages)` : '') : `Added ${n === 1 ? 'a page' : what} from ${t.name}`, 'success', 2600);
  } catch (e) {
    useUI.getState().toast(`Couldn't apply ${t.name}: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

export function TemplatesPanel() {
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [cat, setCat] = useState('All');
  const dw = useEditor((s) => s.design?.width ?? 1);
  const dh = useEditor((s) => s.design?.height ?? 1);
  const [mine] = useUserTemplates();
  const [toDelete, setToDelete] = useState<Template | null>(null);

  const cats = useMemo(() => ['All', ...TEMPLATE_CATEGORIES.filter((c) => BUILT_IN_TEMPLATES.some((t) => t.category === c))], []);

  const { fits, others } = useMemo(() => {
    const list = BUILT_IN_TEMPLATES.filter((t) => (cat === 'All' || t.category === cat) && templateMatches(t, dq));
    return { fits: list.filter((t) => sameAspect(t, dw, dh)), others: list.filter((t) => !sameAspect(t, dw, dh)) };
  }, [cat, dq, dw, dh]);
  const mineHits = useMemo(() => {
    const l = (mine || []).filter((t) => templateMatches(t, dq) && (cat === 'All' || cat === 'My templates'));
    return [...l.filter((t) => sameAspect(t, dw, dh)), ...l.filter((t) => !sameAspect(t, dw, dh))];
  }, [mine, dq, cat, dw, dh]);

  const grid = (list: Template[], del = false) => (
    <div className="tpanel-grid">
      {[0, 1].map((col) => (
        <div key={col} className="tpanel-col">
          {list
            .filter((_, i) => i % 2 === col)
            .map((t) => (
              <TemplateCard key={t.id} t={t} fit="aspect" onOpen={(tt) => void applyWithToast(tt)} onDelete={del ? setToDelete : undefined} />
            ))}
        </div>
      ))}
    </div>
  );

  const nothing = !fits.length && !others.length && !mineHits.length;

  return (
    <>
      <PanelHead title="Templates">
        <SearchBox value={q} onChange={setQ} placeholder="Search templates" />
        <div className="tpanel-chips" role="tablist" aria-label="Template categories">
          {[...cats, ...(mine && mine.length ? ['My templates'] : [])].map((c) => (
            <button key={c} role="tab" aria-selected={cat === c} className={'chip' + (cat === c ? ' active' : '')} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
      </PanelHead>
      <div className="panel-body">
        {mineHits.length > 0 && (
          <>
            <SectionHead title="My templates" count={mineHits.length} />
            {grid(mineHits, true)}
          </>
        )}
        {cat !== 'My templates' && fits.length > 0 && (
          <>
            <SectionHead title="For this size" count={fits.length} />
            {grid(fits)}
          </>
        )}
        {cat !== 'My templates' && others.length > 0 && (
          <>
            <SectionHead title={fits.length || mineHits.length ? 'Other sizes' : 'All templates'} count={others.length} />
            {fits.length > 0 && <p className="tpanel-hint">These are scaled to fit your page.</p>}
            {grid(others)}
          </>
        )}
        {nothing && (
          <EmptyState icon={<LayoutTemplate size={22} />} title={dq.trim() ? 'No templates match' : 'No templates here yet'}>
            {dq.trim() ? 'Try another word, or clear the search to see everything.' : 'Save a design as a template from the File menu to reuse it here.'}
          </EmptyState>
        )}
      </div>
      {toDelete && (
        <Modal
          title="Delete this template?"
          onClose={() => setToDelete(null)}
          footer={
            <>
              <button className="btn" onClick={() => setToDelete(null)}>
                Cancel
              </button>
              <button
                className="btn primary danger-fill"
                autoFocus
                onClick={() => {
                  void deleteUserTemplate(toDelete);
                  setToDelete(null);
                }}
              >
                Delete
              </button>
            </>
          }
        >
          <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
            “{toDelete.name}” will be removed from your templates. Designs made from it are not affected.
          </p>
        </Modal>
      )}
    </>
  );
}
