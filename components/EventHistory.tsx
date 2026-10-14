import React from 'react';
import { History, User, Edit, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { type EventHistoryEntry } from '../types';
import { APP_LOCALE } from '../utils/date';
import { CHANGE_LABELS } from '../utils/eventChanges';

interface EventHistoryProps {
  history: EventHistoryEntry[];
}

const LABELS = new Map(CHANGE_LABELS);
const ORDER = CHANGE_LABELS.map(([key]) => key);

/** Known changes first, in the order of CHANGE_LABELS (stored changes come back in any order) */
const byOrder = ([a]: [string, unknown], [b]: [string, unknown]) =>
  (ORDER.indexOf(a) === -1 ? ORDER.length : ORDER.indexOf(a)) - (ORDER.indexOf(b) === -1 ? ORDER.length : ORDER.indexOf(b));

const present = (value: unknown): boolean => value !== undefined && value !== null && value !== '';

/** What one history entry changed: each field with its old value struck out and the new one */
export const ChangeList: React.FC<{ changes?: EventHistoryEntry['changes'] }> = ({ changes }) => {
  const entries = Object.entries(changes ?? {})
    .filter(([, change]) => !!change && typeof change === 'object' && ('old' in change || 'new' in change))
    .sort(byOrder);
  if (entries.length === 0) return null;

  return (
    <dl className="mt-2 text-xs text-gray-600 dark:text-gray-300 space-y-1.5">
      {entries.map(([field, { old, new: newValue }]) => {
        // "Delete only this occurrence"
        if (field === 'deleted_instance') {
          return (
            <div key={field}>
              <dt className="inline font-medium text-gray-900 dark:text-white">Deleted date: </dt>
              <dd className="inline text-red-600 dark:text-red-400">{String(old || 'N/A')}</dd>
            </div>
          );
        }
        if (!present(old) && !present(newValue)) return null;
        return (
          <div key={field}>
            <dt className="inline font-medium text-gray-900 dark:text-white">
              {LABELS.get(field) ?? field.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}:{' '}
            </dt>
            <dd className="inline whitespace-pre-line [overflow-wrap:anywhere]">
              {present(old) && (
                <del className="text-red-600 dark:text-red-400">{String(old)}</del>
              )}
              {present(old) && present(newValue) && <span className="mx-1.5 text-gray-500 dark:text-gray-400" aria-label="changed to">→</span>}
              {present(newValue) && (
                <ins className="no-underline text-green-700 dark:text-green-400">{String(newValue)}</ins>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
};

export const historyIcon = (action: string) => {
  switch (action) {
    case 'created':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'updated':
      return <Edit className="h-4 w-4 text-blue-500" />;
    case 'deleted':
      return <Trash2 className="h-4 w-4 text-red-500" />;
    case 'status_changed':
      return <XCircle className="h-4 w-4 text-yellow-500" />;
    default:
      return <History className="h-4 w-4 text-gray-500 dark:text-gray-400" />;
  }
};

export const historyActionText = (action: string): string => {
  switch (action) {
    case 'created':
      return 'created';
    case 'updated':
      return 'updated';
    case 'deleted':
      return 'deleted';
    case 'status_changed':
      return 'changed status';
    default:
      return action;
  }
};

const EventHistory: React.FC<EventHistoryProps> = ({ history }) => {
  if (!history || history.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
      <div className="flex items-center mb-4">
        <History className="h-5 w-5 text-gray-400 dark:text-gray-500 mr-2" />
        <h4 className="text-sm font-medium text-gray-900 dark:text-white">History ({history.length})</h4>
      </div>

      <div className="space-y-3">
        {history.map((entry) => (
          <div key={entry.id} className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="flex-shrink-0 mt-0.5">
              {historyIcon(entry.action)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <User className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">{entry.userName}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {historyActionText(entry.action)} this event
                </span>
              </div>
              <ChangeList changes={entry.changes} />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {new Date(entry.timestamp).toLocaleString(APP_LOCALE, { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EventHistory;
