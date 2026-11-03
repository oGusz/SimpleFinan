export function SkeletonCards() {
  return (
    <div className="flex flex-col gap-5" aria-label="Carregando" role="status">
      <div className="h-28 animate-pulse rounded-2xl bg-slate-900/60 border border-slate-800/80" />
      <div className="h-44 animate-pulse rounded-2xl bg-slate-900/60 border border-slate-800/80" />
      <div className="h-36 animate-pulse rounded-2xl bg-slate-900/60 border border-slate-800/80" />
    </div>
  )
}

export function PageSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28">
      <div className="h-11 w-1/2 animate-pulse rounded-xl bg-slate-900/60" />
      <SkeletonCards />
    </main>
  )
}
