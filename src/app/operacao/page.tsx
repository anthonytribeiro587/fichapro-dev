'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Notice } from '@/components/Notice';
import { formatDate, initials, todayISO } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Cliente, Empresa, TarefaOperacional, TarefaPrioridade, TarefaStatus, TarefaTipo } from '@/lib/types';
import styles from './page.module.css';

type FilterKey = 'abertas' | 'concluidas' | 'todas';
type TaskForm = { titulo: string; tipo: TarefaTipo; prioridade: TarefaPrioridade; cliente_id: string; data_limite: string; descricao: string };

const initialForm: TaskForm = { titulo: '', tipo: 'outra', prioridade: 'normal', cliente_id: '', data_limite: todayISO(), descricao: '' };
const taskTypes: Array<{ value: TarefaTipo; label: string }> = [
  { value: 'separar_pedido', label: 'Separar pedido' },
  { value: 'entregar', label: 'Entregar produto' },
  { value: 'renovar', label: 'Renovar serviço' },
  { value: 'agendar', label: 'Agendar atendimento' },
  { value: 'liberar_acesso', label: 'Liberar acesso' },
  { value: 'pos_venda', label: 'Fazer pós-venda' },
  { value: 'cobrar', label: 'Realizar cobrança' },
  { value: 'responder', label: 'Responder cliente' },
  { value: 'outra', label: 'Outra ação' }
];
const typeLabel = Object.fromEntries(taskTypes.map((item) => [item.value, item.label])) as Record<TarefaTipo, string>;
const priorityLabel: Record<TarefaPrioridade, string> = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
const statusLabel: Record<TarefaStatus, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada' };
const isOpen = (status: TarefaStatus) => status === 'pendente' || status === 'em_andamento';

export default function OperacaoPage() { return <AppShell><OperacaoContent /></AppShell>; }

function OperacaoContent() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [tarefas, setTarefas] = useState<TarefaOperacional[]>([]);
  const [filter, setFilter] = useState<FilterKey>('abertas');
  const [form, setForm] = useState<TaskForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    const { data: empresas, error: empresaError } = await supabase.from('empresas').select('id,nome,plano,status,perfil_negocio,modulos').order('created_at').limit(1);
    if (empresaError) { setError('Execute a migration v53 no Supabase DEV para ativar a central de operação.'); setLoading(false); return; }
    const current = empresas?.[0] as Empresa | undefined;
    if (!current) { setError('Nenhuma empresa foi encontrada para este login.'); setLoading(false); return; }
    setEmpresa(current);
    const [clientesResult, tarefasResult] = await Promise.all([
      supabase.from('clientes').select('*').eq('empresa_id', current.id).eq('status', 'ativo').order('nome'),
      supabase.from('tarefas_operacionais').select('*,clientes(id,nome,telefone),assinaturas(id,nome,proximo_vencimento)').eq('empresa_id', current.id).order('data_limite', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
    ]);
    if (tarefasResult.error) setError('Não foi possível carregar as próximas ações. Verifique as migrations v53, v54 e v55 no Supabase DEV.');
    else setTarefas((tarefasResult.data || []) as TarefaOperacional[]);
    if (!clientesResult.error) setClientes((clientesResult.data || []) as Cliente[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const metrics = useMemo(() => {
    const today = todayISO(); const abertas = tarefas.filter((task) => isOpen(task.status));
    return { abertas, hoje: abertas.filter((task) => task.data_limite === today), atrasadas: abertas.filter((task) => Boolean(task.data_limite && task.data_limite < today)), prioritarias: abertas.filter((task) => task.prioridade === 'alta' || task.prioridade === 'urgente') };
  }, [tarefas]);

  const filteredTasks = useMemo(() => filter === 'abertas' ? tarefas.filter((task) => isOpen(task.status)) : filter === 'concluidas' ? tarefas.filter((task) => task.status === 'concluida') : tarefas, [filter, tarefas]);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!empresa || !form.titulo.trim()) return;
    setSaving(true); setError(null); setMessage(null);
    const { error: insertError } = await supabase.from('tarefas_operacionais').insert({ empresa_id: empresa.id, cliente_id: form.cliente_id || null, titulo: form.titulo.trim(), tipo: form.tipo, prioridade: form.prioridade, data_limite: form.data_limite || null, descricao: form.descricao.trim() || null, status: 'pendente', origem: 'manual' });
    setSaving(false);
    if (insertError) setError(insertError.message); else { setForm(initialForm); setMessage('Próxima ação criada.'); await loadData(); }
  }

  async function updateStatus(task: TarefaOperacional, status: TarefaStatus) {
    setError(null); setMessage(null);
    const { error: updateError } = await supabase.from('tarefas_operacionais').update({ status, concluida_em: status === 'concluida' ? new Date().toISOString() : null }).eq('id', task.id);
    if (updateError) setError(updateError.message); else { setMessage(status === 'concluida' ? 'Ação concluída.' : 'Status atualizado.'); await loadData(); }
  }

  return <div className={styles.page}>
    {error && <Notice type="danger">{error}</Notice>}{message && <Notice type="success">{message}</Notice>}
    <section className={styles.hero}><div><span className={styles.eyebrow}>Central de operação</span><h2>Do pagamento à próxima ação</h2><p>Uma fila única para responder, separar, entregar, renovar, liberar, cobrar ou acompanhar.</p></div><div className={styles.heroActions}><div className={styles.companyCard}><span>Empresa atual</span><strong>{empresa?.nome || 'Carregando...'}</strong><small>{empresa?.perfil_negocio || 'comércio'}</small></div><Link href="/configuracoes/negocio">Configurar negócio</Link></div></section>
    <section className={styles.metrics}><article><span>Abertas</span><strong>{loading ? '...' : metrics.abertas.length}</strong><small>aguardando execução</small></article><article><span>Hoje</span><strong>{loading ? '...' : metrics.hoje.length}</strong><small>com prazo hoje</small></article><article className={styles.warning}><span>Atrasadas</span><strong>{loading ? '...' : metrics.atrasadas.length}</strong><small>precisam de atenção</small></article><article className={styles.priority}><span>Prioritárias</span><strong>{loading ? '...' : metrics.prioritarias.length}</strong><small>altas ou urgentes</small></article></section>
    <div className={styles.workspace}>
      <section className={styles.taskPanel}><header className={styles.panelHeader}><div><span className={styles.eyebrow}>Fila operacional</span><h3>Próximas ações</h3></div><div className={styles.filters}>{(['abertas','concluidas','todas'] as FilterKey[]).map((key) => <button key={key} type="button" className={filter === key ? styles.activeFilter : ''} onClick={() => setFilter(key)}>{key === 'abertas' ? 'Abertas' : key === 'concluidas' ? 'Concluídas' : 'Todas'}</button>)}</div></header>
        <div className={styles.taskList}>{loading && <Notice>Carregando próximas ações...</Notice>}{!loading && filteredTasks.length === 0 && <div className={styles.empty}>Nenhuma ação encontrada.</div>}{filteredTasks.map((task) => { const overdue = Boolean(task.data_limite && task.data_limite < todayISO() && isOpen(task.status)); const label = typeLabel[task.tipo] || 'Outra ação'; return <article key={task.id} className={`${styles.taskCard} ${overdue ? styles.overdue : ''}`}><div className={styles.taskMain}><span className={styles.avatar}>{initials(task.clientes?.nome || label)}</span><div><div className={styles.taskTitleLine}><strong>{task.titulo}</strong><span className={`${styles.badge} ${styles[task.prioridade]}`}>{priorityLabel[task.prioridade]}</span></div><p>{task.clientes?.nome || 'Sem cliente'} · {label}</p>{task.descricao && <small>{task.descricao}</small>}</div></div><div className={styles.taskMeta}><span className={`${styles.badge} ${styles[task.status]}`}>{statusLabel[task.status]}</span><span className={overdue ? styles.dueOverdue : ''}>{task.data_limite ? `${overdue ? 'Atrasada: ' : 'Prazo: '}${formatDate(task.data_limite)}` : 'Sem prazo'}</span></div><div className={styles.taskActions}>{task.status === 'pendente' && <button type="button" onClick={() => updateStatus(task,'em_andamento')}>Iniciar</button>}{isOpen(task.status) && <button type="button" className={styles.primaryAction} onClick={() => updateStatus(task,'concluida')}>Concluir</button>}{task.status === 'concluida' && <button type="button" onClick={() => updateStatus(task,'pendente')}>Reabrir</button>}</div></article>; })}</div>
      </section>
      <aside className={styles.createPanel}><span className={styles.eyebrow}>Registro rápido</span><h3>Nova próxima ação</h3><p>Agora é manual. Depois, Mercado Pago, Evolution e IA poderão alimentar esta fila.</p><form onSubmit={createTask} className={styles.form}><label>O que precisa ser feito?<input required value={form.titulo} onChange={(event) => setForm((current) => ({ ...current, titulo: event.target.value }))} placeholder="Ex.: Renovar acesso" /></label><div className={styles.formGrid}><label>Tipo<select value={form.tipo} onChange={(event) => setForm((current) => ({ ...current, tipo: event.target.value as TarefaTipo }))}>{taskTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>Prioridade<select value={form.prioridade} onChange={(event) => setForm((current) => ({ ...current, prioridade: event.target.value as TarefaPrioridade }))}><option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></label></div><label>Cliente<select value={form.cliente_id} onChange={(event) => setForm((current) => ({ ...current, cliente_id: event.target.value }))}><option value="">Sem cliente vinculado</option>{clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>)}</select></label><label>Prazo<input type="date" value={form.data_limite} onChange={(event) => setForm((current) => ({ ...current, data_limite: event.target.value }))} /></label><label>Observação<textarea rows={3} value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} /></label><button type="submit" disabled={saving || !empresa}>{saving ? 'Salvando...' : 'Criar próxima ação'}</button></form></aside>
    </div>
  </div>;
}
