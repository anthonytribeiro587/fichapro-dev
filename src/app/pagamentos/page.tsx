'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Notice } from '@/components/Notice';
import { formatCurrency, formatDate, todayISO } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { CobrancaIntegrada, Cliente, Empresa } from '@/lib/types';
import styles from './page.module.css';

type ChargeForm = { cliente_id: string; valor: string; vencimento: string; descricao: string; payer_email: string };
const initialForm: ChargeForm = { cliente_id: '', valor: '', vencimento: todayISO(), descricao: 'Cobrança FichaPRO', payer_email: '' };

export default function PagamentosPage() {
  return <AppShell><PagamentosContent /></AppShell>;
}

function PagamentosContent() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [charges, setCharges] = useState<CobrancaIntegrada[]>([]);
  const [form, setForm] = useState<ChargeForm>(initialForm);
  const [generated, setGenerated] = useState<CobrancaIntegrada | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<'todas' | 'pendente' | 'pago'>('todas');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: companies, error: companyError } = await supabase.from('empresas').select('id,nome,plano,status,perfil_negocio,modulos,configuracoes').order('created_at').limit(1);
    if (companyError || !companies?.[0]) {
      setError('Empresa não encontrada. Confirme as migrations do ambiente DEV.');
      setLoading(false);
      return;
    }
    const company = companies[0] as Empresa;
    setEmpresa(company);
    const [clientsResult, chargesResult] = await Promise.all([
      supabase.from('clientes').select('*').eq('empresa_id', company.id).eq('status', 'ativo').order('nome'),
      supabase.from('cobrancas_integradas').select('*, clientes(id,nome,telefone,email), assinaturas(id,nome,proximo_vencimento)').eq('empresa_id', company.id).order('created_at', { ascending: false }).limit(100)
    ]);
    if (chargesResult.error) setError('Execute as migrations v53 e v55 para ativar pagamentos integrados.');
    setClientes((clientsResult.data || []) as Cliente[]);
    setCharges((chargesResult.data || []) as CobrancaIntegrada[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const summary = useMemo(() => {
    const pending = charges.filter((item) => item.status === 'pendente');
    const paid = charges.filter((item) => item.status === 'pago');
    return {
      pendingCount: pending.length,
      pendingValue: pending.reduce((sum, item) => sum + Number(item.valor || 0), 0),
      paidCount: paid.length,
      paidValue: paid.reduce((sum, item) => sum + Number(item.valor || 0), 0)
    };
  }, [charges]);

  const visibleCharges = useMemo(() => filter === 'todas' ? charges : charges.filter((item) => item.status === filter), [charges, filter]);

  function selectClient(clientId: string) {
    const client = clientes.find((item) => item.id === clientId);
    setForm((current) => ({ ...current, cliente_id: clientId, payer_email: client?.email || '' }));
  }

  async function createCharge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!empresa) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    setGenerated(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setSaving(false);
      setError('Sua sessão expirou. Entre novamente.');
      return;
    }

    const response = await fetch('/api/cobrancas/pix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        empresa_id: empresa.id,
        cliente_id: form.cliente_id,
        valor: Number(form.valor.replace(',', '.')),
        vencimento: form.vencimento,
        descricao: form.descricao,
        payer_email: form.payer_email
      })
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(payload.error || 'Não foi possível gerar o Pix.');
      return;
    }
    setGenerated(payload.cobranca as CobrancaIntegrada);
    setMessage(payload.reused ? 'Cobrança existente recuperada com segurança.' : 'Pix gerado e vinculado ao cliente.');
    await loadData();
  }

  async function copyPix(code?: string | null) {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className={styles.page}>
      {error && <Notice type="danger">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}

      <section className={styles.hero}>
        <div><span className={styles.kicker}>Pagamentos integrados</span><h2>Crie o Pix. O FichaPRO acompanha o resto.</h2><p>Cada cobrança fica vinculada ao cliente. Quando o Mercado Pago confirmar, o sistema baixa o pagamento e cria a próxima ação correta.</p></div>
        <div className={styles.flow}><span>1<small>Gerar Pix</small></span><i>→</i><span>2<small>Confirmar pagamento</small></span><i>→</i><span>3<small>Criar ação</small></span></div>
      </section>

      <section className={styles.metrics}>
        <article><span>Aguardando pagamento</span><strong>{loading ? '—' : summary.pendingCount}</strong><small>{formatCurrency(summary.pendingValue)}</small></article>
        <article className={styles.paid}><span>Pagamentos confirmados</span><strong>{loading ? '—' : summary.paidCount}</strong><small>{formatCurrency(summary.paidValue)}</small></article>
        <article><span>Clientes disponíveis</span><strong>{loading ? '—' : clientes.length}</strong><small>ativos nesta empresa</small></article>
      </section>

      <div className={styles.workspace}>
        <section className={styles.listPanel}>
          <header><div><span className={styles.kicker}>Conciliação</span><h3>Cobranças recentes</h3></div><div className={styles.filters}>{(['todas','pendente','pago'] as const).map((key) => <button type="button" key={key} className={filter === key ? styles.active : ''} onClick={() => setFilter(key)}>{key === 'todas' ? 'Todas' : key === 'pendente' ? 'Pendentes' : 'Pagas'}</button>)}</div></header>
          <div className={styles.chargeList}>
            {loading && <Notice>Carregando cobranças...</Notice>}
            {!loading && visibleCharges.length === 0 && <div className={styles.empty}><span>◇</span><strong>Nenhuma cobrança neste filtro</strong><p>Gere o primeiro Pix no formulário ao lado.</p></div>}
            {visibleCharges.map((charge) => <article key={charge.id} className={styles.chargeCard}>
              <div className={styles.avatar}>{(charge.clientes?.nome || 'CL').slice(0,2).toUpperCase()}</div>
              <div className={styles.chargeCopy}><strong>{charge.clientes?.nome || 'Cliente'}</strong><span>{charge.metadata?.descricao as string || 'Cobrança FichaPRO'}</span><small>{charge.vencimento ? `Vence em ${formatDate(charge.vencimento)}` : `Criada em ${formatDate(charge.created_at.slice(0,10))}`}</small></div>
              <div className={styles.chargeValue}><strong>{formatCurrency(charge.valor)}</strong><span className={`${styles.status} ${styles[charge.status]}`}>{charge.status}</span></div>
              <div className={styles.chargeActions}>{charge.pix_copia_cola && charge.status === 'pendente' && <button type="button" onClick={() => copyPix(charge.pix_copia_cola)}>Copiar Pix</button>}{charge.link_pagamento && charge.status === 'pendente' && <a href={charge.link_pagamento} target="_blank" rel="noreferrer">Abrir</a>}</div>
            </article>)}
          </div>
        </section>

        <aside className={styles.createPanel}>
          <span className={styles.kicker}>Nova cobrança</span><h3>Gerar Pix individual</h3><p>O e-mail é exigido pelo Mercado Pago. O cliente receberá a cobrança pelo canal que você escolher.</p>
          <form onSubmit={createCharge}>
            <label>Cliente<select required value={form.cliente_id} onChange={(event) => selectClient(event.target.value)}><option value="">Selecione o cliente</option>{clientes.map((client) => <option value={client.id} key={client.id}>{client.nome}</option>)}</select></label>
            <div className={styles.formGrid}><label>Valor<input required inputMode="decimal" placeholder="0,00" value={form.valor} onChange={(event) => setForm((current) => ({ ...current, valor: event.target.value }))} /></label><label>Vencimento<input required type="date" value={form.vencimento} onChange={(event) => setForm((current) => ({ ...current, vencimento: event.target.value }))} /></label></div>
            <label>E-mail do pagador<input required type="email" placeholder="cliente@email.com" value={form.payer_email} onChange={(event) => setForm((current) => ({ ...current, payer_email: event.target.value }))} /></label>
            <label>Descrição<input required value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} /></label>
            <button type="submit" disabled={saving || !empresa}>{saving ? 'Gerando cobrança...' : 'Gerar Pix seguro'}</button>
          </form>

          {generated && <div className={styles.generated}>
            <div className={styles.generatedHead}><span>Pix criado</span><strong>{formatCurrency(generated.valor)}</strong></div>
            {generated.qr_code_base64 && <img src={`data:image/png;base64,${generated.qr_code_base64}`} alt="QR Code Pix" />}
            <button type="button" onClick={() => copyPix(generated.pix_copia_cola)}>{copied ? 'Código copiado ✓' : 'Copiar Pix Copia e Cola'}</button>
            {generated.link_pagamento && <a href={generated.link_pagamento} target="_blank" rel="noreferrer">Abrir página de pagamento</a>}
          </div>}
        </aside>
      </div>
    </div>
  );
}
