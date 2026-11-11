"use client";

import { useEffect, useState, useRef, useCallback } from "react";

const POMODORO_WORK = 25 * 60; // 25 min
const POMODORO_BREAK = 5 * 60; // 5 min

type PomodoroState = "idle" | "work" | "break";

export default function ClockOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [now, setNow] = useState(new Date());
  const [pomoState, setPomoState] = useState<PomodoroState>("idle");
  const [pomoTime, setPomoTime] = useState(POMODORO_WORK);
  const [pomoCount, setPomoCount] = useState(0);
  const [hovered, setHovered] = useState(false);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Pomodoro tick
  useEffect(() => {
    if (pomoState === "idle") return;
    const t = setInterval(() => {
      setPomoTime((prev) => {
        if (prev <= 1) {
          if (pomoState === "work") {
            setPomoCount((c) => c + 1);
            setPomoState("break");
            return POMODORO_BREAK;
          } else {
            setPomoState("work");
            return POMODORO_WORK;
          }
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [pomoState]);

  const togglePomo = () => {
    if (pomoState === "idle") {
      setPomoState("work");
      setPomoTime(POMODORO_WORK);
    } else {
      setPomoState("idle");
      setPomoTime(POMODORO_WORK);
    }
  };

  // Analog clock drawing
  const drawClock = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const dpr = window.devicePixelRatio || 1;
      const size = Math.min(w, h);
      const cx = w / 2;
      const cy = h / 2;
      const r = size * 0.38;

      ctx.clearRect(0, 0, w * dpr, h * dpr);
      ctx.save();
      ctx.scale(dpr, dpr);

      // MSK time
      const msk = new Date(now.getTime() + (now.getTimezoneOffset() + 180) * 60000);
      const hrs = msk.getHours();
      const mins = msk.getMinutes();
      const secs = msk.getSeconds();
      const ms = now.getMilliseconds();

      // Glow background
      const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.3);
      glow.addColorStop(0, "rgba(236, 176, 10, 0.06)");
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // Outer ring
      ctx.beginPath();
      ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(236, 176, 10, 0.3)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Pomodoro progress ring
      if (pomoState !== "idle") {
        const total = pomoState === "work" ? POMODORO_WORK : POMODORO_BREAK;
        const progress = 1 - pomoTime / total;
        const color = pomoState === "work" ? "#ef4444" : "#4ade80";

        ctx.beginPath();
        ctx.arc(cx, cy, r + 8, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.stroke();

        // Faint track
        ctx.beginPath();
        ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
        ctx.strokeStyle = `${color}22`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // Hour markers
      for (let i = 0; i < 12; i++) {
        const angle = (i * Math.PI) / 6 - Math.PI / 2;
        const isMain = i % 3 === 0;
        const inner = r * (isMain ? 0.78 : 0.85);
        const outer = r * 0.92;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
        ctx.strokeStyle = isMain ? "rgba(236, 176, 10, 0.9)" : "rgba(236, 176, 10, 0.35)";
        ctx.lineWidth = isMain ? 2.5 : 1;
        ctx.stroke();
      }

      // Minute ticks
      for (let i = 0; i < 60; i++) {
        if (i % 5 === 0) continue;
        const angle = (i * Math.PI) / 30 - Math.PI / 2;
        const inner = r * 0.9;
        const outer = r * 0.92;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
        ctx.strokeStyle = "rgba(236, 176, 10, 0.12)";
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Hour hand
      const hrAngle = ((hrs % 12) + mins / 60) * (Math.PI / 6) - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(hrAngle) * r * 0.08, cy - Math.sin(hrAngle) * r * 0.08);
      ctx.lineTo(cx + Math.cos(hrAngle) * r * 0.52, cy + Math.sin(hrAngle) * r * 0.52);
      ctx.strokeStyle = "#ecb00a";
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      ctx.stroke();

      // Minute hand
      const minAngle = (mins + secs / 60) * (Math.PI / 30) - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(minAngle) * r * 0.08, cy - Math.sin(minAngle) * r * 0.08);
      ctx.lineTo(cx + Math.cos(minAngle) * r * 0.72, cy + Math.sin(minAngle) * r * 0.72);
      ctx.strokeStyle = "rgba(236, 176, 10, 0.85)";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.stroke();

      // Second hand (smooth)
      const secExact = secs + ms / 1000;
      const secAngle = secExact * (Math.PI / 30) - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(secAngle) * r * 0.12, cy - Math.sin(secAngle) * r * 0.12);
      ctx.lineTo(cx + Math.cos(secAngle) * r * 0.82, cy + Math.sin(secAngle) * r * 0.82);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      ctx.stroke();

      // Center dot
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#ecb00a";
      ctx.fill();

      // Digital time below
      ctx.font = "600 11px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(236, 176, 10, 0.7)";
      ctx.fillText(
        `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`,
        cx,
        cy + r * 0.4
      );
      ctx.font = "400 8px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(156, 163, 175, 0.5)";
      ctx.fillText("MSK", cx, cy + r * 0.55);

      ctx.restore();
    },
    [now, pomoState, pomoTime]
  );

  // Smooth animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = 180;
    const h = 180;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    let raf: number;
    const loop = () => {
      drawClock(ctx, w, h);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [drawClock]);

  const pomoMins = Math.floor(pomoTime / 60);
  const pomoSecs = pomoTime % 60;

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        width: 180,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        cursor: "pointer",
        userSelect: "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <canvas ref={canvasRef} style={{ borderRadius: 12 }} />

      {/* Pomodoro section */}
      <div
        onClick={togglePomo}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 12px",
          borderRadius: 8,
          background: pomoState === "idle"
            ? "rgba(255,255,255,0.04)"
            : pomoState === "work"
            ? "rgba(239, 68, 68, 0.12)"
            : "rgba(74, 222, 128, 0.12)",
          border: `1px solid ${
            pomoState === "idle"
              ? "rgba(255,255,255,0.06)"
              : pomoState === "work"
              ? "rgba(239, 68, 68, 0.25)"
              : "rgba(74, 222, 128, 0.25)"
          }`,
          transition: "all 0.3s ease",
          opacity: hovered || pomoState !== "idle" ? 1 : 0.5,
        }}
      >
        <span style={{ fontSize: 14 }}>
          {pomoState === "idle" ? "🍅" : pomoState === "work" ? "🔥" : "☕"}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color:
              pomoState === "idle"
                ? "#9ca3af"
                : pomoState === "work"
                ? "#ef4444"
                : "#4ade80",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {pomoState === "idle"
            ? "Pomodoro"
            : `${String(pomoMins).padStart(2, "0")}:${String(pomoSecs).padStart(2, "0")}`}
        </span>
        {pomoCount > 0 && (
          <span style={{ fontSize: 9, color: "#9ca3af" }}>
            ×{pomoCount}
          </span>
        )}
      </div>

      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: transparent !important; overflow: hidden; }
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
      `}</style>
    </div>
  );
}
