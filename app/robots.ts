import type { MetadataRoute } from 'next'

// O conteúdo do app é privado. Só as páginas públicas interessam a buscadores.
// A imagem fica liberada porque a prévia de link de /sobre depende dela.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/privacidade', '/termos', '/sobre', '/suporte', '/excluir-conta', '/og-image.png'],
      disallow: '/',
    },
  }
}
