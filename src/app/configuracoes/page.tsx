'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

type PerfilBanco = 'dona' | 'gerente' | 'atendimento' | 'financeiro';
type StatusBanco = 'ativo' | 'convite_pendente' | 'inativo';

type Empresa = {
  id: string;
  nome: string;
  plano: string;
  status: string;
};

type TeamUser = {
  id: string;
  empresa_id: string;
  user_id: string | null;
  nome: string | null;
  email: string;
  perfil: PerfilBanco;
  status: StatusBanco;
};

const permissions = [
  { title: 'Dona', description: 'Acesso total: vendas, clientes, estoque, relatórios e usuários.' },
  { title: 'Gerente', description: 'Pode vender, cadastrar clientes/produtos e acompanhar cobranças.' },
  { title: 'Atendimento', description: 'Pode consultar clientes, registrar vendas e enviar mensagens.' },
  { title: 'Financeiro', description: 'Foco em vencimentos, parcelas, recebimentos e relatórios.' }
];

const perfilLabel: Record<PerfilBanco, string> = {
  dona: 'Dona',
  gerente: 'Gerente',
  atendimento: 'Atendimento',
  financeiro: 'Financeiro'
};

const perfilOptions: Array<{ value: PerfilBanco; label: string }> = [
  { value: 'atendimento', label: 'Atendimento' },
  { value: 'gerente', label: 'Gerente' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'dona', label: 'Dona' }
];

export default function ConfiguracoesPage() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [perfil, setPerfil] = useState<PerfilBanco>('atendimento');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [whatsappMessage, setWhatsappMessage] = useState('Teste FichaPRO DEV via WAHA ✅');
  const [whatsappStatus, setWhatsappStatus] = useState('');
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [whatsappSending, setWhatsappSending] = useState(false);

  const activeCount = useMemo(() => users.filter((user) => user.status === 'ativo').length, [users]);
  const pendingCount = useMemo(() => users.filter((user) => user.status === 'convite_pendente').length, [users]);
  const currentUser = useMemo(() => users.find((user) => user.user_id), [users]);

  async function loadTeam() {
    setLoading(true);
    setError('');

    const { data: empresas, error: empresaError } = await supabase
      .from('empresas')
      .select('id, nome, plano, status')
      .order('created_at', { ascending: true })
      .limit(1);

    if (empresaError) {
      setEmpresa(null);
      setUsers([]);
      setError('A estrutura de equipe ainda não foi ativada. Rode a migration v34 no Supabase.');
      setLoading(false);
      return;
    }

    const selectedEmpresa = empresas?.[0] as Empresa | undefined;
    if (!selectedEmpresa) {
      setEmpresa(null);
      setUsers([]);
      setError('Nenhuma empresa encontrada para este login. Rode a migration v34 ou crie a empresa no Supabase.');
      setLoading(false);
      return;
    }

    setEmpresa(selectedEmpresa);

    const { data: members, error: membersError } = await supabase
      .from('empresa_membros')
      .select('id, empresa_id, user_id, nome, email, perfil, status')
      .eq('empresa_id', selectedEmpresa.id)
      .order('created_at', { ascending: true });

    if (membersError) {
      setError('Não consegui carregar os acessos da empresa. Verifique se a migration v34 foi aplicada.');
      setUsers([]);
    } else {
      setUsers((members || []) as TeamUser[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadTeam();
  }, []);


  async function checkWhatsappStatus() {
    setWhatsappLoading(true);
    setWhatsappStatus('Consultando WAHA...');

    try {
      const response = await fetch('/api/whatsapp/status', { cache: 'no-store' });
      const result = await response.json();

      if (!result.configured) {
        setWhatsappStatus('WAHA ainda não configurado nas variáveis da Vercel DEV.');
      } else if (result.ok) {
        setWhatsappStatus(`WAHA conectado. Sessão em uso: ${result.session || 'fichapro'}.`);
      } else {
        setWhatsappStatus(result.error || 'WAHA respondeu, mas a sessão não parece estar pronta.');
      }
    } catch {
      setWhatsappStatus('Não foi possível consultar o status do WAHA.');
    } finally {
      setWhatsappLoading(false);
    }
  }

  async function handleWhatsappTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWhatsappSending(true);
    setWhatsappStatus('Enviando mensagem de teste...');

    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: whatsappPhone, message: whatsappMessage })
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        setWhatsappStatus(result.error || 'Não foi possível enviar pelo WAHA.');
        return;
      }

      setWhatsappStatus(`Mensagem enviada pelo WAHA para ${result.chatId || 'o número informado'}. Confira o WhatsApp de destino.`);
    } catch {
      setWhatsappStatus('Erro ao chamar a rota interna do FichaPRO.');
    } finally {
      setWhatsappSending(false);
    }
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    setError('');

    if (!empresa) {
      setError('Ative primeiro a estrutura de empresa/equipe no Supabase.');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;

    const exists = users.some((user) => user.email.toLowerCase() === cleanEmail);
    if (exists) {
      setError('Este e-mail já está na lista de acessos desta empresa.');
      return;
    }

    setSaving(true);
    const { error: inviteError } = await supabase.from('empresa_membros').insert({
      empresa_id: empresa.id,
      nome: nome.trim() || cleanEmail.split('@')[0],
      email: cleanEmail,
      perfil,
      status: 'convite_pendente'
    });

    setSaving(false);

    if (inviteError) {
      setError('Não foi possível adicionar este acesso. Confirme se seu perfil é Dona/Gerente e se a migration v34 foi rodada.');
      return;
    }

    setNome('');
    setEmail('');
    setPerfil('atendimento');
    setNotice('Acesso adicionado à empresa. Se esse e-mail já existir no Auth, ele ficará ativo; se não existir, crie o usuário no Supabase Auth com o mesmo e-mail.');
    await loadTeam();
  }

  async function handleDeactivate(user: TeamUser) {
    if (!confirm(`Remover/inativar o acesso de ${user.email}?`)) return;
    setNotice('');
    setError('');

    const { error: updateError } = await supabase
      .from('empresa_membros')
      .update({ status: 'inativo' })
      .eq('id', user.id);

    if (updateError) {
      setError('Não foi possível inativar esse acesso.');
      return;
    }

    setNotice('Acesso inativado.');
    await loadTeam();
  }

  return (
    <AppShell>
      <div className="settings-page-v2">
        <section className="settings-hero-v2">
          <div>
            <span className="eyebrow">Configurações</span>
            <h2>Empresa, usuários e acessos</h2>
            <p>Gerencie quem acessa a mesma base de clientes, produtos, vendas e vencimentos da empresa.</p>
          </div>
          <div className="settings-tenant-card-v2">
            <span>Empresa atual</span>
            <strong>{empresa?.nome || 'Tenant não ativado'}</strong>
            <small>{empresa ? `${activeCount} ativo(s) • ${pendingCount} pendente(s)` : 'Rode a migration v34 no Supabase'}</small>
          </div>
        </section>

        {error && <div className="notice error compact-notice-v2">{error}</div>}
        {notice && <div className="notice success compact-notice-v2">{notice}</div>}


        <section className="settings-card-v2 whatsapp-dev-card-v2">
          <div className="panel-header-spread no-margin">
            <div>
              <span className="eyebrow">WhatsApp DEV</span>
              <h3>Teste de envio pelo WAHA</h3>
              <p className="section-helper">Use esta área apenas no ambiente DEV para validar a sessão conectada no Railway antes de ligar automações reais.</p>
            </div>
            <button className="outline-button small" type="button" onClick={checkWhatsappStatus} disabled={whatsappLoading}>
              {whatsappLoading ? 'Consultando...' : 'Ver status'}
            </button>
          </div>

          <form className="whatsapp-test-form-v2" onSubmit={handleWhatsappTest}>
            <label>
              Telefone de teste
              <input value={whatsappPhone} onChange={(event) => setWhatsappPhone(event.target.value)} placeholder="Ex.: 51999999999" />
            </label>
            <label>
              Mensagem
              <textarea value={whatsappMessage} onChange={(event) => setWhatsappMessage(event.target.value)} rows={3} />
            </label>
            <button className="primary-button" type="submit" disabled={whatsappSending || !whatsappPhone.trim() || !whatsappMessage.trim()}>
              {whatsappSending ? 'Enviando...' : 'Enviar teste pelo WAHA'}
            </button>
          </form>

          {whatsappStatus && <div className="notice compact-notice-v2 whatsapp-status-v2">{whatsappStatus}</div>}

          <div className="whatsapp-env-helper-v2">
            <strong>Variáveis esperadas na Vercel DEV</strong>
            <code>WAHA_BASE_URL</code>
            <code>WAHA_API_KEY</code>
            <code>WAHA_SESSION=fichapro</code>
          </div>
        </section>

        <div className="settings-grid-v2">
          <section className="settings-card-v2">
            <div className="panel-header-spread no-margin">
              <div>
                <span className="eyebrow">Equipe</span>
                <h3>Acessos liberados</h3>
              </div>
              <span className="count-badge">{loading ? 'carregando' : `${activeCount} ativo(s)`}</span>
            </div>

            <div className="team-users-list-v2">
              {loading && <p className="section-helper">Carregando acessos...</p>}
              {!loading && users.length === 0 && <p className="section-helper">Nenhum acesso encontrado para esta empresa.</p>}
              {users.map((user) => (
                <div className="team-user-row-v2" key={user.id}>
                  <span className="avatar small">{(user.nome || user.email).slice(0, 2).toUpperCase()}</span>
                  <div>
                    <strong>{user.nome || user.email.split('@')[0]}</strong>
                    <small>{user.email}</small>
                  </div>
                  <span className="team-role-v2">{perfilLabel[user.perfil]}</span>
                  <span className={`team-status-v2 ${user.status === 'ativo' ? 'active' : user.status === 'convite_pendente' ? 'pending' : 'inactive'}`}>
                    {user.status === 'convite_pendente' ? 'pendente' : user.status}
                  </span>
                  {user.perfil !== 'dona' && user.status !== 'inativo' && (
                    <button className="ghost-button small-action" type="button" onClick={() => handleDeactivate(user)}>Inativar</button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="settings-card-v2">
            <span className="eyebrow">Novo acesso</span>
            <h3>Adicionar funcionária</h3>
            <p className="section-helper">Adicione o e-mail aqui e crie o mesmo e-mail no Supabase Auth. A pessoa verá a mesma base da empresa.</p>

            <form className="settings-invite-form-v2" onSubmit={handleInvite}>
              <label>
                Nome
                <input value={nome} onChange={(event) => setNome(event.target.value)} placeholder="Ex.: Mariana" />
              </label>
              <label>
                E-mail
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="funcionaria@email.com" />
              </label>
              <label>
                Perfil
                <select value={perfil} onChange={(event) => setPerfil(event.target.value as PerfilBanco)}>
                  {perfilOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <button className="primary-button" type="submit" disabled={saving || !empresa}>{saving ? 'Adicionando...' : 'Adicionar acesso'}</button>
            </form>
          </section>
        </div>

        <section className="settings-card-v2 permissions-card-v2">
          <span className="eyebrow">Permissões</span>
          <h3>Perfis para a empresa</h3>
          <div className="permissions-grid-v2">
            {permissions.map((item) => (
              <div className="permission-item-v2" key={item.title}>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
