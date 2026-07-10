import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireBaseConfig() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase não configurado no ambiente do servidor.');
  }
  return { supabaseUrl, supabaseAnonKey };
}

export function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const [scheme, token] = authorization.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

export function createUserServerClient(token: string): SupabaseClient {
  const config = requireBaseConfig();
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

export function createAdminServerClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.');
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

export async function requireAuthenticatedUser(request: Request): Promise<{
  token: string;
  user: User;
  supabase: SupabaseClient;
}> {
  const token = getBearerToken(request);
  if (!token) throw new Error('AUTH_REQUIRED');

  const supabase = createUserServerClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error('AUTH_REQUIRED');

  return { token, user: data.user, supabase };
}

export function isAuthError(error: unknown) {
  return error instanceof Error && error.message === 'AUTH_REQUIRED';
}
