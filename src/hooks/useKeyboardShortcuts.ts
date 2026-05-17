import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface ShortcutHandlers {
  onNewProject?: () => void;
  onSave?: () => void;
  onExport?: () => void;
  onCloseModal?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape' && handlers.onCloseModal) {
          handlers.onCloseModal();
        }
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'n':
            e.preventDefault();
            handlers.onNewProject?.();
            break;
          case 's':
            e.preventDefault();
            handlers.onSave?.();
            break;
          case 'e':
            e.preventDefault();
            handlers.onExport?.();
            break;
          case 'h':
            e.preventDefault();
            navigate('/');
            break;
        }
      }

      if (e.key === 'Escape') {
        handlers.onCloseModal?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers, navigate]);
}
