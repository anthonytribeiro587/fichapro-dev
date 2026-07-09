
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Notice } from '@/components/Notice';
import { supabase } from '@/lib/supabase';
import { addDaysISO, formatCurrency, formatDate, getParcelaSituacao, initials, todayISO, whatsappLink } from '@/lib/format';
import type { Parcela } from '@/lib/types';

type FilterKey = 'abertos' | 'atrasados' | 'hoje' | '7dias' | '30dias' | 'todos';

type SectionItem = {
  key: string;
  title: string;
  tone: 'overdue' | 'today' | 'future';
  items: Parcela[];
  total: number;
};

const filters: { key: FilterKey; label: string }[] = [
  { key: 'abertos', label: 'Abertos' },
  { key: 'atrasados', label: 'Atrasados' },
  { key: 'hoje', label: 'Hoje' },
  { key: '7dias', label: '7 dias' },
  { key: '30dias', label: '30 dias' },
  { key: 'todos', label: 'Todos' }
];

function parseDateValue(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function saleNumberMapFromParcelas(parcelas: Parcela[]) {
  const vendas = new Map<string, NonNullable<Parcela['vendas']>>();
  parcelas.forEach((parcela) => {
    if (parcela.vendas?.id && !vendas.has(parcela.vendas.id)) vendas.set(parcela.vendas.id, parcela.vendas);
  });
  return [...vendas.values()]
    .sort((a, b) => parseDateValue(a.created_at || a.data_venda) - parseDateValue(b.created_at || b.data_venda))
    .reduce<Record<string, number>>((acc, venda, index) => {
      acc[venda.id] = index + 1;
      return acc;
    }, {});
}

function saleNumberLabel(parcela: Parcela, map: Record<string, number>) {
  const vendaId = parcela.vendas?.id || parcela.venda_id;
  return `Venda nº ${String(map[vendaId] || 1).padStart(3, '0')}`;
}

export default function VencimentosPage() {
  return (
    <AppShell>
      <VencimentosContent />
    </AppShell>
  );
}

function VencimentosContent() {
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [filter, setFilter] = useState<FilterKey>('abertos');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadParcelas = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('parcelas')
      .select('*, clientes(*), vendas(*)')
      .order('vencimento')
      .order('numero');

    if (fetchError) setError(fetchError.message);
    setParcelas((data || []) as Parcela[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadParcelas();
  }, [loadParcelas]);

  const saleNumberMap = useMemo(() => saleNumberMapFromParcelas(parcelas), [parcelas]);

  const sections = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const parcelasFiltradas = query
      ? parcelas.filter((parcela) => {
          const nome = parcela.clientes?.nome?.toLowerCase() || '';
          const telefone = parcela.clientes?.telefone?.toLowerCase() || '';
          const produto = parcela.vendas?.produto_nome?.toLowerCase() || '';
          const numeroVenda = saleNumberLabel(parcela, saleNumberMap).toLowerCase();
          return nome.includes(query) || telefone.includes(query) || produto.includes(query) || numeroVenda.includes(query);
        })
      : parcelas;

    const today = todayISO();
    const next7 = addDaysISO(today, 7);
    const next30 = addDaysISO(today, 30);

    const active = parcelasFiltradas.filter((parcela) => {
      if (filter === 'todos') return true;
      return parcela.status !== 'cancelado' && parcela.status !== 'pago';
    });

    const overdue = active.filter((parcela) => parcela.status !== 'pago' && parcela.status !== 'cancelado' && parcela.vencimento < today);
    const dueToday = active.filter((parcela) => parcela.status !== 'pago' && parcela.status !== 'cancelado' && parcela.vencimento === today);
    const nextSeven = active.filter((parcela) => parcela.status !== 'pago' && parcela.status !== 'cancelado' && parcela.vencimento > today && parcela.vencimento <= next7);
    const nextThirty = active.filter((parcela) => parcela.status !== 'pago' && parcela.status !== 'cancelado' && parcela.vencimento > next7 && parcela.vencimento <= next30);
    const paidOrCancelled = active.filter((parcela) => parcela.status === 'pago' || parcela.status === 'cancelado');

    const makeSection = (key: string, title: string, tone: 'overdue' | 'today' | 'future', items: Parcela[]): SectionItem => ({
      key,
      title,
      tone,
      items,
      total: items.reduce((sum, item) => sum + Number(item.valor || 0), 0)
    });

    if (filter === 'atrasados') return [makeSection('overdue', 'Atrasados', 'overdue', overdue)];
    if (filter === 'hoje') return [makeSection('today', 'Vencem hoje', 'today', dueToday)];
    if (filter === '7dias') return [makeSection('seven', 'Próximos 7 dias', 'future', nextSeven)];
    if (filter === '30dias') return [makeSection('thirty', 'Próximos 30 dias', 'future', [...nextSeven, ...nextThirty])];
    if (filter === 'todos') return [
      makeSection('overdue', 'Atrasados', 'overdue', overdue),
      makeSection('today', 'Vencem hoje', 'today', dueToday),
      makeSection('seven', 'Próximos 7 dias', 'future', nextSeven),
      makeSection('thirty', 'Próximos 30 dias', 'future', nextThirty),
      makeSection('done', 'Pagos / cancelados', 'future', paidOrCancelled)
    ].filter((section) => section.items.length > 0);

    return [
      makeSection('overdue', 'Atrasados', 'overdue', overdue),
      makeSection('today', 'Vencem hoje', 'today', dueToday),
      makeSection('seven', 'Próximos 7 dias', 'future', nextSeven),
      makeSection('thirty', 'Próximos 30 dias', 'future', nextThirty)
    ].filter((section) => section.items.length > 0);
  }, [filter, parcelas, searchTerm, saleNumberMap]);

  const handleMarkPaid = async (id: string) => {
    setMessage(null);
    setError(null);
    const { error: updateError } = await supabase
      .from('parcelas')
      .update({ status: 'pago', data_pagamento: todayISO() })
      .eq('id', id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage('Parcela marcada como paga.');
    await loadParcelas();
  };

  return (
    <div className="content-grid vencimentos-v2-page">
      {error && <Notice type="danger">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}

      <section className="vencimentos-v2-hero panel">
        <div className="vencimentos-v2-hero-left">
          <div className="vencimentos-v2-kicker"><span className="v2-icon">⌕</span> Agenda de vencimentos</div>
          <p>Exibindo apenas parcelas abertas que precisam de atenção.</p>
        </div>
        <div className="vencimentos-v2-controls">
          <label className="vencimentos-v2-search" aria-label="Buscar vencimento por cliente">
            <span>⌕</span>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por cliente, telefone ou produto..."
            />
          </label>
          <div className="vencimentos-v2-filters">
            {filters.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`vencimentos-v2-chip ${filter === item.key ? 'active' : ''}`}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="vencimentos-v2-groups">
        {loading && <Notice>Carregando parcelas...</Notice>}
        {!loading && sections.length === 0 && <Notice>Nenhuma parcela encontrada para este filtro ou busca.</Notice>}

        {!loading && sections.map((section) => (
          <article key={section.key} className={`vencimentos-v2-section ${section.tone}`}>
            <header className="vencimentos-v2-section-head">
              <div className="vencimentos-v2-section-title">
                <span className="section-marker" />
                <h3>{section.title} <small>({section.items.length})</small></h3>
              </div>
              <div className="vencimentos-v2-section-total">
                {formatCurrency(section.total)}
                <span className="chevron">⌃</span>
              </div>
            </header>

            <div className="vencimentos-v2-list">
              {section.items.map((parcela) => {
                const situacao = getParcelaSituacao(parcela);
                const msg = situacao === 'atrasada'
                  ? `Oi, ${parcela.clientes?.nome || ''}! Vi aqui que a parcela ${parcela.numero} de ${parcela.vendas?.produto_nome || 'sua compra'}, no valor de ${formatCurrency(parcela.valor)}, venceu em ${formatDate(parcela.vencimento)}. Pode me confirmar quando consegue regularizar?`
                  : `Oi, ${parcela.clientes?.nome || ''}! Passando para lembrar que a parcela ${parcela.numero} de ${parcela.vendas?.produto_nome || 'sua compra'}, no valor de ${formatCurrency(parcela.valor)}, vence em ${formatDate(parcela.vencimento)}.`;

                const statusText = parcela.status === 'pago'
                  ? 'Pago'
                  : situacao === 'atrasada'
                    ? 'Atrasado'
                    : parcela.vencimento === todayISO()
                      ? 'Hoje'
                      : 'Em aberto';

                return (
                  <div key={parcela.id} className={`vencimentos-v2-row ${situacao === 'atrasada' ? 'is-overdue' : parcela.vencimento === todayISO() ? 'is-today' : 'is-open'}`}>
                    <div className="vencimentos-v2-cell client">
                      <span className="vencimentos-v2-avatar">{initials(parcela.clientes?.nome || 'Cliente')}</span>
                      <div className="vencimentos-v2-client-copy">
                        <div className="vencimentos-v2-client-topline">
                          <strong>{parcela.clientes?.nome || 'Cliente'}</strong>
                          <span className={`status-pill vencimentos-v2-mobile-status ${statusPillClass(statusText)}`}>{statusText}</span>
                        </div>
                      </div>
                    </div>

                    <div className="vencimentos-v2-cell product"><strong>{saleNumberLabel(parcela, saleNumberMap)}</strong><small>{parcela.vendas?.produto_nome || 'Venda'}</small></div>

                    <div className="vencimentos-v2-cell parcela">
                      <strong>Parcela {parcela.numero} de {parcela.vendas?.numero_parcelas || parcela.numero}</strong>
                      <small>{dueDescription(parcela)}</small>
                    </div>

                    <div className="vencimentos-v2-cell phone">{formatPhone(parcela.clientes?.telefone)}</div>

                    <div className="vencimentos-v2-cell value">{formatCurrency(parcela.valor)}</div>

                    <div className="vencimentos-v2-cell status">
                      <span className={`status-pill ${statusPillClass(statusText)}`}>{statusText}</span>
                    </div>

                    <div className="vencimentos-v2-cell actions">
                      <a className="icon-action whats" aria-label="WhatsApp" title="WhatsApp" href={whatsappLink(parcela.clientes?.telefone, msg)} target="_blank" rel="noreferrer"><WhatsAppIcon /></a>
                      <Link className="icon-action file" aria-label="Ficha do cliente" title="Ficha do cliente" href={`/clientes`}><FileIcon /></Link>
                      {parcela.status !== 'pago' && parcela.status !== 'cancelado' && (
                        <button type="button" className="pay-action" onClick={() => handleMarkPaid(parcela.id)}>
                          Marcar pago
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function formatPhone(phone: string | null | undefined) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return 'Sem telefone';
  const d = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone || 'Sem telefone';
}

function dueDescription(parcela: Parcela) {
  const today = new Date(`${todayISO()}T12:00:00`).getTime();
  const due = new Date(`${parcela.vencimento}T12:00:00`).getTime();
  const diff = Math.round((due - today) / 86400000);
  const date = formatDate(parcela.vencimento).slice(0, 5);

  if (parcela.status === 'pago') return `Paga em ${formatDate(parcela.data_pagamento || parcela.vencimento)}`;
  if (diff < 0) {
    const days = Math.abs(diff);
    return `Vencida há ${days} dia${days > 1 ? 's' : ''} (${date})`;
  }
  if (diff === 0) return `Vence hoje (${date})`;
  return `Vence em ${diff} dia${diff > 1 ? 's' : ''} (${date})`;
}

function statusPillClass(text: string) {
  if (text === 'Pago') return 'success';
  if (text === 'Atrasado') return 'danger';
  if (text === 'Hoje') return 'warning';
  return 'neutral';
}


function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="action-icon">
      <path fill="currentColor" d="M19.05 4.94A9.82 9.82 0 0 0 12.03 2C6.6 2 2.18 6.42 2.18 11.85c0 1.74.45 3.44 1.31 4.94L2 22l5.36-1.4a9.8 9.8 0 0 0 4.67 1.19h.01c5.43 0 9.85-4.42 9.85-9.85a9.77 9.77 0 0 0-2.84-7Zm-7.02 15.18h-.01a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3.18.83.85-3.1-.2-.32a8.14 8.14 0 0 1-1.25-4.35c0-4.5 3.66-8.17 8.17-8.17 2.18 0 4.23.84 5.77 2.38a8.1 8.1 0 0 1 2.39 5.79c0 4.5-3.67 8.16-8.16 8.16Zm4.48-6.11c-.24-.12-1.44-.71-1.66-.79-.22-.08-.38-.12-.54.12-.16.24-.62.79-.76.95-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.92-1.17-.71-.63-1.19-1.41-1.33-1.65-.14-.24-.01-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.31-.74-1.79-.2-.48-.4-.41-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 1.99s.86 2.31.98 2.47c.12.16 1.69 2.58 4.09 3.62.57.25 1.02.4 1.37.51.58.18 1.11.15 1.53.09.47-.07 1.44-.59 1.64-1.16.2-.57.2-1.05.14-1.15-.06-.1-.22-.16-.46-.28Z"/>
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="action-icon">
      <path fill="currentColor" d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V7h3.5L13 3.5ZM8 10h8v1.5H8V10Zm0 4h8v1.5H8V14Zm0 4h5v1.5H8V18Z"/>
    </svg>
  );
}
