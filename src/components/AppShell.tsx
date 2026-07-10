'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Empresa, ModulosEmpresa } from '@/lib/types';

type IconName = 'home' | 'bag' | 'history' | 'users' | 'tag' | 'calendar' | 'chart' | 'settings' | 'search' | 'userPlus' | 'clipboard' | 'sparkles' | 'creditCard' | 'inbox';
type SectionKey = 'geral' | 'vendas' | 'relacionamento' | 'gestao' | 'configuracoes';

type SideNavItem = {
  href: string;
  label: string;
  icon: IconName;
  section: SectionKey;
  mobileLabel?: string;
  hideOnMobile?: boolean;
  module?: keyof ModulosEmpresa;
};

const baseNavItems: SideNavItem[] = [
  { href: '/dashboard', label: 'Início', mobileLabel: 'Início', icon: 'home', section: 'geral' },
  { href: '/caixa-de-entrada', label: 'Caixa de entrada', mobileLabel: 'Caixa', icon: 'inbox', section: 'geral', module: 'whatsapp' },
  { href: '/operacao', label: 'Próximas ações', mobileLabel: 'Ações', icon: 'clipboard', section: 'geral', module: 'tarefas' },
  { href: '/pedidos/novo', label: 'Nova venda', mobileLabel: 'Vender', icon: 'bag', section: 'vendas', module: 'vendas' },
  { href: '/pedidos/historico', label: 'Histórico de vendas', icon: 'history', section: 'vendas', hideOnMobile: true, module: 'vendas' },
  { href: '/clientes', label: 'Clientes', mobileLabel: 'Clientes', icon: 'users', section: 'relacionamento' },
  { href: '/produtos', label: 'Produtos e serviços', icon: 'tag', section: 'relacionamento', hideOnMobile: true },
  { href: '/vencimentos', label: 'Cobranças e vencimentos', mobileLabel: 'Cobrar', icon: 'calendar', section: 'gestao' },
  { href: '/pagamentos', label: 'Pagamentos integrados', icon: 'creditCard', section: 'gestao', hideOnMobile: true, module: 'pagamentos' },
  { href: '/automacoes', label: 'Automações', mobileLabel: 'Automação', icon: 'sparkles', section: 'gestao' },
  { href: '/relatorios', label: 'Relatórios', icon: 'chart', section: 'gestao', hideOnMobile: true },
  { href: '/configuracoes/negocio', label: 'Personalização', icon: 'settings', section: 'configuracoes', hideOnMobile: true },
  { href: '/configuracoes', label: 'Equipe e acessos', icon: 'users', section: 'configuracoes', hideOnMobile: true }
];

const sections: Array<{ key: SectionKey; label: string }> = [
  { key: 'geral', label: 'Visão do dia' },
  { key: 'vendas', label: 'Vendas' },
  { key: 'relacionamento', label: 'Relacionamento' },
  { key: 'gestao', label: 'Gestão e automação' },
  { key: 'configuracoes', label: 'Empresa' }
];

const titles: Record<string, string> = {
  '/dashboard': 'Início', '/caixa-de-entrada': 'Caixa de entrada', '/operacao': 'Próximas ações', '/clientes': 'Clientes', '/pedidos': 'Vendas',
  '/pedidos/novo': 'Nova venda', '/pedidos/historico': 'Histórico de vendas', '/vendas': 'Nova venda',
  '/vencimentos': 'Cobranças e vencimentos', '/pagamentos': 'Pagamentos integrados', '/automacoes': 'Automações',
  '/produtos': 'Produtos e serviços', '/relatorios': 'Relatórios', '/configuracoes': 'Equipe e acessos',
  '/configuracoes/negocio': 'Personalização'
};

const pageContexts: Record<string, string> = {
  '/dashboard': 'Visão geral', '/caixa-de-entrada': 'Atendimento', '/operacao': 'Operação', '/pedidos/novo': 'Comercial', '/pedidos/historico': 'Comercial',
  '/clientes': 'Relacionamento', '/produtos': 'Catálogo', '/vencimentos': 'Financeiro', '/pagamentos': 'Financeiro',
  '/automacoes': 'Inteligência operacional', '/relatorios': 'Análises', '/configuracoes': 'Administração', '/configuracoes/negocio': 'Administração'
};

function ChevronDownIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>; }

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
    clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5V3h6v1.5" /><path d="m9 13 2 2 4-5" /></>,
    sparkles: <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z" /><path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z" /><path d="m5 13 .7 2.3L8 16l-2.3.7L5 19l-.7-2.3L2 16l2.3-.7L5 13Z" /></>,
    creditCard: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18" /><path d="M7 15h4" /></>,
    inbox: <><path d="M4 5h16v14H4z" /><path d="M4 14h4l2 3h4l2-3h4" /><path d="M8 9h8" /></>
  };
  return <svg {...common}>{paths[name]}</svg>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [company, setCompany] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  useEffect(() => setAccountMenuOpen(false), [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ensureViewport = () => {
      let viewport = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
      if (!viewport) { viewport = document.createElement('meta'); viewport.name = 'viewport'; document.head.appendChild(viewport); }
      viewport.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content';
      const mobile = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
      document.documentElement.classList.toggle('mobile-real', mobile && Math.min(window.innerWidth, window.screen?.width || window.innerWidth) <= 900);
      document.documentElement.style.overflowX = 'hidden'; document.body.style.overflowX = 'hidden';
    };
    ensureViewport(); window.addEventListener('orientationchange', ensureViewport); window.visualViewport?.addEventListener('resize', ensureViewport);
    return () => { window.removeEventListener('orientationchange', ensureViewport); window.visualViewport?.removeEventListener('resize', ensureViewport); };
  }, [pathname]);

  useEffect(() => {
    let mounted = true;
    const loadCompany = async () => {
      const { data } = await supabase.from('empresas').select('id,nome,plano,status,perfil_negocio,modulos,configuracoes').order('created_at').limit(1);
      if (mounted) setCompany((data?.[0] as Empresa | undefined) || null);
    };
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session); setLoading(false);
      if (!data.session) router.replace('/login'); else await loadCompany();
    });
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      setSession(currentSession);
      if (!currentSession) router.replace('/login'); else await loadCompany();
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [router]);

  const terms = useMemo(() => ({
    customer: String(company?.configuracoes?.termo_cliente || 'Cliente'),
    sale: String(company?.configuracoes?.termo_venda || 'Venda'),
    item: String(company?.configuracoes?.termo_produto || 'Produto ou serviço')
  }), [company]);

  const navItems = useMemo(() => baseNavItems
    .filter((item) => !item.module || company?.modulos?.[item.module] !== false)
    .map((item) => {
      if (item.href === '/clientes') return { ...item, label: `${terms.customer}s`, mobileLabel: terms.customer };
      if (item.href === '/pedidos/novo') return { ...item, label: `Nova ${terms.sale.toLowerCase()}`, mobileLabel: terms.sale };
      if (item.href === '/pedidos/historico') return { ...item, label: `Histórico de ${terms.sale.toLowerCase()}s` };
      if (item.href === '/produtos') return { ...item, label: `${terms.item}s` };
      return item;
    }), [company?.modulos, terms]);

  const title = useMemo(() => {
    if (pathname?.startsWith('/clientes/') && pathname !== '/clientes') return `Ficha do ${terms.customer.toLowerCase()}`;
    const base = titles[pathname || '/dashboard'] || 'FichaPRO';
    if (pathname === '/clientes') return `${terms.customer}s`;
    if (pathname === '/pedidos/novo') return `Nova ${terms.sale.toLowerCase()}`;
    if (pathname === '/produtos') return `${terms.item}s`;
    return base;
  }, [pathname, terms]);

  const context = pageContexts[pathname || '/dashboard'] || 'FichaPRO';
  const handleLogout = async () => { await supabase.auth.signOut(); router.replace('/login'); };
  const isItemActive = (href: string) => {
    if (href === '/clientes') return pathname === '/clientes' || pathname?.startsWith('/clientes/');
    if (href === '/pedidos/novo') return pathname === '/pedidos/novo' || pathname === '/vendas';
    if (href === '/configuracoes') return pathname === '/configuracoes';
    return pathname === href;
  };

  if (loading) return <div className="loading-screen">Carregando seu sistema...</div>;
  if (!session) return null;

  const accent = String(company?.configuracoes?.cor_marca || '#8f4f35');
  const companyName = String(company?.configuracoes?.nome_exibicao || company?.nome || 'Minha empresa');
  const salesEnabled = company?.modulos?.vendas !== false;

  return (
    <div className="app-shell" style={{ '--company-accent': accent } as React.CSSProperties}>
      <aside className="sidebar retrofit-sidebar">
        <Link className="brand brand-with-logo" href="/dashboard" aria-label="FichaPRO - Início"><img className="brand-logo-horizontal" src="/brand/logo-horizontal-transparent.png" alt="FichaPRO" /><span className="brand-subtitle">Do atendimento à próxima ação</span></Link>
        <nav className="side-nav grouped-side-nav" aria-label="Navegação principal">
          {sections.map((section) => {
            const items = navItems.filter((item) => item.section === section.key);
            if (items.length === 0) return null;
            return <div className="nav-section" key={section.key}><span className="nav-section-title">{section.label}</span>{items.map((item) => <Link key={item.href} className={`nav-item ${isItemActive(item.href) ? 'active' : ''}`} href={item.href}><span className="nav-icon"><Icon name={item.icon} /></span>{item.label}</Link>)}</div>;
          })}
        </nav>
        <div className={`sidebar-account-card ${accountMenuOpen ? 'open' : ''}`}>
          <div className="account-avatar brand-avatar" style={{ background: accent }}>{companyName.slice(0,2).toUpperCase()}</div>
          <div><strong>{companyName}</strong><small>{company?.plano || 'FichaPRO DEV'}</small></div>
          <button className="account-menu-toggle" type="button" onClick={() => setAccountMenuOpen((value) => !value)} aria-label="Abrir opções da conta" aria-expanded={accountMenuOpen}><ChevronDownIcon /></button>
          {accountMenuOpen && <div className="account-popover" role="menu"><Link className="account-popover-item" href="/configuracoes/negocio" role="menuitem">Personalizar</Link><button className="account-popover-item" type="button" onClick={handleLogout} role="menuitem">Sair</button></div>}
        </div>
      </aside>

      <main className="main-content retrofit-main">
        <div className="mobile-topbar"><Link className="brand brand-with-logo mobile-brand-logo" href="/dashboard"><img className="brand-logo-horizontal" src="/brand/logo-horizontal-transparent.png" alt="FichaPRO" /></Link><button className="ghost-button small" onClick={handleLogout}>Sair</button></div>
        <header className="topbar retrofit-topbar"><div className="page-title-clean"><span className="eyebrow">{context}</span><h1>{title}</h1></div><div className="top-actions"><Link className="ghost-button icon-action" href="/clientes?novo=1"><Icon name="userPlus" /> Novo {terms.customer.toLowerCase()}</Link>{salesEnabled && <Link className="primary-button icon-action" href="/pedidos/novo"><Icon name="bag" /> Nova {terms.sale.toLowerCase()}</Link>}</div></header>
        {children}
      </main>

      <nav className="mobile-nav" aria-label="Navegação mobile">
        {navItems.filter((item) => !item.hideOnMobile && ['/dashboard','/caixa-de-entrada','/operacao','/pedidos/novo','/clientes'].includes(item.href)).map((item) => <Link key={item.href} className={`mobile-nav-item ${isItemActive(item.href) ? 'active' : ''}`} href={item.href}><span><Icon name={item.icon} /></span><small>{item.mobileLabel || item.label}</small></Link>)}
      </nav>
    </div>
  );
}
