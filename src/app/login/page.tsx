'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Notice } from '@/components/Notice';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/dashboard');
    });
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (authError) {
      setError('E-mail ou senha inválidos. Confira os dados e tente novamente.');
      return;
    }

    router.replace('/dashboard');
  };

  return (
    <main className="login-only-page">
      <section className="login-only-card">
        <div className="login-only-brand login-brand-visual">
          <img className="login-logo-horizontal" src="/brand/logo-horizontal-transparent.png" alt="FichaPro" />
          <span>CRM para consultoras</span>
        </div>

        <div className="login-only-heading">
          <span className="eyebrow">Acesso</span>
          <h1>Entrar no sistema</h1>
          <p>Acesse sua conta para acompanhar clientes, vendas, estoque e vencimentos.</p>
        </div>

        {error && <Notice type="danger">{error}</Notice>}

        <form className="auth-form login-only-form" onSubmit={handleSubmit}>
          <label>
            E-mail
            <input
              type="email"
              value={email}
              placeholder="seuemail@exemplo.com"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={password}
              placeholder="Digite sua senha"
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              autoComplete="current-password"
              required
            />
          </label>
          <button className="primary-button login-only-submit" type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}
