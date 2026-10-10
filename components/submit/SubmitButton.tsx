import React from 'react';
import { Send } from 'lucide-react';

export const SUBMIT_FORM_ID = 'submit-event-form';

/** "Check & submit" (staff) or "Publish event" (admins); `full` for the phone's bottom bar */
const SubmitButton: React.FC<{ isAdmin: boolean; isSubmitting: boolean; full?: boolean }> = ({ isAdmin, isSubmitting, full }) => (
  <button
    type="submit"
    form={SUBMIT_FORM_ID}
    disabled={isSubmitting}
    className={`cta ${full ? 'w-full' : 'shrink-0'} inline-flex items-center justify-center gap-2 h-12 px-6 bg-brand-600 hover:bg-brand-700 text-white rounded shadow-md shadow-brand-600/20 transition-colors disabled:opacity-60`}
  >
    {isSubmitting ? (
      <>
        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        {isAdmin ? 'Publishing…' : 'Sending…'}
      </>
    ) : (
      <>
        <Send className="w-4 h-4" />
        {isAdmin ? 'Publish event' : 'Check & submit'}
      </>
    )}
  </button>
);

export default SubmitButton;
