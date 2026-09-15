"use client";

import { useEffect, useRef } from "react";

/**
 * Rastro de fumaça que segue o cursor.
 *
 * Desenhado em <canvas>, não em DOM: são dezenas de manchas borradas por
 * quadro, e criar/animar isso com elementos faria o navegador recalcular
 * layout o tempo todo.
 *
 * Como funciona: a cada quadro, uma partícula nova nasce perto do cursor
 * com velocidade leve para cima; as antigas crescem, perdem opacidade e
 * morrem. O rastro é o conjunto delas em estágios diferentes de vida — é o
 * atraso entre nascer e sumir que dá a leitura de fumaça, e não de um
 * brilho preso ao ponteiro.
 *
 * O laço só roda quando há partículas vivas: parado o mouse, a animação
 * para sozinha em ~1,5s e não consome nada.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 0 → 1, fração da vida consumida. */
  life: number;
  maxLife: number;
  radius: number;
  hue: number;
}

const MAX_PARTICLES = 90;
const SPAWN_PER_FRAME = 2;

export function CursorSmoke() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    // Respeita quem pediu menos animação no sistema (acessibilidade).
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) return;

    let width = 0;
    let height = 0;
    let dpr = 1;

    function resize() {
      if (!canvas) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    window.addEventListener("resize", resize, { passive: true });

    const particles: Particle[] = [];
    let pointerX = -999;
    let pointerY = -999;
    let lastX = -999;
    let lastY = -999;
    let moving = false;
    let frame = 0;

    function spawn(x: number, y: number, speed: number) {
      if (particles.length >= MAX_PARTICLES) return;

      // Quanto mais rápido o movimento, maior e mais espalhada a fumaça.
      const spread = 6 + Math.min(speed, 40) * 0.35;

      particles.push({
        x: x + (Math.random() - 0.5) * spread,
        y: y + (Math.random() - 0.5) * spread,
        vx: (Math.random() - 0.5) * 0.4,
        // Sempre para cima, como fumaça de verdade.
        vy: -0.25 - Math.random() * 0.35,
        life: 0,
        maxLife: 60 + Math.random() * 45,
        radius: 14 + Math.random() * 16 + speed * 0.25,
        // Entre o azul da marca (#2f6bff ≈ 224°) e o verde-água (#12b8a6 ≈ 172°).
        hue: 172 + Math.random() * 52,
      });
    }

    function tick() {
      if (!context) return;
      frame = requestAnimationFrame(tick);
      context.clearRect(0, 0, width, height);

      const dx = pointerX - lastX;
      const dy = pointerY - lastY;
      const speed = Math.hypot(dx, dy);
      lastX = pointerX;
      lastY = pointerY;

      if (moving && pointerX > -900) {
        for (let i = 0; i < SPAWN_PER_FRAME; i += 1) {
          spawn(pointerX, pointerY, speed);
        }
      }

      // `lighter`: as manchas somam luz em vez de se cobrirem, que é o que
      // faz a sobreposição parecer densidade de fumaça iluminada.
      context.globalCompositeOperation = "lighter";

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i]!;
        p.life += 1;

        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
          continue;
        }

        const t = p.life / p.maxLife;
        p.x += p.vx;
        p.y += p.vy;
        // Desacelera com o tempo, como se encontrasse resistência do ar.
        p.vx *= 0.985;
        p.vy *= 0.985;

        // Sobe rápido no início e some suave: entra em ~15% da vida e
        // desvanece no restante.
        const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
        const radius = p.radius * (0.6 + t * 1.1);

        const gradient = context.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
        gradient.addColorStop(0, `hsla(${p.hue}, 85%, 62%, ${alpha * 0.085})`);
        gradient.addColorStop(0.5, `hsla(${p.hue}, 80%, 55%, ${alpha * 0.035})`);
        gradient.addColorStop(1, `hsla(${p.hue}, 75%, 50%, 0)`);

        context.fillStyle = gradient;
        context.beginPath();
        context.arc(p.x, p.y, radius, 0, Math.PI * 2);
        context.fill();
      }

      context.globalCompositeOperation = "source-over";

      // Sem partículas e sem movimento, para o laço — não faz sentido
      // consumir um quadro por segundo desenhando nada.
      if (particles.length === 0 && !moving) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    }

    let idleTimer: number | undefined;

    function handleMove(event: PointerEvent) {
      pointerX = event.clientX;
      pointerY = event.clientY;
      moving = true;

      window.clearTimeout(idleTimer);
      // Parou de mover: deixa de emitir, mas as partículas vivas terminam
      // de subir e sumir naturalmente.
      idleTimer = window.setTimeout(() => {
        moving = false;
      }, 90);

      if (!frame) {
        lastX = pointerX;
        lastY = pointerY;
        frame = requestAnimationFrame(tick);
      }
    }

    function handleLeave() {
      moving = false;
      pointerX = -999;
      pointerY = -999;
    }

    window.addEventListener("pointermove", handleMove, { passive: true });
    window.addEventListener("pointerleave", handleLeave);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerleave", handleLeave);
      window.clearTimeout(idleTimer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}
