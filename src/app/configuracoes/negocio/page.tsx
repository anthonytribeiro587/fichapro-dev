'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Notice } from '@/components/Notice';
import { supabase } from '@/lib/supabase';
import type { ConfiguracoesEmpresa, Empresa, ModulosEmpresa, PerfilNegocio } from '@/lib/types';
import styles from './page.module.css';

const defaultModules: ModulosEmpresa = { vendas: true, estoque: true, servicos: false, recorrencia: false, tarefas: true, pagamentos: false, whatsapp: false, ia: false };
const defaultConfig: ConfiguracoesEmpresa = { nome_exibicao: '', cor_marca: '#8f4f35', termo_cliente: 'Cliente', termo_venda: 'Venda', termo_produto: 'Produto ou serviço', mensagem_assinatura: '' };

type ModuleDefinition = {
  key: keyof ModulosEmpresa;
  title: string;
  description: string;
  icon: string;
  premium?: boolean;
};

type ModuleGroup = {
  title: string;
  description: string;
  items: ModuleDefinition[];
};

const profiles: Array<{ value: PerfilNegocio; icon: string; title: string; description: string; example: string; modules: Partial<ModulosEmpresa> }> = [
  { value: 'comercio', icon: '□', title: 'Comércio e revenda', description: 'Produtos, estoque, pedidos, parcelas, entregas e recompra.', example: 'Consultoras, roupas, cosméticos e pequenas lojas', modules: { vendas: true, estoque: true, servicos: false, recorrencia: false, tarefas: true } },
  { value: 'servicos', icon: '◇', title: 'Prestação de serviços', description: 'Orçamentos, agenda, execução, cobranças e pós-venda.', example: 'Manutenção, assistência, freelancers e agências', modules: { vendas: true, estoque: false, servicos: true, recorrencia: false, tarefas: true } },
  { value: 'recorrencia', icon: '↻', title: 'Assinaturas e recorrência', description: 'Planos, vencimentos, cobranças, renovações e reativações.', example: 'Mensalidades, academias, cursos e acessos', modules: { vendas: true, estoque: false, servicos: false, recorrencia: true, tarefas: true } },
  { value: 'hibrido', icon: '✦', title: 'Operação híbrida', description: 'Combina produtos, serviços e planos recorrentes na mesma empresa.', example: 'Negócios com venda, instalação e mensalidade', modules: { vendas: true, estoque: true, servicos: true, recorrencia: true, tarefas: true } }
];

const moduleGroups: ModuleGroup[] = [
  { title: 'Base operacional', description: 'O que a equipe usa para registrar e acompanhar o trabalho.', items: [
    { key: 'vendas', title: 'Vendas e pedidos', description: 'Pedidos, itens, parcelas e histórico.', icon: '▣' },
    { key: 'estoque', title: 'Estoque', description: 'Saldo, movimentações, fornecedores e reposição.', icon: '▤' },
    { key: 'servicos', title: 'Serviços', description: 'Orçamentos, agenda, execução e conclusão.', icon: '◇' },
    { key: 'recorrencia', title: 'Recorrência', description: 'Planos, assinaturas, vencimentos e renovações.', icon: '↻' },
    { key: 'tarefas', title: 'Próximas ações', description: 'Fila para entregar, renovar, liberar ou acompanhar.', icon: '✓' }
  ]},
  { title: 'Canais e inteligência', description: 'Recursos premium que conectam pagamento, atendimento e automação.', items: [
    { key: 'pagamentos', title: 'Pagamentos integrados', description: 'Pix individual, webhook e conciliação pelo Mercado Pago.', icon: '₿', premium: true },
    { key: 'whatsapp', title: 'WhatsApp integrado', description: 'Evolution API, caixa de entrada e mensagens controladas.', icon: 'W', premium: true },
    { key: 'ia', title: 'Inteligência artificial', description: 'Triagem, contexto, resumos e sugestões de próxima ação.', icon: '✦', premium: true }
  ]}
];

export default function NegocioPage() { return <AppShell><NegocioContent /></AppShell>; }

function NegocioContent() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [profile, setProfile] = useState<PerfilNegocio>('comercio');
  const [modules, setModules] = useState<ModulosEmpresa>(defaultModules);
  const [config, setConfig] = useState<ConfiguracoesEmpresa>(defaultConfig);
  const [step, setStep] = useState<'identidade' | 'perfil' | 'modulos'>('identidade');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadCompany = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error: fetchError } = await supabase.from('empresas').select('id,nome,plano,status,perfil_negocio,modulos,configuracoes').order('created_at').limit(1);
    if (fetchError) { setError('Execute as migrations do ambiente DEV para ativar esta configuração.'); setLoading(false); return; }
    const current = data?.[0] as Empresa | undefined;
    if (!current) setError('Nenhuma empresa foi encontrada para este login.');
    else {
      setEmpresa(current);
      setProfile(current.perfil_negocio || 'comercio');
      setModules({ ...defaultModules, ...(current.modulos || {}) });
      setConfig({ ...defaultConfig, ...(current.configuracoes || {}), nome_exibicao: current.configuracoes?.nome_exibicao || current.nome });
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadCompany(); }, [loadCompany]);

  function selectProfile(nextProfile: PerfilNegocio) {
    const selected = profiles.find((item) => item.value === nextProfile);
    setProfile(nextProfile);
    if (selected) setModules((current) => ({ ...current, ...selected.modules }));
  }

  const enabledCount = useMemo(() => Object.values(modules).filter(Boolean).length, [modules]);
  const selectedProfile = profiles.find((item) => item.value === profile)!;
  const previewTerms = {
    customer: String(config.termo_cliente || 'Cliente'),
    sale: String(config.termo_venda || 'Venda'),
    item: String(config.termo_produto || 'Produto ou serviço')
  };

  async function save() {
    if (!empresa) return;
    setSaving(true); setError(null); setMessage(null);
    const safeColor = /^#[0-9a-f]{6}$/i.test(String(config.cor_marca || '')) ? config.cor_marca : '#8f4f35';
    const payload = { ...config, cor_marca: safeColor, nome_exibicao: String(config.nome_exibicao || empresa.nome).trim() };
    const { error: updateError } = await supabase.from('empresas').update({ perfil_negocio: profile, modulos: modules, configuracoes: payload }).eq('id', empresa.id);
    setSaving(false);
    if (updateError) setError(updateError.message);
    else { setConfig(payload); setMessage('Experiência da empresa salva no ambiente DEV.'); }
  }

  return (
    <div className={styles.page} style={{ '--company-accent': String(config.cor_marca || '#8f4f35') } as React.CSSProperties}>
      {error && <Notice type="danger">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}

      <section className={styles.hero}>
        <div><span className={styles.eyebrow}>Personalização do produto</span><h2>O FichaPRO deve parecer feito para este negócio.</h2><p>Defina linguagem, operação e módulos. A estrutura continua universal, mas a experiência fica específica para cada empresa.</p></div>
        <div className={styles.company}><span>Empresa atual</span><strong>{config.nome_exibicao || empresa?.nome || (loading ? 'Carregando...' : 'Não encontrada')}</strong><small>{selectedProfile.title} · {enabledCount} módulos ativos</small></div>
      </section>

      <div className={styles.workspace}>
        <aside className={styles.steps}>
          <span className={styles.stepsTitle}>Configuração</span>
          <button type="button" className={step === 'identidade' ? styles.activeStep : ''} onClick={() => setStep('identidade')}><i>1</i><div><strong>Identidade e linguagem</strong><small>Nome, cor e termos do negócio</small></div></button>
          <button type="button" className={step === 'perfil' ? styles.activeStep : ''} onClick={() => setStep('perfil')}><i>2</i><div><strong>Modelo de operação</strong><small>Como a empresa vende e entrega</small></div></button>
          <button type="button" className={step === 'modulos' ? styles.activeStep : ''} onClick={() => setStep('modulos')}><i>3</i><div><strong>Módulos e recursos</strong><small>O que aparece no sistema</small></div></button>
          <div className={styles.preview}>
            <span>Prévia da experiência</span>
            <div className={styles.previewBrand}><b style={{ background: String(config.cor_marca || '#8f4f35') }}>{String(config.nome_exibicao || empresa?.nome || 'FP').slice(0,2).toUpperCase()}</b><div><strong>{config.nome_exibicao || empresa?.nome || 'Minha empresa'}</strong><small>{selectedProfile.title}</small></div></div>
            <div className={styles.previewMenu}><span>Início</span><span>{previewTerms.customer}s</span><span>{previewTerms.sale}s</span><span>{previewTerms.item}s</span></div>
          </div>
        </aside>

        <main className={styles.content}>
          {step === 'identidade' && <section className={styles.section}>
            <header><span className={styles.eyebrow}>Etapa 1</span><h3>Como a empresa deve aparecer?</h3><p>Use termos que sua equipe já conhece. Isso reduz treinamento e deixa o sistema mais natural.</p></header>
            <div className={styles.identityGrid}>
              <label className={styles.wide}>Nome exibido no sistema<input value={String(config.nome_exibicao || '')} onChange={(event) => setConfig((current) => ({ ...current, nome_exibicao: event.target.value }))} placeholder="Ex.: MK da Ana ou Minha Assinatura" /></label>
              <label>Cor principal<div className={styles.colorField}><input type="color" value={String(config.cor_marca || '#8f4f35')} onChange={(event) => setConfig((current) => ({ ...current, cor_marca: event.target.value }))} /><input value={String(config.cor_marca || '#8f4f35')} onChange={(event) => setConfig((current) => ({ ...current, cor_marca: event.target.value }))} /></div></label>
              <label>Como chama quem compra?<input value={String(config.termo_cliente || '')} onChange={(event) => setConfig((current) => ({ ...current, termo_cliente: event.target.value }))} placeholder="Cliente, assinante, aluno..." /></label>
              <label>Como chama uma venda?<input value={String(config.termo_venda || '')} onChange={(event) => setConfig((current) => ({ ...current, termo_venda: event.target.value }))} placeholder="Venda, pedido, contratação..." /></label>
              <label>Como chama o que é vendido?<input value={String(config.termo_produto || '')} onChange={(event) => setConfig((current) => ({ ...current, termo_produto: event.target.value }))} placeholder="Produto, serviço, plano..." /></label>
              <label className={styles.wide}>Assinatura das mensagens<textarea rows={3} value={String(config.mensagem_assinatura || '')} onChange={(event) => setConfig((current) => ({ ...current, mensagem_assinatura: event.target.value }))} placeholder="Ex.: Equipe Minha Empresa 😊" /></label>
            </div>
            <div className={styles.next}><span>Próxima etapa: escolha como a empresa trabalha.</span><button type="button" onClick={() => setStep('perfil')}>Continuar</button></div>
          </section>}

          {step === 'perfil' && <section className={styles.section}>
            <header><span className={styles.eyebrow}>Etapa 2</span><h3>Qual modelo mais representa a operação?</h3><p>Isso sugere módulos e nomes, mas você poderá ajustar tudo na próxima etapa.</p></header>
            <div className={styles.profileGrid}>
              {profiles.map((item) => <button key={item.value} type="button" className={profile === item.value ? styles.selected : ''} onClick={() => selectProfile(item.value)}><span className={styles.profileIcon}>{item.icon}</span><div><small>{profile === item.value ? 'Modelo selecionado' : item.example}</small><strong>{item.title}</strong><p>{item.description}</p></div><i>{profile === item.value ? '✓' : '○'}</i></button>)}
            </div>
            <div className={styles.next}><button type="button" className={styles.back} onClick={() => setStep('identidade')}>Voltar</button><span>O perfil ajustará a recomendação de módulos.</span><button type="button" onClick={() => setStep('modulos')}>Continuar</button></div>
          </section>}

          {step === 'modulos' && <section className={styles.section}>
            <header><span className={styles.eyebrow}>Etapa 3</span><h3>Escolha o que a equipe realmente precisa ver</h3><p>Menus desnecessários ficam ocultos. Ativar um módulo premium não dispara mensagens nem cobranças sozinho.</p></header>
            <div className={styles.groups}>
              {moduleGroups.map((group) => <div className={styles.moduleGroup} key={group.title}><div className={styles.groupHead}><strong>{group.title}</strong><p>{group.description}</p></div><div className={styles.moduleGrid}>{group.items.map((item) => <label key={item.key} className={`${styles.moduleCard} ${modules[item.key] ? styles.enabled : ''}`}><span className={styles.moduleIcon}>{item.icon}</span><div><div className={styles.moduleTitle}><strong>{item.title}</strong>{item.premium && <b>Premium</b>}</div><p>{item.description}</p></div><input type="checkbox" checked={modules[item.key]} onChange={(event) => setModules((current) => ({ ...current, [item.key]: event.target.checked }))} /></label>)}</div></div>)}
            </div>
            <div className={styles.next}><button type="button" className={styles.back} onClick={() => setStep('perfil')}>Voltar</button><span>{enabledCount} de {Object.keys(defaultModules).length} módulos ativos.</span><button type="button" disabled={saving || !empresa} onClick={save}>{saving ? 'Salvando...' : 'Salvar experiência'}</button></div>
          </section>}
        </main>
      </div>

      <footer className={styles.footer}><div><strong>Próximo passo</strong><p>Depois de salvar, conecte Mercado Pago e Evolution na Central de Automações.</p></div><Link href="/automacoes">Abrir Central de Automações →</Link></footer>
    </div>
  );
}
