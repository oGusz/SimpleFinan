import type { MetadataRoute } from 'next'

// O conteúdo do app é privado. Só as páginas legais interessam a buscadores.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/privacidade', '/termos'],
      disallow: '/',
    },
  }
}
