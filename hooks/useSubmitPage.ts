import { useCallback, useEffect, useState } from 'react';
import { type Event } from '../types';

export const isSubmitUrl = (): boolean =>
  window.location.pathname.startsWith('/submit') ||
  new URLSearchParams(window.location.search).get('mode') === 'submit';

/**
 * The full-screen event form (/submit, or /?mode=submit from inside the app), kept in the
 * address so the browser's Back button closes it. Admins create events through it too.
 */
export const useSubmitPage = () => {
  const [isOpen, setIsOpen] = useState(() => typeof window !== 'undefined' && isSubmitUrl());
  // Date pre-filled when an admin adds an event from a calendar day
  const [initialDate, setInitialDate] = useState<Date | null>(null);
  // Event copied into the form ("Duplicate")
  const [template, setTemplate] = useState<Event | null>(null);

  const openWith = useCallback((date: Date | null, copyOf: Event | null = null) => {
    setInitialDate(date);
    setTemplate(copyOf);
    setIsOpen(true);
    if (!isSubmitUrl()) {
      window.history.pushState({}, '', '/?mode=submit');
    }
    window.scrollTo({ top: 0 });
  }, []);

  const open = useCallback(() => openWith(null), [openWith]);
  const openWithDate = useCallback((date: Date | null) => openWith(date), [openWith]);

  const close = useCallback(() => {
    setIsOpen(false);
    setInitialDate(null);
    setTemplate(null);
    if (isSubmitUrl()) {
      window.history.pushState({}, '', '/');
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => setIsOpen(isSubmitUrl());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return { isOpen, initialDate, template, open, openWith, openWithDate, close };
};
