'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Notice } from '@/components/Notice';
import { supabase } from '@/lib/supabase';
import type { Empresa, ModulosEmpresa, PerfilNegocio } from '@/lib/types';
import styles from './page.module.css';

const defaultModules: ModulosEmpresa = {
  vendas: true,
  estoque: true,
  servicos: false,
  recorrencia: false,
  tarefas: true,
  pagamentos: false,
  whatsapp: false,
  ia: false
};

const profiles: Array<{ value: PerfilNegocio; title: string; description: string; modules: Partial<ModulosEmpresa> }> = [
  { value: 'comercio', title: 'Comércio e revenda', description: 'Produtos, estoque, pedidos, parcelas, entregas e recompra.', modules: { vendas: true, estoque: true, servicos: false, recorrencia: false, tarefas: true } },
  { value: 'servicos', title: 'Serviços', description: 'Orçamentos, agenda, execução, cobranças e pós-venda.', modules: { vendas: true, estoque: false, servicos: true, recorrencia: false, tarefas: true } },
  { value: 'recorrencia', title: 'Assinaturas e recorrência', description: 'Planos, vencimentos, cobranças, renovações e reativações.', modules: { vendas: true, estoque: false, servicos: false, recorrencia: true, tarefas: true } },
  { value: 'hibrido', title: 'Operação híbrida', description: 'Combina produtos, serviços e planos recorrentes.', modules: { vendas: true, estoque: true, servicos: true, recorrencia: true, tarefas: true } }
];

const moduleDefinitions: Array<{ key: keyof ModulosEmpresa; title: string; description: string; premium?: boolean }> = [
  { key: 'vendas', title: 'Vendas', description: 'Pedidos, itens, pagamentos e histórico.' },
  { key: 'estoque', title: 'Estoque', description: 'Saldo, movimentações, fornecedores e reposição.' },
  { key: 'servicos', title: 'Serviços', description: 'Orçamentos, agenda e execução.' },
  { key: 'recorrencia', title: 'Recorrência', description: 'Planos, assinaturas, vencimentos e renovações.' },
  { key: 'tarefas', title: 'Próximas ações', description: 'Fila para entregar, renovar, liberar, cobrar ou acompanhar.' },
  { key: 'pagamentos', title: 'Pagamentos integrados', description: 'Pix individual, webhook e conciliação.', premium: true },
  { key: 'whatsapp', title: 'WhatsApp integrado', description: 'Evolution API, atendimento e mensagens automáticas.', premium: true },
  { key: 'ia', title: 'Inteligência artificial', description: 'Triagem, consulta, resumo e sugestões de ação.', premium: true }
];

export default function NegocioPage() {
  return <AppShell><NegocioContent /></AppShell>;
}

function NegocioContent() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [profile, setProfile] = useState<PerfilNegocio>('comercio');
  const [modules, setModules] = useState<ModulosEmpresa>(defaultModules);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadCompany = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase.from('empresas').select('id,nome,plano,status,perfil_negocio,modulos').order('created_at').limit(1);
    if (fetchError) {
      setError('Execute a migration v53 no Supabase DEV para ativar esta configuração.');
      setLoading(false);
      return;
    }
    const current = data?.[0] as Empresa | undefined;
    if (!current) setError('Nenhuma empresa foi encontrada para este login.');
    else {
      setEmpresa(current);
      setProfile(current.perfil_negocio || 'comercio');
      setModules({ ...defaultModules, ...(current.modulos || {}) });
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadCompany(); }, [loadCompany]);

  function selectProfile(nextProfile: PerfilNegocio) {
    const selected = profiles.find((item) => item.value === nextProfile);
    setProfile(nextProfile);
    if (selected) setModules((current) => ({ ...current, ...selected.modules }));
  }

  async function save() {
    if (!empresa) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const { error: updateError } = await supabase.from('empresas').update({ perfil_negocio: profile, modulos: modules }).eq('id', empresa.id);
    setSaving(false);
    if (updateError) setError(updateError.message);
    else setMessage('Modelo de negócio salvo no ambiente DEV. Ativar um módulo premium ainda não dispara automações.');
  }

  return (
    <div className={styles.page}>
      {error && <Notice type="danger">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}

      <section className={styles.hero}>
        <div><span className={styles.eyebrow}>Configuração da empresa</span><h2>Um FichaPRO, experiências diferentes</h2><p>Escolha como a empresa trabalha e mostre apenas os módulos relevantes para a operação.</p></div>
        <div className={styles.company}><span>Empresa</span><strong>{empresa?.nome || (loading ? 'Carregando...' : 'Não encontrada')}</strong><small>{empresa?.plano || 'Plano não definido'}</small></div>
      </section>

      <section className={styles.section}>
        <header><span className={styles.eyebrow}>Perfil principal</span><h3>Como esta empresa trabalha?</h3></header>
        <div className={styles.profileGrid}>
          {profiles.map((item) => <button key={item.value} type="button" className={profile === item.value ? styles.selected : ''} onClick={() => selectProfile(item.value)}><span>{profile === item.value ? 'Selecionado' : 'Selecionar'}</span><strong>{item.title}</strong><p>{item.description}</p></button>)}
        </div>
      </section>

      <section className={styles.section}>
        <header><span className={styles.eyebrow}>Módulos</span><h3>Capacidades liberadas para a empresa</h3><p>Pagamentos, WhatsApp e IA ficam somente preparados até suas integrações serem configuradas e validadas.</p></header>
        <div className={styles.moduleGrid}>
          {moduleDefinitions.map((item) => <label key={item.key} className={`${styles.moduleCard} ${modules[item.key] ? styles.enabled : ''}`}><div><span>{item.premium ? 'Premium' : 'Núcleo'}</span><strong>{item.title}</strong><p>{item.description}</p></div><input type="checkbox" checked={modules[item.key]} onChange={(event) => setModules((current) => ({ ...current, [item.key]: event.target.checked }))} /></label>)}
        </div>
      </section>

      <section className={styles.footer}><div><strong>Configuração segura</strong><p>Nenhuma cobrança, mensagem ou ação de IA será executada apenas por ativar os módulos.</p></div><button type="button" disabled={saving || !empresa} onClick={save}>{saving ? 'Salvando...' : 'Salvar configuração'}</button></section>
    </div>
  );
}
