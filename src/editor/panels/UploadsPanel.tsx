import { memo, useMemo, useState } from 'react';
import { CloudUpload, FileAudio, Image as ImageIcon, Music, PaintBucket, Plus, Trash2, Type, Video } from 'lucide-react';
import type { AssetMeta } from '../../types';
import { useEditor } from '../../store/editor';
import { useUI } from '../../store/ui';
import { idb, UploadRecord } from '../../lib/idb';
import { importDialog, importFiles, placeAsset, setPageBackgroundAsset, errorMessage } from '../../lib/actions';
import { getAsset } from '../../lib/assets';
import { dragData } from '../dnd';
import { ContextMenu, MenuItem, Seg } from '../../components/ui';
import { EmptyState, PanelHead, SectionHead, UPLOADS_EVENT, fmtDuration, useUploads, ensureUpload } from './common';

type Tab = 'all' | 'image' | 'video' | 'audio' | 'font';

const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'audio', label: 'Audio' },
  { value: 'font', label: 'Fonts' },
];

const matchTab = (kind: string, tab: Tab) => tab === 'all' || kind === tab || (tab === 'image' && kind === 'svg');

const toast = (t: string, k: 'info' | 'success' | 'error' = 'info') => useUI.getState().toast(t, k);

async function addRecord(rec: UploadRecord) {
  try {
    await ensureUpload(rec);
    if (rec.kind === 'font') {
      toast(`Font “${getAsset(rec.id)?.meta.fontFamily || rec.name}” is ready to use`, 'success');
      return;
    }
    await placeAsset(rec.id);
  } catch (e) {
    toast(`Couldn't add ${rec.name}: ${errorMessage(e)}`, 'error');
  }
}

async function setBackground(rec: UploadRecord) {
  try {
    await ensureUpload(rec);
    setPageBackgroundAsset(useEditor.getState().activePageId, rec.id);
  } catch (e) {
    toast(`Couldn't use ${rec.name} as the background: ${errorMessage(e)}`, 'error');
  }
}

async function removeRecord(rec: UploadRecord) {
  await idb.del('uploads', rec.id).catch(() => undefined);
  window.dispatchEvent(new Event(UPLOADS_EVENT));
}

function kindIcon(kind: string, size = 18) {
  if (kind === 'audio') return <Music size={size} />;
  if (kind === 'font') return <Type size={size} />;
  if (kind === 'video') return <Video size={size} />;
  return <ImageIcon size={size} />;
}

const UploadTile = memo(function UploadTile({ rec, onMenu }: { rec: UploadRecord; onMenu: (rec: UploadRecord, x: number, y: number) => void }) {
  const isRow = rec.kind === 'audio' || rec.kind === 'font';
  const common = {
    draggable: rec.kind !== 'font',
    onDragStart: (e: React.DragEvent) => dragData(e, { type: 'upload', id: rec.id }),
    onClick: () => void addRecord(rec),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      onMenu(rec, e.clientX, e.clientY);
    },
    title: rec.name,
  };
  if (isRow) {
    return (
      <button className="upload-row" {...common}>
        <span className={'upload-row-icon ' + rec.kind}>{rec.kind === 'audio' ? <FileAudio size={18} /> : <Type size={18} />}</span>
        <span className="upload-row-name">{rec.name}</span>
        <span className="faint small">{rec.kind === 'audio' ? fmtDuration(rec.duration) : 'Font'}</span>
      </button>
    );
  }
  return (
    <button className="tile upload-tile" {...common}>
      {rec.thumb ? <img src={rec.thumb} alt="" draggable={false} loading="lazy" /> : <span className="upload-ph">{kindIcon(rec.kind, 22)}</span>}
      {rec.kind === 'video' && <span className="dur-badge">{fmtDuration(rec.duration) || 'Video'}</span>}
    </button>
  );
});

/** Assets used by this design that aren't (or are no longer) in the uploads library */
function useDesignOnlyAssets(libraryIds: Set<string>): AssetMeta[] {
  const assets = useEditor((s) => s.design?.assets);
  return useMemo(
    () => Object.values(assets || {}).filter((a) => (a.kind === 'image' || a.kind === 'video' || a.kind === 'audio') && !libraryIds.has(a.id) && getAsset(a.id)),
    [assets, libraryIds],
  );
}

const DesignAssetTile = memo(function DesignAssetTile({ meta }: { meta: AssetMeta }) {
  const a = getAsset(meta.id);
  if (meta.kind === 'audio') {
    return (
      <button className="upload-row" draggable onDragStart={(e) => dragData(e, { type: 'asset', id: meta.id })} onClick={() => void placeAsset(meta.id)} title={meta.name}>
        <span className="upload-row-icon audio">
          <FileAudio size={18} />
        </span>
        <span className="upload-row-name">{meta.name}</span>
        <span className="faint small">{fmtDuration(meta.duration)}</span>
      </button>
    );
  }
  return (
    <button className="tile upload-tile" draggable onDragStart={(e) => dragData(e, { type: 'asset', id: meta.id })} onClick={() => void placeAsset(meta.id)} title={meta.name}>
      {meta.kind === 'image' && a ? (
        <img src={a.url} alt="" draggable={false} loading="lazy" />
      ) : meta.kind === 'video' && a ? (
        <video src={a.url} muted preload="metadata" />
      ) : (
        <span className="upload-ph">{kindIcon(meta.kind, 22)}</span>
      )}
      {meta.kind === 'video' && <span className="dur-badge">{fmtDuration(meta.duration) || 'Video'}</span>}
    </button>
  );
});

export function UploadsPanel() {
  const uploads = useUploads();
  const [tab, setTab] = useState<Tab>('all');
  const [over, setOver] = useState(false);
  const [menu, setMenu] = useState<{ rec: UploadRecord; x: number; y: number } | null>(null);

  const libIds = useMemo(() => new Set((uploads || []).map((u) => u.id)), [uploads]);
  const designOnly = useDesignOnlyAssets(libIds);
  const list = useMemo(() => (uploads || []).filter((u) => matchTab(u.kind, tab)), [uploads, tab]);
  const tiles = list.filter((r) => r.kind !== 'audio' && r.kind !== 'font');
  const rows = list.filter((r) => r.kind === 'audio' || r.kind === 'font');
  const designList = designOnly.filter((a) => matchTab(a.kind, tab));

  const menuItems = (rec: UploadRecord): MenuItem[] => [
    { label: rec.kind === 'audio' ? 'Add to timeline' : rec.kind === 'font' ? 'Load font' : 'Add to page', icon: <Plus size={15} />, onClick: () => void addRecord(rec) },
    ...(rec.kind === 'image' || rec.kind === 'video' ? [{ label: 'Set as background', icon: <PaintBucket size={15} />, onClick: () => void setBackground(rec) }] : []),
    { sep: true },
    { label: 'Delete from uploads', icon: <Trash2 size={15} />, danger: true, onClick: () => void removeRecord(rec) },
  ];

  return (
    <>
      <PanelHead title="Uploads">
        <button className="btn primary block" onClick={() => void importDialog('all', false)}>
          <CloudUpload size={16} /> Upload files
        </button>
        <Seg value={tab} options={TABS} onChange={setTab} />
      </PanelHead>
      <div
        className={'panel-body uploads-body' + (over ? ' drop-over' : '')}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          if (!over) setOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setOver(false);
          void importFiles(Array.from(e.dataTransfer.files), { place: false });
        }}
      >
        <div className="drop-zone" onClick={() => void importDialog('all', false)} role="button" tabIndex={0}>
          <CloudUpload size={20} />
          <span>Drop images, videos, audio or fonts here</span>
        </div>

        {uploads === null ? (
          <div className="panel-loading">Loading your uploads…</div>
        ) : !list.length && !designList.length ? (
          <EmptyState icon={<CloudUpload size={28} />} title={tab === 'all' ? 'No uploads yet' : `No ${TABS.find((t) => t.value === tab)!.label.toLowerCase()} yet`}>
            Upload photos, videos, music or fonts and they'll stay here for every design.
          </EmptyState>
        ) : (
          <>
            {tiles.length > 0 && (
              <>
                {(rows.length > 0 || designList.length > 0) && <SectionHead title="Media" count={tiles.length} />}
                <div className="tile-grid cols-2 uploads-grid">
                  {tiles.map((r) => (
                    <UploadTile key={r.id} rec={r} onMenu={(rec, x, y) => setMenu({ rec, x, y })} />
                  ))}
                </div>
              </>
            )}
            {rows.length > 0 && (
              <>
                <SectionHead title={tab === 'font' ? 'Fonts' : tab === 'audio' ? 'Audio' : 'Audio and fonts'} count={rows.length} />
                <div className="col upload-rows">
                  {rows.map((r) => (
                    <UploadTile key={r.id} rec={r} onMenu={(rec, x, y) => setMenu({ rec, x, y })} />
                  ))}
                </div>
              </>
            )}
            {designList.length > 0 && (
              <>
                <SectionHead title="In this design" count={designList.length} />
                <div className="tile-grid cols-2 uploads-grid">
                  {designList.filter((a) => a.kind !== 'audio').map((a) => (
                    <DesignAssetTile key={a.id} meta={a} />
                  ))}
                </div>
                <div className="col upload-rows">
                  {designList.filter((a) => a.kind === 'audio').map((a) => (
                    <DesignAssetTile key={a.id} meta={a} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.rec)} onClose={() => setMenu(null)} />}
    </>
  );
}
