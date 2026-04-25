import { Link, useLocation } from 'react-router-dom';
import { BotIcon, LayoutDashboardIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-900 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          <BotIcon className="w-7 h-7 text-brand-100" />
          <Link to="/" className="text-xl font-bold tracking-tight">
            AI QA Agent Platform
          </Link>
          <nav className="ml-auto flex gap-4">
            <Link
              to="/"
              className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
                location.pathname === '/'
                  ? 'bg-brand-700 text-white'
                  : 'text-brand-100 hover:bg-brand-700'
              }`}
            >
              <LayoutDashboardIcon className="w-4 h-4" />
              Dashboard
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        {children}
      </main>

      <footer className="border-t bg-white text-center text-xs text-gray-400 py-4">
        AI QA Agent Platform — Phase 1
      </footer>
    </div>
  );
}
