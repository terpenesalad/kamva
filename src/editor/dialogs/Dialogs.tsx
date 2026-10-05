import { useUI } from '../../store/ui';
import { ExportDialog } from './ExportDialog';
import { ResizeDialog, SettingsDialog, ShortcutsDialog, AboutDialog, SaveTemplateDialog } from './OtherDialogs';
import { NewDesignDialog } from '../../home/NewDesignDialog';

/** All modal dialogs, switched on useUI().modal */
export function Dialogs() {
  const modal = useUI((s) => s.modal);
  const close = () => useUI.getState().openModal(null);
  switch (modal) {
    case 'export':
      return <ExportDialog onClose={close} />;
    case 'resize':
      return <ResizeDialog onClose={close} />;
    case 'settings':
      return <SettingsDialog onClose={close} />;
    case 'shortcuts':
      return <ShortcutsDialog onClose={close} />;
    case 'about':
      return <AboutDialog onClose={close} />;
    case 'saveTemplate':
      return <SaveTemplateDialog onClose={close} />;
    case 'newDesign':
      return <NewDesignDialog onClose={close} />;
    default:
      return null;
  }
}
