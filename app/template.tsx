// Diferente do layout, o template é recriado a cada navegação e por isso reinicia a animação.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>
}
