/** Dados mínimos da sessão que o cabeçalho precisa (sem e-mail, CPF ou preferências). */
export interface ShellViewer {
  name: string;
  role: string;
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'super_admin';
}
