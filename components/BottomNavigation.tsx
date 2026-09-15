import React from 'react';
import { Home, PlusSquare } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface BottomNavigationProps {
    onHomeClick: () => void;
    onCreateClick: () => void;
    showCreateButton: boolean;
    activeTab: 'home' | 'create';
}

const BottomNavigation: React.FC<BottomNavigationProps> = ({
    onHomeClick,
    onCreateClick,
    showCreateButton,
    activeTab
}) => {
    const { theme } = useTheme();

    return (
        <div className={`fixed bottom-0 left-0 right-0 z-40 md:hidden border-t ${theme === 'dark' ? 'glass-panel-dark border-slate-800' : 'glass-panel border-slate-200'} pb-safe`}>
            <div className="flex justify-around items-center h-16">
                <button
                    onClick={onHomeClick}
                    className={`flex flex-col items-center justify-center w-full h-full space-y-1 min-h-[44px] ${activeTab === 'home' ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400'}`}
                >
                    <Home className={`h-6 w-6 ${activeTab === 'home' ? 'fill-current opacity-20' : ''}`} />
                    <span className="text-[10px] font-medium">Home</span>
                </button>

                {showCreateButton && (
                    <button
                        onClick={onCreateClick}
                        className={`flex flex-col items-center justify-center w-full h-full space-y-1 min-h-[44px] ${activeTab === 'create' ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400'}`}
                    >
                        <PlusSquare className={`h-6 w-6 ${activeTab === 'create' ? 'fill-current opacity-20' : ''}`} />
                        <span className="text-[10px] font-medium">Create</span>
                    </button>
                )}
            </div>
        </div>
    );
};

export default BottomNavigation;
