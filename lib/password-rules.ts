// Usadas no checklist do cadastro e de novo no servidor, que é quem garante a regra.
export const PASSWORD_RULES = [
  { label: 'Pelo menos 8 caracteres', test: (password: string) => password.length >= 8 },
  { label: 'Uma letra maiúscula', test: (password: string) => /\p{Lu}/u.test(password) },
  { label: 'Uma letra minúscula', test: (password: string) => /\p{Ll}/u.test(password) },
  { label: 'Um número', test: (password: string) => /\d/.test(password) },
  { label: 'Um caractere especial (!@#$...)', test: (password: string) => /[^\p{L}\d\s]/u.test(password) },
]

export function isStrongPassword(password: string) {
  return PASSWORD_RULES.every((rule) => rule.test(password))
}
