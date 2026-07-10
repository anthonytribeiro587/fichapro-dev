'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Notice } from '@/components/Notice';
import { formatDate, initials, todayISO } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Cliente, Empresa, TarefaOperacional, TarefaPrioridade, TarefaStatus, TarefaTipo } from '@/lib/types';

type ViewKey = 'agora' | 'proximas' | 'andamento' | 'concluidas';
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
  { value: 'outra', label: 'Outra ação' }
];

const taskVisual: Record<Exclude<TarefaTipo, 'responder'>, { label: string; icon: string; complete: string }> = {
  separar_pedido: { label: 'Separar pedido', icon: '📦', complete: 'Marcar separado' },
  entregar: { label: 'Entregar produto', icon: '🚚', complete: 'Marcar entregue' },
  renovar: { label: 'Renovar serviço', icon: '↻', complete: 'Confirmar renovação' },
  agendar: { label: 'Agendar atendimento', icon: '◷', complete: 'Confirmar agendamento' },
  liberar_acesso: { label: 'Liberar acesso', icon: '↗', complete: 'Confirmar liberação' },
  pos_venda: { label: 'Fazer pós-venda', icon: '✦', complete: 'Concluir contato' },
  cobrar: { label: 'Realizar cobrança', icon: 'R$', complete: 'Marcar cobrança feita' },
  outra: { label: 'Outra ação', icon: '✓', complete: 'Concluir ação' }
};

const priorityLabel: Record<TarefaPrioridade, string> = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
const priorityRank: Record<TarefaPrioridade, number> = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
const isOpen = (status: TarefaStatus) => status === 'pendente' || status === 'em_andamento';

export default function OperacaoPage() {
  return <AppShell><OperacaoContent /></AppShell>;
}

function OperacaoContent() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [tarefas, setTarefas] = useState<TarefaOperacional[]>([]);
  const [view, setView] = useState<ViewKey>('agora');
  const [form, setForm] = useState<TaskForm>(initialForm);
  const [showForm, setShowForm] = useState(false);
  const [waitingInbox, setWaitingInbox] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: empresas, error: empresaError } = await supabase
      .from('empresas')
      .select('id,nome,plano,status,perfil_negocio,modulos')
      .order('created_at')
      .limit(1);

    if (empresaError) {
      setError('Não foi possível acessar a empresa atual.');
      setLoading(false);
      return;
    }

    const current = empresas?.[0] as Empresa | undefined;
    if (!current) {
      setError('Nenhuma empresa foi encontrada para este login.');
      setLoading(false);
      return;
    }
    setEmpresa(current);

    const [clientesResult, tarefasResult, inboxResult] = await Promise.all([
      supabase.from('clientes').select('*').eq('empresa_id', current.id).eq('status', 'ativo').order('nome'),
      supabase.from('tarefas_operacionais').select('*,clientes(id,nome,telefone),assinaturas(id,nome,proximo_vencimento)').eq('empresa_id', current.id).order('data_limite', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }),
      supabase.from('conversas_whatsapp').select('id', { count: 'exact', head: true }).eq('empresa_id', current.id).eq('status', 'aguardando_equipe')
    ]);

    if (tarefasResult.error) setError('Não foi possível carregar as ações operacionais.');
    else setTarefas((tarefasResult.data || []) as TarefaOperacional[]);
    if (!clientesResult.error) {
      const rows = (clientesResult.data || []) as Cliente[];
      setClientes(rows);
      if (typeof window !== 'undefined') {
        const requestedClient = new URLSearchParams(window.location.search).get('cliente');
        if (requestedClient && rows.some((item) => item.id === requestedClient)) {
          setForm((currentForm) => ({ ...currentForm, cliente_id: requestedClient }));
          setShowForm(true);
        }
      }
    }
    setWaitingInbox(inboxResult.count || 0);
    setLoading(false);
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const operationalTasks = useMemo(() => tarefas.filter((task) => task.tipo !== 'responder' && task.status !== 'cancelada'), [tarefas]);

  const metrics = useMemo(() => {
    const today = todayISO();
    const abertas = operationalTasks.filter((task) => isOpen(task.status));
    return {
      hoje: abertas.filter((task) => !task.data_limite || task.data_limite === today),
      atrasadas: abertas.filter((task) => Boolean(task.data_limite && task.data_limite < today)),
      andamento: abertas.filter((task) => task.status === 'em_andamento')
    };
  }, [operationalTasks]);

  const filteredTasks = useMemo(() => {
    const today = todayISO();
    const rows = operationalTasks.filter((task) => {
      if (view === 'concluidas') return task.status === 'concluida';
      if (view === 'andamento') return task.status === 'em_andamento';
      if (task.status !== 'pendente') return false;
      if (view === 'proximas') return Boolean(task.data_limite && task.data_limite > today && !['alta', 'urgente'].includes(task.prioridade));
      return !task.data_limite || task.data_limite <= today || ['alta', 'urgente'].includes(task.prioridade);
    });

    return [...rows].sort((a, b) => {
      const priority = priorityRank[a.prioridade] - priorityRank[b.prioridade];
      if (priority !== 0) return priority;
      return String(a.data_limite || '9999-12-31').localeCompare(String(b.data_limite || '9999-12-31'));
    });
  }, [operationalTasks, view]);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!empresa || !form.titulo.trim()) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const { error: insertError } = await supabase.from('tarefas_operacionais').insert({
      empresa_id: empresa.id,
      cliente_id: form.cliente_id || null,
      titulo: form.titulo.trim(),
      tipo: form.tipo,
      prioridade: form.prioridade,
      data_limite: form.data_limite || null,
      descricao: form.descricao.trim() || null,
      status: 'pendente',
      origem: 'manual'
    });
    setSaving(false);
    if (insertError) setError(insertError.message);
    else {
      setForm(initialForm);
      setShowForm(false);
      setView('agora');
      setMessage('Ação operacional criada.');
      await loadData();
    }
  }

  async function updateStatus(task: TarefaOperacional, status: TarefaStatus) {
    setError(null);
    setMessage(null);
    const { error: updateError } = await supabase
      .from('tarefas_operacionais')
      .update({ status, concluida_em: status === 'concluida' ? new Date().toISOString() : null })
      .eq('id', task.id);
    if (updateError) setError(updateError.message);
    else {
      setMessage(status === 'concluida' ? 'Ação concluída.' : 'Status atualizado.');
      await loadData();
    }
  }

  const viewLabels: Record<ViewKey, string> = { agora: 'Agora', proximas: 'Próximos dias', andamento: 'Em andamento', concluidas: 'Concluídas' };

  return (
    <div className="operation-page">
      {error && <Notice type="danger">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}

      <section className="operation-hero">
        <div><span className="eyebrow-local">Agenda operacional</span><h2>O que precisa acontecer agora?</h2><p>Atendimento fica na Caixa de Entrada. Aqui entram somente entregas, renovações, cobranças e serviços que precisam ser concluídos.</p></div>
        <div className="hero-actions"><Link href="/caixa-de-entrada">Abrir Caixa de Entrada{waitingInbox > 0 && <b>{waitingInbox}</b>}</Link><button type="button" onClick={() => setShowForm((value) => !value)}>{showForm ? 'Fechar formulário' : '+ Nova ação manual'}</button></div>
      </section>

      <section className="operation-metrics">
        <article><span>Para hoje</span><strong>{loading ? '...' : metrics.hoje.length}</strong><small>sem prazo ou com prazo hoje</small></article>
        <article className={metrics.atrasadas.length ? 'danger' : ''}><span>Atrasadas</span><strong>{loading ? '...' : metrics.atrasadas.length}</strong><small>precisam de atenção</small></article>
        <article><span>Em andamento</span><strong>{loading ? '...' : metrics.andamento.length}</strong><small>já foram iniciadas</small></article>
        <Link className={waitingInbox ? 'inbox-card attention' : 'inbox-card'} href="/caixa-de-entrada"><span>Conversas esperando</span><strong>{loading ? '...' : waitingInbox}</strong><small>abrir atendimento →</small></Link>
      </section>

      {showForm && <section className="quick-create">
        <header><div><span className="eyebrow-local">Registro manual</span><h3>Nova ação operacional</h3></div><p>Use apenas para algo que precisa ser executado. Mensagens entram automaticamente na Caixa de Entrada.</p></header>
        <form onSubmit={createTask}>
          <label className="wide">O que precisa ser feito?<input required value={form.titulo} onChange={(event) => setForm((current) => ({ ...current, titulo: event.target.value }))} placeholder="Ex.: Renovar acesso do cliente" /></label>
          <label>Tipo<select value={form.tipo} onChange={(event) => setForm((current) => ({ ...current, tipo: event.target.value as TarefaTipo }))}>{taskTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>Prioridade<select value={form.prioridade} onChange={(event) => setForm((current) => ({ ...current, prioridade: event.target.value as TarefaPrioridade }))}><option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></label>
          <label>Cliente<select value={form.cliente_id} onChange={(event) => setForm((current) => ({ ...current, cliente_id: event.target.value }))}><option value="">Sem cliente vinculado</option>{clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>)}</select></label>
          <label>Prazo<input type="date" value={form.data_limite} onChange={(event) => setForm((current) => ({ ...current, data_limite: event.target.value }))} /></label>
          <label className="wide">Observação<textarea rows={2} value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} placeholder="Informações necessárias para concluir" /></label>
          <div className="form-actions"><button type="button" onClick={() => setShowForm(false)}>Cancelar</button><button className="primary" type="submit" disabled={saving || !empresa}>{saving ? 'Salvando...' : 'Criar ação'}</button></div>
        </form>
      </section>}

      <section className="workboard">
        <header className="board-header"><div><span className="eyebrow-local">Seu trabalho</span><h3>{viewLabels[view]}</h3></div><div className="view-tabs">{(['agora','proximas','andamento','concluidas'] as ViewKey[]).map((key) => <button key={key} type="button" className={view === key ? 'active' : ''} onClick={() => setView(key)}>{viewLabels[key]}{key === 'agora' && metrics.atrasadas.length > 0 ? ` (${metrics.atrasadas.length})` : ''}</button>)}</div></header>

        <div className="task-list">
          {loading && <div className="empty-state">Carregando ações...</div>}
          {!loading && filteredTasks.length === 0 && <div className="empty-state"><span>✓</span><strong>Nada nesta etapa</strong><p>{view === 'agora' ? 'Seu dia está livre de ações operacionais pendentes.' : 'Não existem ações neste filtro.'}</p></div>}
          {filteredTasks.map((task) => {
            const visual = taskVisual[(task.tipo === 'responder' ? 'outra' : task.tipo) as Exclude<TarefaTipo, 'responder'>];
            const overdue = Boolean(task.data_limite && task.data_limite < todayISO() && isOpen(task.status));
            const customerName = task.clientes?.nome || 'Sem cliente vinculado';
            return <article key={task.id} className={`task-card ${overdue ? 'overdue' : ''}`}>
              <span className="task-icon">{visual.icon}</span>
              <div className="task-copy">
                <div className="task-title"><strong>{task.titulo}</strong>{['alta','urgente'].includes(task.prioridade) && <span className={`priority ${task.prioridade}`}>{priorityLabel[task.prioridade]}</span>}</div>
                <div className="task-context">{task.cliente_id ? <Link href={`/clientes/${task.cliente_id}`}>{customerName}</Link> : <span>{customerName}</span>}<i>•</i><span>{visual.label}</span><i>•</i><span className="origin">{task.origem === 'mercado_pago' ? 'Mercado Pago' : task.origem === 'manual' ? 'Manual' : 'Automação'}</span></div>
                {task.descricao && <p>{task.descricao}</p>}
              </div>
              <div className="task-due"><span>{task.status === 'em_andamento' ? 'Em andamento' : task.status === 'concluida' ? 'Concluída' : overdue ? 'Atrasada' : 'Prazo'}</span><strong>{task.data_limite ? formatDate(task.data_limite) : 'Sem data'}</strong></div>
              <div className="task-actions">
                {task.status === 'pendente' && <button type="button" onClick={() => updateStatus(task, 'em_andamento')}>Em andamento</button>}
                {isOpen(task.status) && <button type="button" className="primary" onClick={() => updateStatus(task, 'concluida')}>{visual.complete}</button>}
                {task.status === 'concluida' && <button type="button" onClick={() => updateStatus(task, 'pendente')}>Reabrir</button>}
              </div>
            </article>;
          })}
        </div>
      </section>

      <style jsx>{`
        .operation-page{display:grid;gap:16px;min-width:0}.operation-hero,.quick-create,.workboard,.operation-metrics article,.operation-metrics a{border:1px solid rgba(112,80,62,.1);background:rgba(255,255,255,.86);box-shadow:0 18px 44px rgba(67,46,32,.045)}.operation-hero{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:22px 24px;border-radius:22px}.eyebrow-local{display:block;color:#9a5639;font-size:.66rem;font-weight:850;letter-spacing:.14em;text-transform:uppercase}.operation-hero h2{margin:4px 0 8px;font-size:1.55rem;letter-spacing:-.04em}.operation-hero p{max-width:790px;margin:0;color:#7d6d64;font-size:.84rem;line-height:1.5}.hero-actions{display:flex;gap:9px;flex-wrap:wrap;justify-content:flex-end}.hero-actions a,.hero-actions button{display:flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:0 15px;border:1px solid #d8c7bd;border-radius:13px;background:#fff;color:#6f4131;text-decoration:none;font-size:.72rem;font-weight:850}.hero-actions button{border-color:#754331;background:#754331;color:#fff}.hero-actions b{display:grid;place-items:center;min-width:21px;height:21px;padding:0 6px;border-radius:999px;background:#f4d2c2;color:#7c321b;font-size:.6rem}.operation-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.operation-metrics article,.operation-metrics a{display:grid;gap:5px;padding:16px 18px;border-radius:18px;text-decoration:none}.operation-metrics span{color:#7c6d64;font-size:.71rem;font-weight:750}.operation-metrics strong{color:#30241f;font-size:1.45rem;line-height:1}.operation-metrics small{color:#96877f;font-size:.63rem}.operation-metrics .danger strong{color:#c14747}.operation-metrics .attention{background:#fff3e9}.operation-metrics .attention strong{color:#a75920}.quick-create{padding:20px 22px;border-radius:22px}.quick-create header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:16px}.quick-create h3{margin:4px 0 0}.quick-create header p{max-width:500px;margin:0;color:#8a786f;font-size:.72rem;line-height:1.5}.quick-create form{display:grid;grid-template-columns:2fr 1fr 1fr 1.3fr 1fr;gap:11px}.quick-create label{display:grid;gap:6px;color:#68584f;font-size:.68rem;font-weight:800}.quick-create label.wide{grid-column:span 2}.quick-create input,.quick-create select,.quick-create textarea{width:100%;border:1px solid #dccdc4;border-radius:11px;background:#fffdfa;padding:10px 11px;color:#332a26;font:inherit;font-size:.72rem;outline:0}.quick-create input:focus,.quick-create select:focus,.quick-create textarea:focus{border-color:#a66b50;box-shadow:0 0 0 3px rgba(166,107,80,.1)}.form-actions{display:flex;grid-column:1/-1;justify-content:flex-end;gap:8px}.form-actions button,.task-actions button,.view-tabs button{min-height:36px;padding:0 12px;border:1px solid #ddcec5;border-radius:10px;background:#fffaf6;color:#725e53;font-size:.67rem;font-weight:800}.form-actions button.primary,.task-actions button.primary{border-color:#754331;background:#754331;color:#fff}.workboard{padding:20px;border-radius:22px}.board-header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px}.board-header h3{margin:4px 0 0;font-size:1.08rem}.view-tabs{display:flex;gap:6px;overflow:auto}.view-tabs button{white-space:nowrap}.view-tabs button.active{border-color:#754331;background:#754331;color:#fff}.task-list{display:grid;gap:9px}.task-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:14px;padding:14px 15px;border:1px solid #eadfd8;border-radius:17px;background:#fffdfb}.task-card.overdue{border-color:#e5a9a9;background:#fffafa}.task-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:#f1e2d9;color:#744331;font-size:.92rem;font-weight:900}.task-copy{min-width:0}.task-title{display:flex;align-items:center;gap:8px}.task-title strong{overflow:hidden;color:#34251f;font-size:.8rem;text-overflow:ellipsis;white-space:nowrap}.priority{padding:5px 8px;border-radius:999px;background:#fde8d7;color:#9b511d;font-size:.56rem;font-style:normal;font-weight:850}.priority.urgente{background:#f8dddd;color:#aa3434}.task-context{display:flex;align-items:center;gap:6px;margin-top:4px;color:#837168;font-size:.65rem;flex-wrap:wrap}.task-context a{color:#754331;font-weight:800;text-decoration:none}.task-context i{color:#c8b8af;font-style:normal}.task-context .origin{padding:3px 6px;border-radius:999px;background:#f4eeea}.task-copy p{margin:6px 0 0;color:#95847b;font-size:.65rem;line-height:1.4}.task-due{display:grid;justify-items:end;gap:3px;min-width:82px}.task-due span{color:#97867d;font-size:.58rem;text-transform:uppercase}.task-due strong{color:#554139;font-size:.68rem}.overdue .task-due strong{color:#b53939}.task-actions{display:flex;gap:6px}.task-actions button.primary{max-width:155px}.empty-state{display:grid;place-items:center;gap:7px;padding:42px;border:1px dashed #d9cac2;border-radius:17px;color:#8d7b72;text-align:center}.empty-state>span{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;background:#e5f3e9;color:#2d8150;font-size:1.1rem}.empty-state strong{color:#49362e}.empty-state p{margin:0;font-size:.72rem}
        @media(max-width:1150px){.quick-create form{grid-template-columns:repeat(2,1fr)}.quick-create label.wide{grid-column:span 2}.task-card{grid-template-columns:auto minmax(0,1fr) auto}.task-actions{grid-column:2/-1;justify-content:flex-end}}
        @media(max-width:900px){.operation-hero{align-items:flex-start;flex-direction:column}.hero-actions{width:100%;justify-content:flex-start}.operation-metrics{grid-template-columns:repeat(2,1fr)}.board-header{align-items:flex-start;flex-direction:column}.view-tabs{width:100%}}
        @media(max-width:640px){.operation-page{gap:12px}.operation-hero,.quick-create,.workboard{padding:16px;border-radius:18px}.operation-hero h2{font-size:1.28rem}.hero-actions{display:grid;grid-template-columns:1fr;width:100%}.operation-metrics{gap:8px}.operation-metrics article,.operation-metrics a{padding:13px}.quick-create header{align-items:flex-start;flex-direction:column}.quick-create form{grid-template-columns:1fr}.quick-create label.wide{grid-column:auto}.task-card{grid-template-columns:auto minmax(0,1fr);gap:10px}.task-due{grid-column:2;justify-items:start}.task-actions{grid-column:1/-1;display:grid;grid-template-columns:1fr}.task-actions button.primary{max-width:none}.view-tabs button{flex:1}.view-tabs{display:grid;grid-template-columns:repeat(2,1fr)}}
      `}</style>
    </div>
  );
}
