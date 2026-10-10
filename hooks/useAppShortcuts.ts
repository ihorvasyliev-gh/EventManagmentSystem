import { useEffect } from 'react';
import { type User, UserRole } from '../types';
import { SEARCH_INPUT_ID } from '../components/SearchBar';
import { isAnyModalOpen } from './useModalFocusTrap';

/**
 * Keyboard shortcuts on the calendar page: "/" searches, "C" starts a new event (admins), and
 * Escape leaves a text field. Escape inside dialogs is handled by useModalFocusTrap.
 */
export const useAppShortcuts = (user: User | null, onNewEvent: () => void) => {
  useEffect(() => {
    if (!user) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable) {
        if (e.key === 'Escape' && !isAnyModalOpen()) {
          target.blur();
        }
        return;
      }
      if (isAnyModalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === '/') {
        e.preventDefault();
        document.getElementById(SEARCH_INPUT_ID)?.focus();
      } else if (e.key === 'c' || e.key === 'C') {
        if (user.role === UserRole.ADMIN) {
          e.preventDefault();
          onNewEvent();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user, onNewEvent]);
};
