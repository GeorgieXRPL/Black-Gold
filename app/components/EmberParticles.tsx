/**
 * @fileoverview Animated ember particle background effect
 */

'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';

interface Particle {
  id: number;
  x: number;
  size: number;
  duration: number;
  delay: number;
}

interface EmberParticlesProps {
  count?: number;
  active?: boolean;
}

export function EmberParticles({ count = 15, active = true }: EmberParticlesProps) {
  const [particles, setParticles] = useState<Particle[]>([]);

  const generateParticles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      size: Math.random() * 4 + 2,
      duration: Math.random() * 2 + 2,
      delay: Math.random() * 3,
    }));
  }, [count]);

  useEffect(() => {
    setParticles(generateParticles);
  }, [generateParticles]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full"
          style={{
            left: `${particle.x}%`,
            bottom: '-10px',
            width: particle.size,
            height: particle.size,
            background: `radial-gradient(circle, #f97316 0%, #f9731600 70%)`,
            boxShadow: `0 0 ${particle.size * 2}px #f97316, 0 0 ${particle.size * 4}px #f9731680`,
          }}
          animate={{
            y: [0, -window.innerHeight - 100],
            opacity: [0, 1, 1, 0],
            scale: [0.5, 1, 0.8, 0.3],
          }}
          transition={{
            duration: particle.duration + 2,
            delay: particle.delay,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        />
      ))}
      
      {/* Ambient glow at bottom */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-32"
        style={{
          background: 'linear-gradient(to top, rgba(249, 115, 22, 0.1) 0%, transparent 100%)',
        }}
      />
    </div>
  );
}
