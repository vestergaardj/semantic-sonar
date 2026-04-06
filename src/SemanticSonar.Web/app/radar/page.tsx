'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { resultsApi, modelsApi } from '@/lib/api';
import type { ModelLatencyTrend, ModelHealthScore, SemanticModelConfig } from '@/lib/types';

interface RadarModel {
  id: string;
  tenantId: string;
  name: string;
  tenantName: string;
  latencyMs: number;          // p95 recent
  grade: string;
  score: number;
  isAnomaly: boolean;
  isActive: boolean;
  tags: string[];
}

const GRADE_COLORS: Record<string, { fill: string; stroke: string; glow: string }> = {
  A: { fill: '#22c55e', stroke: '#16a34a', glow: 'rgba(34,197,94,0.5)' },
  B: { fill: '#84cc16', stroke: '#65a30d', glow: 'rgba(132,204,22,0.4)' },
  C: { fill: '#eab308', stroke: '#ca8a04', glow: 'rgba(234,179,8,0.4)' },
  D: { fill: '#f97316', stroke: '#ea580c', glow: 'rgba(249,115,22,0.4)' },
  F: { fill: '#ef4444', stroke: '#dc2626', glow: 'rgba(239,68,68,0.5)' },
};

const DEFAULT_COLOR = { fill: '#6b7280', stroke: '#4b5563', glow: 'rgba(107,114,128,0.3)' };

export default function RadarPage() {
  const [models, setModels] = useState<RadarModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<RadarModel | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const sweepRef = useRef(0);
  const animRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const modelsRef = useRef<RadarModel[]>([]);
  const positionsRef = useRef<{ model: RadarModel; x: number; y: number; r: number }[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [trends, scores, allModels] = await Promise.all([
          resultsApi.latencyTrends(),
          resultsApi.healthScores(),
          modelsApi.list(),
        ]);

        const scoreMap = new Map<string, ModelHealthScore>();
        scores.forEach((s) => scoreMap.set(s.modelId, s));

        const modelMap = new Map<string, SemanticModelConfig>();
        allModels.forEach((m) => modelMap.set(m.id, m));

        const radarModels: RadarModel[] = trends
          .filter((t) => t.p95Recent !== null && t.p95Recent > 0)
          .map((t) => {
            const health = scoreMap.get(t.modelId);
            const cfg = modelMap.get(t.modelId);
            return {
              id: t.modelId,
              tenantId: t.tenantId,
              name: t.modelName,
              tenantName: t.tenantName,
              latencyMs: t.p95Recent!,
              grade: health?.grade ?? '?',
              score: health?.score ?? 0,
              isAnomaly: health?.isAnomaly ?? false,
              isActive: cfg?.isActive ?? true,
              tags: cfg?.tags ?? [],
            };
          });

        setModels(radarModels);
        modelsRef.current = radarModels;
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Canvas drawing
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxRadius = Math.min(cx, cy) - 40;

    // Background
    ctx.fillStyle = '#0a1a0a';
    ctx.fillRect(0, 0, w, h);

    // Radial gradient background
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius * 1.2);
    bgGrad.addColorStop(0, 'rgba(34,197,94,0.06)');
    bgGrad.addColorStop(0.5, 'rgba(34,197,94,0.02)');
    bgGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Concentric rings
    const rings = 5;
    const items = modelsRef.current;
    const maxLatency = items.length > 0
      ? Math.max(...items.map((m) => m.latencyMs)) * 1.15
      : 5000;

    for (let i = 1; i <= rings; i++) {
      const r = (maxRadius / rings) * i;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(34,197,94,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Ring label
      const label = `${Math.round((maxLatency / rings) * i)}ms`;
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(34,197,94,0.4)';
      ctx.textAlign = 'right';
      ctx.fillText(label, cx - r - 4, cy - 2);
    }

    // Cross hairs
    ctx.strokeStyle = 'rgba(34,197,94,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - maxRadius, cy);
    ctx.lineTo(cx + maxRadius, cy);
    ctx.moveTo(cx, cy - maxRadius);
    ctx.lineTo(cx, cy + maxRadius);
    ctx.stroke();

    // Diagonal crosshairs
    const d = maxRadius * Math.SQRT1_2;
    ctx.beginPath();
    ctx.moveTo(cx - d, cy - d);
    ctx.lineTo(cx + d, cy + d);
    ctx.moveTo(cx + d, cy - d);
    ctx.lineTo(cx - d, cy + d);
    ctx.stroke();

    // Sweep
    sweepRef.current = (sweepRef.current + 0.008) % (Math.PI * 2);
    const sweepAngle = sweepRef.current;

    // Sweep gradient (trailing glow)
    const sweepGrad = ctx.createConicGradient(sweepAngle - 0.5, cx, cy);
    sweepGrad.addColorStop(0, 'rgba(34,197,94,0)');
    sweepGrad.addColorStop(0.12, 'rgba(34,197,94,0.08)');
    sweepGrad.addColorStop(0.15, 'rgba(34,197,94,0)');

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, maxRadius, sweepAngle - 0.5, sweepAngle);
    ctx.closePath();
    ctx.fillStyle = sweepGrad;
    ctx.fill();

    // Sweep line
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(
      cx + Math.cos(sweepAngle) * maxRadius,
      cy + Math.sin(sweepAngle) * maxRadius,
    );
    ctx.strokeStyle = 'rgba(34,197,94,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#22c55e';
    ctx.fill();

    // Plot models
    const positions: typeof positionsRef.current = [];

    items.forEach((m, i) => {
      // Distribute angles using golden angle for even spread
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const angle = i * goldenAngle;

      // Distance = latency ratio
      const ratio = Math.min(m.latencyMs / maxLatency, 1);
      const dist = ratio * maxRadius;

      const x = cx + Math.cos(angle) * dist;
      const y = cy + Math.sin(angle) * dist;
      const dotRadius = m.isAnomaly ? 7 : 5;

      const colors = GRADE_COLORS[m.grade] ?? DEFAULT_COLOR;

      // Glow
      ctx.beginPath();
      ctx.arc(x, y, dotRadius + 4, 0, Math.PI * 2);
      ctx.fillStyle = colors.glow;
      ctx.fill();

      // Dot
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = colors.fill;
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();

      // Anomaly ring
      if (m.isAnomaly) {
        ctx.beginPath();
        ctx.arc(x, y, dotRadius + 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(239,68,68,0.7)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Inactive style - dimmed
      if (!m.isActive) {
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#4b5563';
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Label for small datasets
      if (items.length <= 20) {
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(200,220,200,0.7)';
        ctx.textAlign = 'center';
        ctx.fillText(m.name.length > 18 ? m.name.slice(0, 16) + '…' : m.name, x, y - dotRadius - 6);
      }

      positions.push({ model: m, x, y, r: dotRadius + 4 });
    });

    positionsRef.current = positions;

    animRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    if (!loading && !error) {
      animRef.current = requestAnimationFrame(draw);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [loading, error, draw]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      // Force re-render via canvas resize in draw loop
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Mouse hover detection
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setMousePos({ x: e.clientX, y: e.clientY });

    const hit = positionsRef.current.find((p) => {
      const dx = mx - p.x;
      const dy = my - p.y;
      return dx * dx + dy * dy <= p.r * p.r;
    });

    setHovered(hit?.model ?? null);
    canvas.style.cursor = hit ? 'pointer' : 'default';
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (hovered) {
      window.location.href = `/models/${hovered.id}?tenantId=${encodeURIComponent(hovered.tenantId)}`;
    }
  };

  // Legend
  const grades = ['A', 'B', 'C', 'D', 'F'];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Radar</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Live radar view — distance from center reflects P95 latency. Color indicates health grade.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-12 justify-center">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Loading radar data…
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Stats bar */}
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-gray-600 dark:text-gray-400">
              <strong className="text-gray-900 dark:text-gray-100">{models.length}</strong> models on radar
            </span>
            {models.length > 0 && (
              <>
                <span className="text-gray-600 dark:text-gray-400">
                  Avg latency: <strong className="text-gray-900 dark:text-gray-100">
                    {Math.round(models.reduce((s, m) => s + m.latencyMs, 0) / models.length)}ms
                  </strong>
                </span>
                <span className="text-gray-600 dark:text-gray-400">
                  Max: <strong className="text-gray-900 dark:text-gray-100">
                    {Math.round(Math.max(...models.map((m) => m.latencyMs)))}ms
                  </strong>
                </span>
                {models.filter((m) => m.isAnomaly).length > 0 && (
                  <span className="text-red-600 dark:text-red-400">
                    ⚠ {models.filter((m) => m.isAnomaly).length} anomal{models.filter((m) => m.isAnomaly).length === 1 ? 'y' : 'ies'}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Radar canvas */}
          <div ref={containerRef} className="relative rounded-xl border border-gray-800 overflow-hidden" style={{ background: '#0a1a0a' }}>
            <canvas
              ref={canvasRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHovered(null)}
              onClick={handleClick}
              className="w-full"
              style={{ height: 'min(70vh, 700px)' }}
            />

            {/* Tooltip */}
            {hovered && (
              <div
                className="pointer-events-none fixed z-50 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm shadow-xl"
                style={{
                  left: mousePos.x + 16,
                  top: mousePos.y - 10,
                }}
              >
                <div className="font-semibold text-gray-100">{hovered.name}</div>
                <div className="text-gray-400 text-xs">{hovered.tenantName}</div>
                <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                  <span className="text-gray-400">P95 Latency</span>
                  <span className="text-gray-200 font-medium">{Math.round(hovered.latencyMs)}ms</span>
                  <span className="text-gray-400">Health</span>
                  <span className="font-medium" style={{ color: (GRADE_COLORS[hovered.grade] ?? DEFAULT_COLOR).fill }}>
                    Grade {hovered.grade} ({hovered.score}/100)
                  </span>
                  {hovered.tags.length > 0 && (
                    <>
                      <span className="text-gray-400">Tags</span>
                      <span className="text-gray-300">{hovered.tags.join(', ')}</span>
                    </>
                  )}
                  {hovered.isAnomaly && (
                    <>
                      <span className="text-gray-400">Status</span>
                      <span className="text-red-400">Anomaly detected</span>
                    </>
                  )}
                </div>
                <div className="mt-1.5 text-[10px] text-gray-500">Click to view details</div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium text-gray-700 dark:text-gray-300">Health grade:</span>
            {grades.map((g) => (
              <span key={g} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: GRADE_COLORS[g].fill }}
                />
                {g}
              </span>
            ))}
            <span className="ml-2 flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full border-2 border-dashed border-red-500 bg-transparent" />
              Anomaly
            </span>
          </div>
        </>
      )}
    </div>
  );
}
