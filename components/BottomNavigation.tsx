import React from 'react';
import { CalendarDays, Plus, Inbox, FileText, History, CalendarCheck } from 'lucide-react';

interface BottomNavigationProps {
    onHomeClick: () => void;
    onCreateClick: () => void;
    createLabel?: string;
    /** Admins: submissions inbox with its pending count */
    onInboxClick?: () => void;
    inboxCount?: number;
    /** Staff, in the inbox's place: the events they sent in, and whether they are published yet */
    onMyEventsClick?: () => void;
    onDigestClick?: () => void;
    /** Admins: the change log, with the staff edits made since it was last opened */
    onChangeLogClick?: () => void;
    changeLogCount?: number;
}

const tab =
    'relative flex flex-1 flex-col items-center justify-center gap-0.5 h-full min-w-0 text-slate-500 dark:text-slate-400 active:text-brand-600 dark:active:text-brand-400 transition-colors';

const Badge: React.FC<{ count: number }> = ({ count }) => (
    <span className="absolute -top-1.5 -right-2.5 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-brand-600 text-white text-[11px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
        {count > 99 ? '99+' : count}
    </span>
);

/** Phone tab bar: the most used actions within thumb reach, "create" raised in the middle. Solid,
 * so the events scrolling under it never show through its labels */
const BottomNavigation: React.FC<BottomNavigationProps> = ({
    onHomeClick,
    onCreateClick,
    createLabel = 'Create',
    onInboxClick,
    inboxCount = 0,
    onMyEventsClick,
    onDigestClick,
    onChangeLogClick,
    changeLogCount = 0
}) => {

    const create = (
        <button
            type="button"
            onClick={onCreateClick}
            className="relative flex flex-1 flex-col items-center justify-end h-full min-w-0 pb-1.5"
            aria-label={createLabel}
        >
            <span className="absolute -top-5 flex items-center justify-center w-14 h-14 rounded-leaf-sm bg-brand-600 text-white shadow-lg shadow-brand-600/30 ring-4 ring-slate-50 dark:ring-slate-900 active:scale-95 transition-transform">
                <Plus className="h-7 w-7" strokeWidth={2.5} />
            </span>
            <span className="text-[11px] font-semibold text-brand-700 dark:text-brand-400 truncate max-w-full">{createLabel}</span>
        </button>
    );

    return (
        <nav
            aria-label="Quick actions"
            className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-slate-200 bg-white dark-panel shadow-[0_-2px_8px_rgba(0,0,0,0.04)] pb-safe"
        >
            <div className="flex items-stretch h-16 max-w-md mx-auto px-1">
                <button type="button" onClick={onHomeClick} className={`${tab} !text-brand-600 dark:!text-brand-400`} aria-current="page" title="Back to today">
                    <CalendarDays className="h-6 w-6" />
                    <span className="text-[11px] font-semibold">Calendar</span>
                </button>

                {onInboxClick ? (
                    <button type="button" onClick={onInboxClick} className={tab} aria-label={`Submissions inbox, ${inboxCount} to review`}>
                        <span className="relative">
                            <Inbox className="h-6 w-6" />
                            {inboxCount > 0 && <Badge count={inboxCount} />}
                        </span>
                        <span className="text-[11px] font-medium">Inbox</span>
                    </button>
                ) : onMyEventsClick && (
                    <button type="button" onClick={onMyEventsClick} className={tab}>
                        <CalendarCheck className="h-6 w-6" />
                        <span className="text-[11px] font-medium whitespace-nowrap">My events</span>
                    </button>
                )}

                {create}

                {onDigestClick && (
                    <button type="button" onClick={onDigestClick} className={tab}>
                        <FileText className="h-6 w-6" />
                        <span className="text-[11px] font-medium">Digest</span>
                    </button>
                )}

                {onChangeLogClick && (
                    <button
                        type="button"
                        onClick={onChangeLogClick}
                        className={tab}
                        aria-label={changeLogCount > 0 ? `Change log, ${changeLogCount} new` : 'Change log'}
                    >
                        <span className="relative">
                            <History className="h-6 w-6" />
                            {changeLogCount > 0 && <Badge count={changeLogCount} />}
                        </span>
                        <span className="text-[11px] font-medium whitespace-nowrap">Change log</span>
                    </button>
                )}
            </div>
        </nav>
    );
};

export default BottomNavigation;
