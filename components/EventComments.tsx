import React, { useState, useCallback } from 'react';
import { MessageCircle, Send, User, Trash2 } from 'lucide-react';
import { EventComment } from '../types';

interface EventCommentsProps {
  comments: EventComment[];
  currentUserId: string;
  currentUserName: string;
  onAddComment: (content: string) => Promise<void>;
  onDeleteComment?: (commentId: string) => Promise<void>;
}

const EventComments: React.FC<EventCommentsProps> = ({
  comments,
  currentUserId,
  currentUserName,
  onAddComment,
  onDeleteComment
}) => {
  const [newComment, setNewComment] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    const commentText = newComment.trim();
    setNewComment(''); // Clear input immediately for better UX
    
    try {
      await onAddComment(commentText);
    } catch (err) {
      console.error('Failed to add comment', err);
      // Restore comment text on error so user can retry
      setNewComment(commentText);
    }
  };

  return (
    <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
      <div className="flex items-center mb-4">
        <MessageCircle className="h-5 w-5 text-gray-400 dark:text-gray-500 mr-2" />
        <h4 className="text-sm font-medium text-gray-900 dark:text-white">Comments ({comments.length})</h4>
      </div>

      {/* Comments List */}
      <div className="space-y-4 mb-4 max-h-64 overflow-y-auto">
        {comments.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No comments yet. Be the first to comment!</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{comment.userName}</p>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(comment.createdAt).toLocaleDateString()} at{' '}
                    {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">{comment.content}</p>
              </div>
              {onDeleteComment && comment.userId === currentUserId && (
                <button
                  onClick={() => onDeleteComment(comment.id)}
                  className="p-1 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 rounded-full transition-colors"
                  title="Delete comment"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add Comment Form */}
      <form onSubmit={handleSubmit} className="flex items-start space-x-2">
        <div className="flex-1">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            rows={2}
            className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={!newComment.trim()}
          className="flex-shrink-0 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
};

// Memoize component to prevent unnecessary re-renders
export default React.memo(EventComments, (prevProps, nextProps) => {
  // Only re-render if comments array changed (by length or IDs)
  if (prevProps.comments.length !== nextProps.comments.length) return false;
  if (prevProps.currentUserId !== nextProps.currentUserId) return false;
  if (prevProps.currentUserName !== nextProps.currentUserName) return false;
  if (prevProps.onDeleteComment !== nextProps.onDeleteComment) return false;
  
  // Check if any comment IDs changed
  const prevIds = prevProps.comments.map(c => c.id).join(',');
  const nextIds = nextProps.comments.map(c => c.id).join(',');
  if (prevIds !== nextIds) return false;
  
  return true; // Props are equal, skip re-render
});
