'use client';

/**
 * @fileoverview Admin console layout with authentication and navigation
 */

import { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface AdminLayoutProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/users', label: 'Users', icon: '👥' },
  { href: '/admin/mines', label: 'Mines', icon: '⛏️' },
  { href: '/admin/raids', label: 'Raids', icon: '⚔️' },
  { href: '/admin/tokens', label: 'Tokens', icon: '🪙' },
  { href: '/admin/logs', label: 'Logs', icon: '📋' },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const pathname = usePathname();

  // Check if already authenticated via session storage
  useEffect(() => {
    const authToken = sessionStorage.getItem('admin_auth');
    if (authToken === 'authenticated') {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      
      if (res.ok) {
        sessionStorage.setItem('admin_auth', 'authenticated');
        setIsAuthenticated(true);
      } else {
        setError('Invalid password');
      }
    } catch {
      setError('Authentication failed');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('admin_auth');
    setIsAuthenticated(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-coal-950 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-ember-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-coal-950 flex items-center justify-center p-4">
        <div className="bg-coal-900 border border-coal-700 rounded-xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-display font-bold mb-2">
              <span className="text-ember-500">BLACK GOLD</span>
              <span className="text-coal-400"> ADMIN</span>
            </h1>
            <p className="text-coal-500 text-sm">Enter admin password to continue</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Admin Password"
                className="w-full px-4 py-3 bg-coal-800 border border-coal-600 rounded-lg text-white placeholder-coal-500 focus:border-ember-500 outline-none"
                autoFocus
              />
            </div>
            
            {error && (
              <div className="text-red-400 text-sm text-center">{error}</div>
            )}
            
            <button
              type="submit"
              className="w-full py-3 bg-ember-600 hover:bg-ember-500 text-white font-bold rounded-lg transition-colors"
            >
              Login
            </button>
          </form>
          
          <div className="mt-6 text-center">
            <Link href="/" className="text-coal-500 hover:text-coal-400 text-sm">
              ← Back to Site
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-coal-950 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-coal-900 border-r border-coal-800 flex flex-col">
        <div className="p-6 border-b border-coal-800">
          <h1 className="text-xl font-display font-bold">
            <span className="text-ember-500">BLACK GOLD</span>
            <span className="text-coal-400"> ADMIN</span>
          </h1>
        </div>
        
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-ember-600/20 text-ember-400 border border-ember-600/30'
                        : 'text-coal-400 hover:bg-coal-800 hover:text-white'
                    }`}
                  >
                    <span className="text-lg">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        
        <div className="p-4 border-t border-coal-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-coal-400 hover:text-red-400 hover:bg-coal-800 rounded-lg transition-colors"
          >
            <span>🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>
      
      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
