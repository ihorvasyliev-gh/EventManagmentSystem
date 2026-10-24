import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Download, FileText, List, Clock, MapPin, Mail, Repeat, History, RefreshCw } from 'lucide-react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import ThemeToggle from '../components/ThemeToggle';
import { loadPdfJs } from '../utils/posterFile';
import {
  digestFromPagePath, digestListUrl, digestPageUrl, parseDigestVersions, type DigestRef, type DigestVersions
} from '../utils/digestLinks';
import { MONTHS_LONG, WEEKDAYS_LONG } from '../utils/digestText';
import { parseDigestList, type DigestList, type DigestListEntry } from '../utils/digestList';
import { getCategoryDotColor } from '../components/WeekView';
import type { EventCategory } from '../types';

type ViewState = 'idle' | 'loading' | 'ready' | 'missing' | 'error';
type Tab = 'list' | 'pdf';

const MAX_PAGE_WIDTH = 880;
const pageWidth = () => Math.max(280, Math.min(MAX_PAGE_WIDTH, window.innerWidth - 24));

/** "Friday 23 October" (with the year when it isn't this year) for an issue's day, YYYY-MM-DD */
const issuedLabel = (issued: string): string => {
  const [y, m, d] = issued.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  return `${WEEKDAYS_LONG[day.getDay()]} ${d} ${MONTHS_LONG[m - 1]}${y === new Date().getFullYear() ? '' : ` ${y}`}`;
};

/** "Sat 24 Oct" */
const shortDay = (d: Date) => `${WEEKDAYS_LONG[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS_LONG[d.getMonth()].slice(0, 3)}`;

/**
 * A shared digest (/digest/<id>-<name>): its events as a list (when it was shared with one; the
 * first view on phones), the PDF's pages drawn here with pdf.js with its links kept clickable,
 * and a download button. Phone email apps open links in a built-in browser that can't
 * show or save a PDF (a black screen), and desktop PDF extensions render it badly; a page works
 * everywhere. Anyone with the link can open it, for as long as the file is kept (six months).
 *
 * A link shows its week's newest digest: when an event changed after the email went out and the
 * digest was updated, the update, with what changed marked. "Previous digests" opens each
 * week's, newest first.
 */
const DigestViewPage: React.FC = () => {
  const link = useMemo(() => digestFromPagePath(window.location.pathname), []);
  // What the link shows and the other weeks; null when that can't be had (the link's own PDF then)
  const [versions, setVersions] = useState<DigestVersions | null | undefined>(link ? undefined : null);
  const digest = useMemo(() => (versions === undefined ? null : versions?.latest.digest ?? link), [versions, link]);
  const [state, setState] = useState<ViewState>(link ? 'idle' : 'missing');
  // The list stored beside the PDF; digests shared before it existed have only the PDF
  const [list, setList] = useState<DigestList | null | undefined>(link ? undefined : null);
  const [tab, setTab] = useState<Tab>(() => (window.innerWidth < 768 ? 'list' : 'pdf'));
  const showing: Tab | null = list === undefined ? null : list ? tab : 'pdf';
  const [width, setWidth] = useState(pageWidth);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const pagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = `Upcoming Events Digest${digest?.period ? `, ${digest.period}` : ''} · Cork City Partnership`;
  }, [digest]);

  // Turning a phone or resizing the window draws the pages again at the new width
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setWidth((w) => (Math.abs(w - pageWidth()) > 40 ? pageWidth() : w)), 250);
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    if (!link) return;
    let cancelled = false;
    fetch(`/api/digest-versions?key=${encodeURIComponent(link.key)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => !cancelled && setVersions(parseDigestVersions(data)))
      .catch(() => !cancelled && setVersions(null));
    return () => {
      cancelled = true;
    };
  }, [link]);

  useEffect(() => {
    if (!digest) return;
    let cancelled = false;
    fetch(digestListUrl(digest))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => !cancelled && setList(parseDigestList(data)))
      .catch(() => !cancelled && setList(null));
    return () => {
      cancelled = true;
    };
  }, [digest]);

  // The PDF is fetched once it is first shown (a phone reading the list needn't download it)
  const wantsPdf = showing === 'pdf' || state !== 'idle';
  useEffect(() => {
    if (!digest || !wantsPdf) return;
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    (async () => {
      try {
        const res = await fetch(digest.fileUrl);
        if (res.status === 404) {
          if (!cancelled) setState('missing');
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = new Uint8Array(await res.arrayBuffer());
        const pdfjs = await loadPdfJs();
        task = pdfjs.getDocument({ data });
        const opened = await task.promise;
        if (cancelled) return;
        setDoc(opened);
        setState('ready');
      } catch (err) {
        console.error('Opening the digest failed:', err);
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [digest, wantsPdf]);

  // Each page as a canvas at the screen's pixel density, with its links laid over it
  useEffect(() => {
    const container = pagesRef.current;
    if (!doc || !container) return;
    let cancelled = false;
    container.replaceChildren();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    (async () => {
      for (let n = 1; n <= doc.numPages && !cancelled; n++) {
        const page = await doc.getPage(n);
        const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
        const sheet = document.createElement('div');
        sheet.className = 'relative mx-auto bg-white shadow-md ring-1 ring-slate-200 dark:ring-slate-700';
        sheet.style.width = `${viewport.width}px`;
        sheet.style.height = `${viewport.height}px`;
        sheet.setAttribute('role', 'group');
        sheet.setAttribute('aria-label', `Page ${n} of ${doc.numPages}`);
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        sheet.appendChild(canvas);
        container.appendChild(sheet);
        await page.render({ canvas, viewport, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0], background: '#ffffff' }).promise;
        const annotations = await page.getAnnotations();
        annotations.forEach((a: { subtype?: string; url?: string; rect?: number[] }) => {
          if (a.subtype !== 'Link' || !a.url || !a.rect || !/^(https?:|mailto:)/i.test(a.url)) return;
          const [x1, y1] = viewport.convertToViewportPoint(a.rect[0], a.rect[1]);
          const [x2, y2] = viewport.convertToViewportPoint(a.rect[2], a.rect[3]);
          const link = document.createElement('a');
          link.href = a.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.className = 'absolute';
          link.style.left = `${Math.min(x1, x2)}px`;
          link.style.top = `${Math.min(y1, y2)}px`;
          link.style.width = `${Math.abs(x2 - x1)}px`;
          link.style.height = `${Math.abs(y2 - y1)}px`;
          link.setAttribute('aria-label', a.url.replace(/^mailto:/i, 'Email '));
          sheet.appendChild(link);
        });
        page.cleanup();
      }
    })().catch((err) => {
      console.error('Drawing the digest failed:', err);
      if (!cancelled) setState('error');
    });
    return () => {
      cancelled = true;
    };
  }, [doc, width]);

  // Waiting for the list, or for the PDF once it is wanted
  const view: ViewState = state === 'idle' && (showing === null || wantsPdf) ? 'loading' : state;

  const updatedAt = versions?.latest.updatedAt ?? null;
  const marked = list?.entries.filter((e) => e.isUpdated).length ?? 0;
  // A link to an earlier week: the newest digest is a tap away
  const newest = versions?.archive[0];
  const newer = newest && digest && newest.digest.key !== digest.key && newest.issued > versions.latest.issued ? newest : null;
  const others = !!digest && !!versions?.archive.some((r) => r.digest.key !== digest.key);

  const download = digest && view !== 'missing' && (
    <a
      href={`${digest.fileUrl}?download=1`}
      download={digest.fileName}
      aria-label="Download PDF"
      className="cta inline-flex items-center justify-center gap-2 h-11 px-4 sm:px-5 rounded bg-brand-600 hover:bg-brand-700 text-white !text-xs tracking-[0.1em] shadow-sm whitespace-nowrap transition-colors"
    >
      {/* A phone's header also fits Previous digests beside it: "PDF" there */}
      <Download className="w-4 h-4 shrink-0" /> <span><span className="hidden min-[440px]:inline">Download </span>PDF</span>
    </a>
  );

  const tabButton = (value: Tab, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      role="tab"
      id={`tab-${value}`}
      aria-selected={showing === value}
      aria-controls={`panel-${value}`}
      onClick={() => setTab(value)}
      className={`cta inline-flex items-center gap-1.5 px-4 h-10 rounded !text-xs tracking-[0.1em] transition-colors ${
        showing === value
          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="min-h-[100dvh] bg-slate-100 dark:bg-slate-900">
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200/70 dark:border-slate-800 pt-[env(safe-area-inset-top)]">
        <div className="relative max-w-5xl mx-auto px-3 sm:px-6 h-16 flex items-center gap-3">
          <span className="bg-white p-1 px-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700 shrink-0">
            <img src="/assets/ccp-logo-v2.png" alt="Cork City Partnership" className="h-6 sm:h-7 w-auto object-contain" />
          </span>
          <div className="min-w-0 flex-1 hidden min-[480px]:block">
            <h1 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white truncate">Upcoming Events Digest</h1>
            {digest?.period && <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{digest.period}</p>}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            {others && versions && digest && <PreviousDigests archive={versions.archive} current={digest.key} />}
            {download}
          </div>
        </div>
      </header>

      <main className="py-4 sm:py-8 px-3">
        <div className="min-[480px]:hidden mb-3 text-center">
          <h1 className="text-base font-semibold text-slate-900 dark:text-white">Upcoming Events Digest</h1>
          {digest?.period && <p className="text-xs text-slate-600 dark:text-slate-400">{digest.period}</p>}
        </div>

        {view !== 'missing' && (updatedAt || newer) && (
          <div className="max-w-2xl mx-auto mb-4 sm:mb-6 space-y-2">
            {updatedAt && (
              <div className="flex items-start gap-2.5 p-3 rounded-leaf-sm bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-sm text-amber-900 dark:text-amber-100">
                <RefreshCw className="w-4 h-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
                <div className="min-w-0 [overflow-wrap:anywhere]">
                  <p>
                    <strong>Updated {shortDay(updatedAt)}</strong>, after this digest was sent.
                    {marked > 0 && ` ${marked === 1 ? 'The event that changed is' : `The ${marked} events that changed are`} marked Updated.`}
                  </p>
                  {list?.removed && <p className="mt-1">No longer on: {list.removed.join('; ')}.</p>}
                </div>
              </div>
            )}
            {newer && (
              <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-slate-600 dark:text-slate-300">
                <span>A newer digest went out on {issuedLabel(newer.issued)}.</span>
                <a href={digestPageUrl(newer.digest.fileUrl, window.location.origin)} className="font-semibold text-brand-700 dark:text-brand-300 hover:underline">
                  Open the latest
                </a>
              </p>
            )}
          </div>
        )}

        {list && view !== 'missing' && (
          <div role="tablist" aria-label="Show the digest as" className="mb-4 sm:mb-6 mx-auto w-max flex gap-1 p-1 rounded-md bg-slate-200/70 dark:bg-slate-800">
            {tabButton('list', 'List', <List className="w-4 h-4" />)}
            {tabButton('pdf', 'PDF', <FileText className="w-4 h-4" />)}
          </div>
        )}

        {view === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-24 text-sm text-slate-600 dark:text-slate-400" role="status">
            <span className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
            Opening the digest…
          </div>
        )}

        {(view === 'missing' || (view === 'error' && showing === 'pdf')) && (
          <div className="max-w-md mx-auto mt-12 p-6 rounded-leaf bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center" role="alert">
            {view === 'missing'
              ? <FileText className="w-8 h-8 mx-auto text-slate-400" />
              : <AlertCircle className="w-8 h-8 mx-auto text-red-500" />}
            <h2 className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">
              {view === 'missing' ? 'This digest is no longer available' : 'The digest could not be shown here'}
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
              {view === 'missing'
                ? 'Links to a digest work for six months. Ask the person who sent it for the latest one.'
                : 'Download it instead to open it in your PDF app.'}
            </p>
            {view === 'error' && <div className="mt-4">{download}</div>}
          </div>
        )}

        {list && showing === 'list' && view !== 'missing' && (
          <div id="panel-list" role="tabpanel" aria-labelledby="tab-list">
            <DigestListView list={list} />
          </div>
        )}

        <div
          ref={pagesRef}
          {...(list ? { id: 'panel-pdf', role: 'tabpanel', 'aria-labelledby': 'tab-pdf' } : {})}
          className={view === 'ready' && showing === 'pdf' ? 'flex flex-col gap-4 sm:gap-6' : 'hidden'}
        />

        {view === 'ready' && showing === 'pdf' && (
          <p className="mt-6 text-center text-xs text-slate-600 dark:text-slate-400">
            Download doesn’t start in your email app? Open this page in your browser.
          </p>
        )}
      </main>
    </div>
  );
};

/** Each week's digest (its newest version), newest first, to open another one */
const PreviousDigests: React.FC<{ archive: DigestRef[]; current: string }> = ({ archive, current }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="previous-digests"
        aria-label="Previous digests"
        title="Previous digests"
        className="cta inline-flex items-center justify-center gap-2 h-11 w-11 sm:w-auto sm:px-4 rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 bg-white dark:bg-transparent hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 !text-xs tracking-[0.1em] transition-colors"
      >
        <History className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">Previous digests</span>
      </button>
      {open && (
        <nav
          id="previous-digests"
          aria-label="Previous digests"
          className="absolute right-3 sm:right-6 top-full mt-1 w-[min(22rem,calc(100vw-24px))] max-h-[70vh] overflow-y-auto p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl"
        >
          <p className="px-3 pt-2 pb-1.5 text-xs text-slate-600 dark:text-slate-400">One a week, each in its latest version</p>
          <ul>
            {archive.map((r) => {
              const here = r.digest.key === current;
              const body = (
                <>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">{issuedLabel(r.issued)}</span>
                    {r.updatedAt && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100 text-[10px] font-bold uppercase tracking-[0.1em]">Updated</span>
                    )}
                    {here && <span className="ml-auto text-xs text-slate-600 dark:text-slate-400">Showing</span>}
                  </span>
                  {r.digest.period && <span className="block text-xs text-slate-600 dark:text-slate-400">{r.digest.period}</span>}
                </>
              );
              return (
                <li key={r.digest.key}>
                  {here ? (
                    <div aria-current="page" className="px-3 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm">{body}</div>
                  ) : (
                    <a
                      href={digestPageUrl(r.digest.fileUrl, window.location.origin)}
                      className="block px-3 py-2.5 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      {body}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
};

/** The digest's events by day, in plain text: easy to read and to tap on a phone */
const DigestListView: React.FC<{ list: DigestList }> = ({ list }) => {
  const days: Array<{ day: string; entries: DigestListEntry[] }> = [];
  list.entries.forEach((entry) => {
    const last = days[days.length - 1];
    if (last?.day === entry.day) last.entries.push(entry);
    else days.push({ day: entry.day, entries: [entry] });
  });
  if (days.length === 0) {
    return <p className="py-16 text-center text-sm text-slate-600 dark:text-slate-400">No events in this digest.</p>;
  }
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {days.map(({ day, entries }) => (
        <section key={day} aria-label={day}>
          <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700 dark:text-brand-300">{day}</h2>
          <ul className="space-y-3">
            {entries.map((entry, i) => (
              <li key={i} className="p-4 rounded-leaf-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${getCategoryDotColor(entry.category as EventCategory)}`} aria-hidden="true" />
                  <span className="truncate">{entry.category}</span>
                  {(entry.isUpdated || entry.isNew) && (
                    <span className="ml-auto shrink-0 flex gap-1">
                      {entry.isUpdated && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100 tracking-[0.1em]">Updated</span>
                      )}
                      {entry.isNew && <span className="px-1.5 py-0.5 rounded bg-brand-600 text-white tracking-[0.1em]">New</span>}
                    </span>
                  )}
                </div>
                <h3 className="mt-1.5 text-base font-semibold leading-snug text-slate-900 dark:text-white [overflow-wrap:anywhere]">{entry.title}</h3>
                <div className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                  {entry.time && (
                    <p className="flex items-start gap-2"><Clock className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />{entry.time}</p>
                  )}
                  {entry.where && (
                    <p className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(entry.where)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-brand-700 dark:hover:text-brand-300 hover:underline [overflow-wrap:anywhere]"
                      >
                        {entry.where}
                      </a>
                    </p>
                  )}
                  {entry.also && (
                    <p className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                      <Repeat className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                      <span>Also on {entry.also}</span>
                    </p>
                  )}
                </div>
                {entry.description && (
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-line [overflow-wrap:anywhere]">{entry.description}</p>
                )}
                {entry.contacts.length > 0 && (
                  <ul className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 space-y-1 text-sm">
                    {entry.contacts.map((c, j) => (
                      <li key={j} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {c.name && <span className="font-medium text-slate-700 dark:text-slate-200">{c.name}</span>}
                        {c.email && (
                          <a href={`mailto:${c.email}?subject=${encodeURIComponent(entry.title)}`} className="inline-flex items-center gap-1 text-brand-700 dark:text-brand-300 hover:underline [overflow-wrap:anywhere]">
                            <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            {c.email}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};

export default DigestViewPage;
