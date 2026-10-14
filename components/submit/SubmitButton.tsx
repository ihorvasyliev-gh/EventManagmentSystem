import React from 'react';
import { Save, Send } from 'lucide-react';

export const SUBMIT_FORM_ID = 'submit-event-form';

/** "Check & submit" (staff), "Publish event" (admins) or "Save changes" (staff editing their event); `full` for the phone's bottom bar */
const SubmitButton: React.FC<{ isAdmin: boolean; isSubmitting: boolean; editing?: boolean; full?: boolean }> = ({ isAdmin, isSubmitting, editing, full }) => (
  <button
    type="submit"
    form={SUBMIT_FORM_ID}
    disabled={isSubmitting}
    className={`cta ${full ? 'w-full' : 'shrink-0'} inline-flex items-center justify-center gap-2 h-12 px-6 bg-brand-600 hover:bg-brand-700 text-white rounded shadow-md shadow-brand-600/20 transition-colors disabled:opacity-60`}
  >
    {isSubmitting ? (
      <>
        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        {editing ? 'Saving…' : isAdmin ? 'Publishing…' : 'Sending…'}
      </>
    ) : (
      <>
        {editing ? <Save className="w-4 h-4" /> : <Send className="w-4 h-4" />}
        {editing ? 'Save changes' : isAdmin ? 'Publish event' : 'Check & submit'}
      </>
    )}
  </button>
);

export default SubmitButton;
