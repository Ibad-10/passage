'use client'

import { motion, type HTMLMotionProps } from 'motion/react'

export const EASE = [0.2, 0.7, 0.2, 1] as const

/** Entrance: rise and fade (DESIGN.md Motion). Reduced motion is handled by MotionConfig. */
export function Rise({ delay = 0, y = 10, ...props }: HTMLMotionProps<'div'> & { delay?: number; y?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE, delay }}
      {...props}
    />
  )
}
