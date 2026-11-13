export type AuthStatus = { authenticated: boolean; role?: 'viewer'|'operator'|'admin'; username?: string; csrf?: string; setup_required?: boolean };
type Api = <T>(path: string, options?: RequestInit) => Promise<T>;

// Uma entrada por vez, inclusive quando o React repete o efeito no desenvolvimento.
export function criarAcessoSemSenha(api: Api, endereco: () => URL, limparConvite: () => void) {
  let pendente: Promise<AuthStatus> | null = null;
  return function entrar(): Promise<AuthStatus> {
    if (pendente) return pendente;
    pendente = (async () => {
      const url = endereco();
      const convite = new URLSearchParams(url.hash.replace(/^#/, '')).get('convite');
      if (convite) {
        const auth = await api<AuthStatus>('/auth/invite', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({token: convite}),
        });
        if (!auth.authenticated || !auth.csrf || !auth.username) throw new Error('Não foi possível validar o convite.');
        limparConvite();
        return auth;
      }
      const atual = await api<AuthStatus>('/auth/status');
      if (atual.authenticated && atual.csrf && atual.username) return atual;
      const local = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)
        && ['5173', '8017'].includes(url.port);
      if (!local) throw new Error('Abra o link de convite recebido para acessar o EGIDIUS.');
      const auth = await api<AuthStatus>('/auth/local', {method: 'POST'});
      if (!auth.authenticated || !auth.csrf || !auth.username) throw new Error('Não foi possível abrir o acesso local.');
      return auth;
    })().finally(() => { pendente = null; });
    return pendente;
  };
}
