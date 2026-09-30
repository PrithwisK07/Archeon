import { useEffect } from 'react';
import { useArchitectureStore } from '../store/architectureStore';

export function useCanvasShortcuts() {
  const { undo, redo, setCanvasMode } = useArchitectureStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'SELECT' ||
          active.tagName === 'TEXTAREA' ||
          (active as HTMLElement).isContentEditable)
      ) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === 'v') {
        setCanvasMode('select');
      } else if (e.key === 'h') {
        setCanvasMode('pan');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, setCanvasMode]);
}