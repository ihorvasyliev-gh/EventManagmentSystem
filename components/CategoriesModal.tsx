import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Check, Loader2, Pencil, Plus, Search, Tag, Trash2 } from 'lucide-react';
import ModalShell from './ModalShell';
import CategoryIcon, { CATEGORY_ICON_OPTIONS } from './CategoryIcon';
import CategoryShapeMark, { CATEGORY_SHAPE_OPTIONS } from './CategoryShapeMark';
import { getToneChipClass, getToneDotClass, getToneIconClass, TONE_LABELS } from './WeekView';
import { useCategories } from '../contexts/CategoriesContext';
import { useToast } from '../contexts/ToastContext';
import {
  CATEGORY_TONES,
  MAX_CATEGORY_NAME,
  MAX_CUSTOM_CATEGORIES,
  MAX_SHORT_LABEL,
  MIN_CATEGORY_NAME,
  categoryKey,
  normalizeCategoryName,
  type CategoryDefinition,
  type CategoryIconId,
  type CategoryShape,
  type CategoryTone
} from '../constants/categories';

interface CategoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Open straight into the "Add category" form (e.g. from the submission form's "+ New category" button) */
  initialMode?: 'list' | 'add';
  /** Called with the newly created category right after saving */
  onCreated?: (category: CategoryDefinition) => void;
}

const inputClass =
  'w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';
const secondaryButton =
  'cta h-11 px-5 rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60';
const primaryButton =
  'cta inline-flex items-center justify-center gap-2 h-11 px-5 rounded bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60';

/** Pick a colour tone not yet used by custom categories when starting a new one */
const suggestTone = (custom: readonly CategoryDefinition[]): CategoryTone => {
  const preferred: CategoryTone[] = ['indigo', 'olive', 'enterprise', 'community', 'education', 'special', 'info', 'health', 'seminar'];
  const used = new Set(custom.map((c) => c.color));
  return preferred.find((t) => !used.has(t)) ?? 'indigo';
};

/** Pick a PDF digest marker shape not yet used by standard or custom categories */
const suggestShape = (all: readonly CategoryDefinition[]): CategoryShape => {
  const preferred: CategoryShape[] = ['star', 'cross', 'octagon', 'squareRing', 'circle', 'square', 'triangle', 'diamond', 'triangleDown', 'hexagon', 'pentagon', 'ring'];
  const used = new Set(all.map((c) => c.pdfShape));
  return preferred.find((s) => !used.has(s)) ?? 'star';
};

/**
 * Admins: manage event categories (view all, add custom categories with app icons, PDF digest
 * markers & colours, edit or remove custom categories). New categories appear immediately in the
 * submission form, calendar filters, subscribe page and PDF digest.
 */
const CategoriesModal: React.FC<CategoriesModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'list',
  onCreated
}) => {
  const { categories, customCategories, addCategory, editCategory, removeCategory } = useCategories();
  const { showToast } = useToast();
  const ids = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<'list' | 'add' | 'edit'>(initialMode);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [shortLabel, setShortLabel] = useState('');
  const [icon, setIcon] = useState<CategoryIconId>('star');
  const [color, setColor] = useState<CategoryTone>('indigo');
  const [pdfShape, setPdfShape] = useState<CategoryShape>('star');
  const [iconSearch, setIconSearch] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [confirmDeleteName, setConfirmDeleteName] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setListError(null);
    setConfirmDeleteName(null);
    setFormError(null);
    setIconSearch('');
    if (initialMode === 'add') {
      setView('add');
      setEditingName(null);
      setName('');
      setShortLabel('');
      setIcon('star');
      setColor(suggestTone(customCategories));
      setPdfShape(suggestShape(categories));
    } else {
      setView('list');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when opened
  }, [isOpen, initialMode]);

  useEffect(() => {
    if (isOpen && view === 'add') {
      const id = window.setTimeout(() => nameInputRef.current?.focus(), 40);
      return () => window.clearTimeout(id);
    }
  }, [isOpen, view]);

  const builtInCategories = useMemo(() => categories.filter((c) => c.builtIn), [categories]);

  const filteredIcons = useMemo(() => {
    const q = iconSearch.trim().toLowerCase();
    if (!q) return CATEGORY_ICON_OPTIONS;
    return CATEGORY_ICON_OPTIONS.filter((opt) => opt.label.toLowerCase().includes(q) || opt.id.includes(q));
  }, [iconSearch]);

  const selectedIconOption = CATEGORY_ICON_OPTIONS.find((o) => o.id === icon) ?? CATEGORY_ICON_OPTIONS[0];
  const selectedShapeOption = CATEGORY_SHAPE_OPTIONS.find((o) => o.id === pdfShape) ?? CATEGORY_SHAPE_OPTIONS[0];

  const openAdd = () => {
    setView('add');
    setEditingName(null);
    setName('');
    setShortLabel('');
    setIcon('star');
    setColor(suggestTone(customCategories));
    setPdfShape(suggestShape(categories));
    setIconSearch('');
    setFormError(null);
  };

  const openEdit = (cat: CategoryDefinition) => {
    setView('edit');
    setEditingName(cat.name);
    setName(cat.name);
    setShortLabel(cat.shortLabel ?? '');
    setIcon(cat.icon);
    setColor(cat.color);
    setPdfShape(cat.pdfShape);
    setIconSearch('');
    setFormError(null);
    setConfirmDeleteName(null);
  };

  const handleClose = () => {
    if (isSaving || deletingName) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanShort = normalizeCategoryName(shortLabel);
    if (cleanShort.length > MAX_SHORT_LABEL) {
      setFormError(`Short label must be at most ${MAX_SHORT_LABEL} characters.`);
      return;
    }

    if (view === 'add') {
      const cleanName = normalizeCategoryName(name);
      if (cleanName.length < MIN_CATEGORY_NAME) {
        setFormError(`Enter a category name (at least ${MIN_CATEGORY_NAME} characters).`);
        nameInputRef.current?.focus();
        return;
      }
      if (cleanName.length > MAX_CATEGORY_NAME) {
        setFormError(`Category name must be at most ${MAX_CATEGORY_NAME} characters.`);
        return;
      }
      const key = categoryKey(cleanName);
      if (categories.some((c) => categoryKey(c.name) === key)) {
        setFormError('A category with that name already exists.');
        return;
      }
      if (customCategories.length >= MAX_CUSTOM_CATEGORIES) {
        setFormError(`You can add at most ${MAX_CUSTOM_CATEGORIES} custom categories.`);
        return;
      }

      setIsSaving(true);
      try {
        const created = await addCategory({
          name: cleanName,
          ...(cleanShort ? { shortLabel: cleanShort } : {}),
          icon,
          color,
          pdfShape
        });
        showToast(`Category "${created.name}" added`, 'success');
        if (onCreated) {
          onCreated(created);
          onClose();
        } else {
          setView('list');
        }
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Could not save the category. Please try again.');
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (view === 'edit' && editingName) {
      setIsSaving(true);
      try {
        const updated = await editCategory(editingName, {
          icon,
          color,
          pdfShape,
          shortLabel: cleanShort || null
        });
        showToast(`Category "${updated.name}" updated`, 'success');
        setView('list');
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Could not update the category. Please try again.');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleDelete = async (categoryName: string) => {
    setDeletingName(categoryName);
    setListError(null);
    try {
      await removeCategory(categoryName);
      setConfirmDeleteName(null);
      showToast(`Category "${categoryName}" removed`, 'info');
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not remove the category.');
    } finally {
      setDeletingName(null);
    }
  };

  const previewLabel = normalizeCategoryName(name) || 'New category';
  const previewShort = normalizeCategoryName(shortLabel) || previewLabel;
  const formId = `${ids}-form`;

  const modalTitle = view === 'add' ? 'Add category' : view === 'edit' ? 'Edit category' : 'Event categories';
  const modalSubtitle =
    view === 'add'
      ? 'Appears in the submission form, calendar filters, subscribe page and PDF digest.'
      : view === 'edit'
      ? 'Change its icon, colour, digest marker or short label across the app.'
      : 'Manage categories available in the submission form, filters and digest.';

  const footer =
    view === 'list' ? (
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {categories.length} {categories.length === 1 ? 'category' : 'categories'} ({customCategories.length} custom)
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleClose} className={secondaryButton}>
            Done
          </button>
          <button
            type="button"
            onClick={openAdd}
            disabled={customCategories.length >= MAX_CUSTOM_CATEGORIES}
            className={primaryButton}
          >
            <Plus className="w-4 h-4" /> Add category
          </button>
        </div>
      </div>
    ) : (
      <div className="flex items-center justify-between gap-2">
        {initialMode === 'list' ? (
          <button
            type="button"
            onClick={() => {
              setView('list');
              setFormError(null);
            }}
            disabled={isSaving}
            className={`${secondaryButton} inline-flex items-center gap-1.5`}
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        ) : (
          <button type="button" onClick={handleClose} disabled={isSaving} className={secondaryButton}>
            Cancel
          </button>
        )}
        <button type="submit" form={formId} disabled={isSaving} className={primaryButton}>
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Saving…
            </>
          ) : view === 'add' ? (
            <>
              <Plus className="w-4 h-4" /> Add category
            </>
          ) : (
            'Save changes'
          )}
        </button>
      </div>
    );

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      title={modalTitle}
      subtitle={modalSubtitle}
      icon={<Tag className="w-5 h-5" />}
      size="lg"
      footer={footer}
    >
      {view === 'list' ? (
        <div className="space-y-6">
          {listError && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-800 dark:text-red-200" role="alert">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{listError}</span>
            </div>
          )}

          {/* Custom categories */}
          <section aria-labelledby={`${ids}-custom-heading`}>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <h3 id={`${ids}-custom-heading`} className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-300">
                Custom categories
              </h3>
              {customCategories.length > 0 && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {customCategories.length} of {MAX_CUSTOM_CATEGORIES}
                </span>
              )}
            </div>

            {customCategories.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30 p-5 text-center">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No custom categories yet</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Add a category with an icon, colour and digest marker — it will show up in the event submission form right away.
                </p>
                <button
                  type="button"
                  onClick={openAdd}
                  className="mt-3 inline-flex items-center gap-1.5 h-9 px-3.5 rounded bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add your first category
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700/80 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 overflow-hidden">
                {customCategories.map((cat) => {
                  const isConfirming = confirmDeleteName === cat.name;
                  const isDeleting = deletingName === cat.name;
                  return (
                    <li key={cat.name} className="p-3 sm:px-4 flex flex-col gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${getToneChipClass(cat.color)}`}
                          aria-hidden="true"
                        >
                          <CategoryIcon iconId={cat.icon} className="w-4 h-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{cat.name}</span>
                            {cat.shortLabel && cat.shortLabel !== cat.name && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                {cat.shortLabel}
                              </span>
                            )}
                            <span
                              className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                              title="PDF digest marker"
                            >
                              <CategoryShapeMark shape={cat.pdfShape} tone={cat.color} className="w-3 h-3" />
                              <span>PDF</span>
                            </span>
                          </div>
                          {cat.createdBy && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              Added by {cat.createdBy}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEdit(cat)}
                            disabled={!!deletingName}
                            aria-label={`Edit ${cat.name}`}
                            title="Edit icon, colour or digest marker"
                            className="p-2 rounded-lg text-slate-500 hover:text-brand-600 hover:bg-brand-50 dark:text-slate-400 dark:hover:text-brand-300 dark:hover:bg-slate-800 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteName(isConfirming ? null : cat.name)}
                            disabled={!!deletingName}
                            aria-label={`Remove ${cat.name}`}
                            title="Remove category"
                            className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-red-950/30 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {isConfirming && (
                        <div className="flex flex-wrap items-center justify-between gap-2 pl-12 pt-1 text-xs">
                          <span className="text-slate-600 dark:text-slate-300">
                            Remove from the form? Existing events keep this label.
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteName(null)}
                              disabled={isDeleting}
                              className="h-8 px-3 rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(cat.name)}
                              disabled={isDeleting}
                              className="inline-flex items-center gap-1.5 h-8 px-3 rounded bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-60"
                            >
                              {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                              Remove
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Standard categories */}
          <section aria-labelledby={`${ids}-standard-heading`}>
            <h3 id={`${ids}-standard-heading`} className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400 mb-2.5">
              Standard CCP categories
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {builtInCategories.map((cat) => (
                <div
                  key={cat.name}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-900/30"
                >
                  <span
                    className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${getToneChipClass(cat.color)}`}
                    aria-hidden="true"
                  >
                    <CategoryIcon iconId={cat.icon} className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate flex-1">{cat.name}</span>
                  <span className="shrink-0" title="PDF digest marker">
                    <CategoryShapeMark shape={cat.pdfShape} tone={cat.color} className="w-3.5 h-3.5" />
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <form id={formId} onSubmit={handleSubmit} className="space-y-5" noValidate>
          {formError && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-800 dark:text-red-200" role="alert">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Live preview */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400 mb-2.5">
              Preview
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Submission form pill preview */}
              <span className="inline-flex items-center gap-2 px-3 py-2 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-medium text-slate-800 dark:text-slate-100">
                <CategoryIcon iconId={icon} className={`w-4 h-4 shrink-0 ${getToneIconClass(color)}`} />
                <span>{previewLabel}</span>
              </span>
              {/* Event card badge preview */}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${getToneChipClass(color)}`}>
                <CategoryIcon iconId={icon} className="w-3 h-3 shrink-0" />
                <span>{previewShort}</span>
              </span>
              {/* PDF digest marker preview */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                <CategoryShapeMark shape={pdfShape} tone={color} className="w-3.5 h-3.5" />
                <span>PDF: {previewShort}</span>
              </span>
            </div>
          </div>

          {/* Name & optional short label */}
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_12rem] gap-3">
            <div>
              <label htmlFor={`${ids}-name`} className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                Category name {view === 'add' && <span className="text-red-500" aria-hidden="true">*</span>}
              </label>
              <input
                ref={nameInputRef}
                id={`${ids}-name`}
                type="text"
                value={name}
                disabled={view === 'edit'}
                onChange={(e) => {
                  setName(e.target.value);
                  setFormError(null);
                }}
                placeholder="e.g. Youth & Sports"
                maxLength={MAX_CATEGORY_NAME}
                className={`${inputClass} ${view === 'edit' ? 'opacity-60 cursor-not-allowed' : ''}`}
              />
            </div>
            <div>
              <label htmlFor={`${ids}-short`} className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                Short label <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id={`${ids}-short`}
                type="text"
                value={shortLabel}
                onChange={(e) => {
                  setShortLabel(e.target.value);
                  setFormError(null);
                }}
                placeholder="e.g. Youth"
                maxLength={MAX_SHORT_LABEL}
                className={inputClass}
              />
            </div>
          </div>

          {/* Colour picker */}
          <fieldset>
            <legend className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
              Colour <span className="font-normal text-slate-500 dark:text-slate-400">· {TONE_LABELS[color]}</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_TONES.map((tone) => {
                const selected = color === tone;
                return (
                  <button
                    key={tone}
                    type="button"
                    onClick={() => setColor(tone)}
                    aria-label={TONE_LABELS[tone]}
                    aria-pressed={selected}
                    title={TONE_LABELS[tone]}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-500 dark:focus-visible:ring-offset-slate-800 ${getToneDotClass(tone)} ${
                      selected ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white dark:ring-offset-slate-800 scale-105' : 'hover:scale-105 opacity-85 hover:opacity-100'
                    }`}
                  >
                    {selected && <Check className="w-4 h-4 text-white" strokeWidth={2.75} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* App icon picker */}
          <fieldset>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <legend className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                App icon <span className="font-normal text-slate-500 dark:text-slate-400">· {selectedIconOption.label}</span>
              </legend>
              <div className="relative w-full sm:w-48">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                <input
                  type="search"
                  value={iconSearch}
                  onChange={(e) => setIconSearch(e.target.value)}
                  placeholder="Filter icons…"
                  aria-label="Filter icons"
                  className="w-full h-8 pl-8 pr-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
            </div>

            {filteredIcons.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No icons match “{iconSearch.trim()}”.
              </p>
            ) : (
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-1.5 max-h-48 overflow-y-auto p-0.5">
                {filteredIcons.map((opt) => {
                  const selected = icon === opt.id;
                  const IconComponent = opt.Icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setIcon(opt.id)}
                      aria-label={opt.label}
                      aria-pressed={selected}
                      title={opt.label}
                      className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl border text-[11px] font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                        selected
                          ? 'border-brand-600 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-200 shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 text-slate-600 dark:text-slate-300 hover:border-brand-300 hover:text-brand-600 dark:hover:border-brand-700'
                      }`}
                    >
                      <IconComponent className={`w-5 h-5 ${selected ? getToneIconClass(color) : ''}`} aria-hidden="true" />
                      <span className="truncate max-w-full leading-none">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>

          {/* PDF Digest marker picker */}
          <fieldset>
            <legend className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
              PDF digest marker <span className="font-normal text-slate-500 dark:text-slate-400">· {selectedShapeOption.label}</span>
            </legend>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              Shown next to events and on the overview calendar in the PDF digest (stays distinct in black-and-white print).
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
              {CATEGORY_SHAPE_OPTIONS.map((opt) => {
                const selected = pdfShape === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPdfShape(opt.id)}
                    aria-label={`Digest marker: ${opt.label}`}
                    aria-pressed={selected}
                    title={opt.label}
                    className={`flex flex-col items-center justify-center gap-1.5 py-2 px-1 rounded-xl border text-[11px] font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      selected
                        ? 'border-brand-600 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-200 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 text-slate-600 dark:text-slate-300 hover:border-brand-300 hover:text-brand-600 dark:hover:border-brand-700'
                    }`}
                  >
                    <CategoryShapeMark shape={opt.id} tone={color} className="w-4 h-4" />
                    <span className="truncate max-w-full leading-none">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </form>
      )}
    </ModalShell>
  );
};

export default CategoriesModal;
