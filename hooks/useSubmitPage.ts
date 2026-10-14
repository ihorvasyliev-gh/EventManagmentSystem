import { useCallback, useEffect, useState } from 'react';
import { type Event } from '../types';

export const isSubmitUrl = (): boolean =>
  window.location.pathname.startsWith('/submit') ||
  new URLSearchParams(window.location.search).get('mode') === 'submit';

/**
 * The full-screen event form (/submit, or /?mode=submit from inside the app), kept in the
 * address so the browser's Back button closes it. Admins create events through it too, and
 * every change to an event is made in it (admins any event, staff their own).
 */
export const useSubmitPage = () => {
  const [isOpen, setIsOpen] = useState(() => typeof window !== 'undefined' && isSubmitUrl());
  // Date pre-filled when an admin adds an event from a calendar day
  const [initialDate, setInitialDate] = useState<Date | null>(null);
  // Event copied into the form ("Duplicate")
  const [template, setTemplate] = useState<Event | null>(null);
  // Event being changed (admins: any; staff: their own), and whether saving should publish it
  const [editing, setEditing] = useState<Event | null>(null);
  const [publishOnSave, setPublishOnSave] = useState(false);

  const openWith = useCallback((date: Date | null, copyOf: Event | null = null, toEdit: Event | null = null, publish = false) => {
    setInitialDate(date);
    setTemplate(copyOf);
    setEditing(toEdit);
    setPublishOnSave(publish);
    setIsOpen(true);
    if (!isSubmitUrl()) {
      window.history.pushState({}, '', '/?mode=submit');
    }
    window.scrollTo({ top: 0 });
  }, []);

  const open = useCallback(() => openWith(null), [openWith]);
  const openWithDate = useCallback((date: Date | null) => openWith(date), [openWith]);
  /** `publish`: an admin editing a submission from the inbox (the status starts at Published) */
  const openToEdit = useCallback((event: Event, publish = false) => openWith(null, null, event, publish), [openWith]);

  const close = useCallback(() => {
    setIsOpen(false);
    setInitialDate(null);
    setTemplate(null);
    setEditing(null);
    setPublishOnSave(false);
    if (isSubmitUrl()) {
      window.history.pushState({}, '', '/');
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => setIsOpen(isSubmitUrl());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return { isOpen, initialDate, template, editing, publishOnSave, open, openWith, openWithDate, openToEdit, close };
};
