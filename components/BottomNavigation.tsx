import React from 'react';
import { CalendarDays, Plus, Inbox, FileText, Download, Search } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface BottomNavigationProps {
    onHomeClick: () => void;
    onCreateClick: () => void;
    createLabel?: string;
    /** Admins: submissions inbox with its pending count */
    onInboxClick?: () => void;
    inboxCount?: number;
    /** Shown in the inbox's place for staff */
    onSearchClick?: () => void;
    onDigestClick?: () => void;
    onExportClick?: () => void;
}

const tab =
    'relative flex flex-1 flex-col items-center justify-center gap-0.5 h-full min-w-0 text-slate-500 dark:text-slate-400 active:text-brand-600 dark:active:text-brand-400 transition-colors';

/** Phone tab bar: the most used actions within thumb reach, "create" raised in the middle */
const BottomNavigation: React.FC<BottomNavigationProps> = ({
    onHomeClick,
    onCreateClick,
    createLabel = 'Create',
    onInboxClick,
    inboxCount = 0,
    onSearchClick,
    onDigestClick,
    onExportClick
}) => {
    const { theme } = useTheme();

    const create = (
        <button
            type="button"
            onClick={onCreateClick}
            className="relative flex flex-1 flex-col items-center justify-end h-full min-w-0 pb-1.5"
            aria-label={createLabel}
        >
            <span className="absolute -top-5 flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30 ring-4 ring-slate-50 dark:ring-slate-900 active:scale-95 transition-transform">
                <Plus className="h-7 w-7" strokeWidth={2.5} />
            </span>
            <span className="text-[10px] font-semibold text-brand-700 dark:text-brand-400 truncate max-w-full">{createLabel}</span>
        </button>
    );

    return (
        <nav
            aria-label="Quick actions"
            className={`fixed bottom-0 inset-x-0 z-40 md:hidden border-t ${theme === 'dark' ? 'glass-panel-dark border-slate-800' : 'glass-panel border-slate-200'} pb-safe`}
        >
            <div className="flex items-stretch h-16 max-w-md mx-auto px-1">
                <button type="button" onClick={onHomeClick} className={`${tab} !text-brand-600 dark:!text-brand-400`} aria-current="page">
                    <CalendarDays className="h-6 w-6" />
                    <span className="text-[10px] font-semibold">Calendar</span>
                </button>

                {onInboxClick ? (
                    <button type="button" onClick={onInboxClick} className={tab} aria-label={`Submissions inbox, ${inboxCount} pending`}>
                        <span className="relative">
                            <Inbox className="h-6 w-6" />
                            {inboxCount > 0 && (
                                <span className="absolute -top-1.5 -right-2.5 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
                                    {inboxCount > 99 ? '99+' : inboxCount}
                                </span>
                            )}
                        </span>
                        <span className="text-[10px] font-medium">Inbox</span>
                    </button>
                ) : onSearchClick && (
                    <button type="button" onClick={onSearchClick} className={tab}>
                        <Search className="h-6 w-6" />
                        <span className="text-[10px] font-medium">Search</span>
                    </button>
                )}

                {create}

                {onDigestClick && (
                    <button type="button" onClick={onDigestClick} className={tab}>
                        <FileText className="h-6 w-6" />
                        <span className="text-[10px] font-medium">Digest</span>
                    </button>
                )}

                {onExportClick && (
                    <button type="button" onClick={onExportClick} className={tab}>
                        <Download className="h-6 w-6" />
                        <span className="text-[10px] font-medium">Export</span>
                    </button>
                )}
            </div>
        </nav>
    );
};

export default BottomNavigation;
