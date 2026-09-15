import React from 'react';
import { History, User, Edit, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { EventHistoryEntry } from '../types';

interface EventHistoryProps {
  history: EventHistoryEntry[];
}

const EventHistory: React.FC<EventHistoryProps> = ({ history }) => {
  if (!history || history.length === 0) {
    return null;
  }

  const getActionIcon = (action: string) => {
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

  const getActionText = (action: string) => {
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

  const formatChanges = (changes?: Record<string, { old: any; new: any }>) => {
    if (!changes || Object.keys(changes).length === 0) {
      return null;
    }

    return (
      <div className="mt-2 text-xs text-gray-600 dark:text-gray-300 space-y-1">
        {Object.entries(changes).map(([field, change]) => {
          // Handle case where change might not have old/new structure
          if (!change || typeof change !== 'object' || (!('old' in change) && !('new' in change))) {
            // Fallback for malformed data
            return null;
          }

          const { old, new: newValue } = change;
          
          // Special handling for deleted_instance
          if (field === 'deleted_instance') {
            return (
              <div key={field} className="flex items-center">
                <span className="font-medium text-gray-900 dark:text-white">Deleted instance:</span>
                <span className="ml-2 text-red-600 dark:text-red-400">{String(old || 'N/A')}</span>
              </div>
            );
          }

          // Skip if both values are undefined or null
          if ((old === undefined || old === null) && (newValue === undefined || newValue === null)) {
            return null;
          }

          return (
            <div key={field} className="flex items-center">
              <span className="font-medium capitalize text-gray-900 dark:text-white">{field.replace(/_/g, ' ')}:</span>
              {old !== undefined && old !== null && (
                <>
                  <span className="ml-2 line-through text-red-600 dark:text-red-400">{String(old)}</span>
                  <span className="mx-2 text-gray-600 dark:text-gray-400">→</span>
                </>
              )}
              {newValue !== undefined && newValue !== null && (
                <span className="text-green-600 dark:text-green-400">{String(newValue)}</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

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
              {getActionIcon(entry.action)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <User className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">{entry.userName}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {getActionText(entry.action)} this event
                </span>
              </div>
              {formatChanges(entry.changes)}
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {new Date(entry.timestamp).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EventHistory;
