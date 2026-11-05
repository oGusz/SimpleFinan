// Armazenamento cheio, bloqueado ou indisponível (SSR, modo privado) não pode derrubar a tela.

function read(storage: () => Storage, key: string) {
  try {
    return storage().getItem(key)
  } catch {
    return null
  }
}

function write(storage: () => Storage, key: string, value: string) {
  try {
    storage().setItem(key, value)
    return true
  } catch {
    return false
  }
}

function remove(storage: () => Storage, key: string) {
  try {
    storage().removeItem(key)
  } catch {
    // Sem armazenamento, não há o que remover.
  }
}

const local = () => localStorage
const session = () => sessionStorage

export const safeGet = (key: string) => read(local, key)
export const safeSet = (key: string, value: string) => write(local, key, value)
export const safeRemove = (key: string) => remove(local, key)

export const safeSessionGet = (key: string) => read(session, key)
export const safeSessionSet = (key: string, value: string) => write(session, key, value)
