import type { SidePanel as PanelId } from '../../store/ui';
import { TemplatesPanel } from './TemplatesPanel';
import { ElementsPanel } from './ElementsPanel';
import { TextPanel } from './TextPanel';
import { UploadsPanel } from './UploadsPanel';
import { DrawPanel } from './DrawPanel';
import { BrandPanel } from './BrandPanel';
import { AppsPanel } from './AppsPanel';
import { BackgroundPanel } from './BackgroundPanel';
import { LayersPanel } from './LayersPanel';
import './panels.css';

export function SidePanel({ panel }: { panel: PanelId }) {
  switch (panel) {
    case 'templates':
      return <TemplatesPanel />;
    case 'elements':
      return <ElementsPanel />;
    case 'text':
      return <TextPanel />;
    case 'uploads':
      return <UploadsPanel />;
    case 'draw':
      return <DrawPanel />;
    case 'brand':
      return <BrandPanel />;
    case 'apps':
      return <AppsPanel />;
    case 'background':
      return <BackgroundPanel />;
    case 'layers':
      return <LayersPanel />;
    default:
      // 'photo', 'animate', 'position' and 'audio' are handled elsewhere
      return null;
  }
}
