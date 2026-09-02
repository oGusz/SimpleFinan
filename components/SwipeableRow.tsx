'use client'

import { useState } from 'react'
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion'
import { Trash2 } from 'lucide-react'

interface SwipeableRowProps {
  children: React.ReactNode
  onDelete: () => void
}

export function SwipeableRow({ children, onDelete }: SwipeableRowProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const x = useMotionValue(0)

  // Transforma o deslocamento em opacidade e cor do fundo de fundo (fundo vermelho de alerta)
  const bgOpacity = useTransform(x, [-150, -50, 0], [1, 0.5, 0])
  const deleteIconScale = useTransform(x, [-150, -50], [1.2, 0.8])

  const handleDragEnd = (_: any, info: PanInfo) => {
    // Se o usuário arrastou mais de 120px para a esquerda ou soltou com velocidade alta
    if (info.offset.x < -120 || info.velocity.x < -500) {
      setIsDeleting(true)
      setTimeout(() => {
        onDelete()
      }, 200) // Aguarda a animação de saída terminar
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl my-1 bg-slate-950">
      {/* PAINEL VERMELHO DE FUNDO (Aparece ao arrastar) */}
      <motion.div
        style={{ opacity: bgOpacity }}
        className="absolute inset-0 flex items-center justify-end pr-6 bg-rose-600/30 border border-rose-500/50 rounded-xl"
      >
        <motion.div style={{ scale: deleteIconScale }} className="flex items-center gap-2 text-rose-400 font-bold text-xs">
          <span>Solte para excluir</span>
          <Trash2 className="h-5 w-5" />
        </motion.div>
      </motion.div>

      {/* CONTEÚDO ARRASTÁVEL (A linha do seu ativo) */}
      <motion.div
        style={{ x }}
        drag="x"
        dragConstraints={{ left: -160, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        animate={isDeleting ? { x: -300, opacity: 0 } : {}}
        transition={{ type: 'spring', stiffness: 400, damping: 40 }}
        className="relative bg-slate-900 border border-slate-800 rounded-xl touch-pan-y cursor-grab active:cursor-grabbing select-none"
      >
        {children}
      </motion.div>
    </div>
  )
}