'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type IconName = 'home' | 'bag' | 'history' | 'users' | 'tag' | 'calendar' | 'chart' | 'settings' | 'search' | 'userPlus' | 'clipboard';

type SideNavItem = {
  href: string;
  label: string;
  icon: IconName;
  section: 'geral' | 'operacao' | 'cadastro' | 'controle' | 'configuracoes';
  mobileLabel?: string;
  hideOnMobile?: boolean;
};

const sideNavItems: SideNavItem[] = [
  { href: '/dashboard', label: 'Início', mobileLabel: 'Início', icon: 'home', section: 'geral' },
  { href: '/operacao', label: 'Próximas ações', mobileLabel: 'Ações', icon: 'clipboard', section: 'geral' },
  { href: '/pedidos/novo', label: 'Vendas', mobileLabel: 'Vendas', icon: 'bag', section: 'operacao' },
  { href: '/pedidos/historico', label: 'Histórico de vendas', mobileLabel: 'Histórico', icon: 'history', section: 'operacao' },
  { href: '/clientes', label: 'Clientes', mobileLabel: 'Clientes', icon: 'users', section: 'cadastro' },
  { href: '/produtos', label: 'Produtos e serviços', mobileLabel: 'Itens', icon: 'tag', section: 'cadastro' },
  { href: '/vencimentos', label: 'Cobranças', mobileLabel: 'Cobranças', icon: 'calendar', section: 'controle' },
  { href: '/relatorios', label: 'Relatórios', mobileLabel: 'Rel.', icon: 'chart', section: 'controle' },
  { href: '/configuracoes/negocio', label: 'Modelo de negócio', icon: 'settings', section: 'configuracoes', hideOnMobile: true },
  { href: '/configuracoes', label: 'Configurações', mobileLabel: 'Config.', icon: 'settings', section: 'configuracoes', hideOnMobile: true }
];

const sections: Array<{ key: SideNavItem['section']; label: string }> = [
  { key: 'geral', label: 'Geral' },
  { key: 'operacao', label: 'Operação' },
  { key: 'cadastro', label: 'Cadastro' },
  { key: 'controle', label: 'Controle' },
  { key: 'configuracoes', label: 'Configurações' }
];

const titles: Record<string, string> = {
  '/dashboard': 'Início',
  '/operacao': 'Próximas ações',
  '/clientes': 'Clientes',
  '/pedidos': 'Vendas',
  '/pedidos/novo': 'Nova venda',
  '/pedidos/historico': 'Histórico de vendas',
  '/vendas': 'Nova venda',
  '/vencimentos': 'Cobranças',
  '/produtos': 'Produtos e serviços',
  '/relatorios': 'Relatórios',
  '/configuracoes': 'Configurações',
  '/configuracoes/negocio': 'Modelo de negócio'
};

function ChevronDownIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
}

function Icon({ name }: { name: IconName }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5" /><path d="M9.5 20v-5h5v5" /></>,
    bag: <><path d="M7 8h10l1 12H6L7 8Z" /><path d="M9 8a3 3 0 0 1 6 0" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v6h6" /><path d="M12 7v5l3 2" /></>,
    users: <><path d="M16 20a4 4 0 0 0-8 0" /><circle cx="12" cy="8" r="3" /><path d="M20 19a3.5 3.5 0 0 0-3-3.4" /><path d="M17 5.5a2.5 2.5 0 0 1 0 5" /></>,
    tag: <><path d="M20 13 13 20 4 11V4h7l9 9Z" /><path d="M7.5 7.5h.01" /></>,
    calendar: <><path d="M7 3v4" /><path d="M17 3v4" /><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M4 10h16" /></>,
    chart: <><path d="M4 20h16" /><path d="M7 16v-5" /><path d="M12 16V7" /><path d="M17 16v-8" /></>,
    settings: <><circle cx="12" cy="12" r="3.5" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a8 8 0 0 0-2-1.2L14.2 3h-4.4l-.3 2.7a8 8 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 2 1.2l.3 2.7h4.4l.3-2.7a8 8 0 0 0 2-1.2l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    userPlus: <><path d="M15 20a5 5 0 0 0-10 0" /><circle cx="10" cy="8" r="3" /><path d="M19 8v6" /><path d="M16 11h6" /></>,
    clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5V3h6v1.5" /><path d="m9 13 2 2 4-5" /></>
  };
  return <svg {...common}>{paths[name]}</svg>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  useEffect(() => setAccountMenuOpen(false), [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ensureViewport = () => {
      let viewport = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
      if (!viewport) {
        viewport = document.createElement('meta');
        viewport.name = 'viewport';
        document.head.appendChild(viewport);
      }
      viewport.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content';
      const mobile = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
      document.documentElement.classList.toggle('mobile-real', mobile && Math.min(window.innerWidth, window.screen?.width || window.innerWidth) <= 900);
      document.documentElement.style.overflowX = 'hidden';
      document.body.style.overflowX = 'hidden';
    };
    ensureViewport();
    window.addEventListener('orientationchange', ensureViewport);
    window.visualViewport?.addEventListener('resize', ensureViewport);
    return () => {
      window.removeEventListener('orientationchange', ensureViewport);
      window.visualViewport?.removeEventListener('resize', ensureViewport);
    };
  }, [pathname]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
      if (!data.session) router.replace('/login');
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      if (!currentSession) router.replace('/login');
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  const title = useMemo(() => {
    if (pathname?.startsWith('/clientes/') && pathname !== '/clientes') return 'Ficha do cliente';
    return titles[pathname || '/dashboard'] || 'FichaPRO';
  }, [pathname]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const isItemActive = (href: string) => {
    if (href === '/clientes') return pathname === '/clientes' || pathname?.startsWith('/clientes/');
    if (href === '/pedidos/novo') return pathname === '/pedidos/novo' || pathname === '/vendas';
    return pathname === href;
  };

  if (loading) return <div className="loading-screen">Carregando seu sistema...</div>;
  if (!session) return null;

  return (
    <div className="app-shell">
      <aside className="sidebar retrofit-sidebar">
        <Link className="brand brand-with-logo" href="/dashboard" aria-label="FichaPRO - Início">
          <img className="brand-logo-horizontal" src="/brand/logo-horizontal-transparent.png" alt="FichaPRO" />
          <span className="brand-subtitle">Gestão para pequenos negócios</span>
        </Link>
        <nav className="side-nav grouped-side-nav" aria-label="Navegação principal">
          {sections.map((section) => (
            <div className="nav-section" key={section.key}>
              <span className="nav-section-title">{section.label}</span>
              {sideNavItems.filter((item) => item.section === section.key).map((item) => (
                <Link key={item.href} className={`nav-item ${isItemActive(item.href) ? 'active' : ''}`} href={item.href}>
                  <span className="nav-icon"><Icon name={item.icon} /></span>{item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className={`sidebar-account-card ${accountMenuOpen ? 'open' : ''}`}>
          <div className="account-avatar brand-avatar"><img src="/brand/logo-icon-transparent.png" alt="" aria-hidden="true" /></div>
          <div><strong>Empresa</strong><small>FichaPRO DEV</small></div>
          <button className="account-menu-toggle" type="button" onClick={() => setAccountMenuOpen((value) => !value)} aria-label="Abrir opções da conta" aria-expanded={accountMenuOpen}><ChevronDownIcon /></button>
          {accountMenuOpen && <div className="account-popover" role="menu"><button className="account-popover-item" type="button" onClick={handleLogout} role="menuitem">Sair</button></div>}
        </div>
      </aside>

      <main className="main-content retrofit-main">
        <div className="mobile-topbar">
          <Link className="brand brand-with-logo mobile-brand-logo" href="/dashboard"><img className="brand-logo-horizontal" src="/brand/logo-horizontal-transparent.png" alt="FichaPRO" /></Link>
          <button className="ghost-button small" onClick={handleLogout}>Sair</button>
        </div>
        <header className="topbar retrofit-topbar">
          <div className="page-title-clean"><h1>{title}</h1></div>
          <div className="top-actions">
            <Link className="ghost-button icon-action" href="/clientes?novo=1"><Icon name="userPlus" /> Novo cliente</Link>
            <Link className="primary-button icon-action" href="/pedidos/novo"><Icon name="bag" /> Nova venda</Link>
          </div>
        </header>
        {children}
      </main>

      <nav className="mobile-nav" aria-label="Navegação mobile">
        {sideNavItems.filter((item) => !item.hideOnMobile && ['/dashboard', '/operacao', '/pedidos/novo', '/clientes', '/vencimentos'].includes(item.href)).map((item) => (
          <Link key={item.href} className={`mobile-nav-item ${isItemActive(item.href) ? 'active' : ''}`} href={item.href}>
            <span><Icon name={item.icon} /></span><small>{item.mobileLabel || item.label}</small>
          </Link>
        ))}
      </nav>
    </div>
  );
}
