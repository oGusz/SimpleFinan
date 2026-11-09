// O Next mascara o texto de Error lançado em Server Action em produção:
// erro que a pessoa precisa ler volta como valor, e todo chamador deve conferir.
export type ActionResult = { success: true } | { success: false; error: string }

export const actionOk = (): ActionResult => ({ success: true })

export const actionError = (error: string): ActionResult => ({ success: false, error })
