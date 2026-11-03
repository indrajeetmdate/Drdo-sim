import React, { useRef, useEffect, useState, useMemo } from 'react';
import { TimeSeriesOutputStep, SystemParameters } from '../types/microgrid';
import {
  Calendar,
  Clock,
  Maximize2,
  Minimize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface Props {
  data: TimeSeriesOutputStep[];
  params: SystemParameters;
  onHoverStep?: (step: TimeSeriesOutputStep | null) => void;
}

export const SynchronizedPlots: React.FC<Props> = ({ data, params, onHoverStep }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Time window range for zoom & pan: [startIndex, endIndex]
  const [windowRange, setWindowRange] = useState<[number, number]>([0, data.length - 1]);
  // Hovered index for synchronized crosshair
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Reset range when data changes length significantly (e.g. switching between 1-day and 31-day)
  useEffect(() => {
    setWindowRange([0, Math.max(1, data.length - 1)]);
    setHoverIndex(null);
  }, [data.length]);

  const startIndex = Math.max(0, Math.min(windowRange[0], data.length - 2));
  const endIndex = Math.min(data.length - 1, Math.max(windowRange[1], startIndex + 1));
  const visibleCount = endIndex - startIndex + 1;

  // Selected step for inspection tooltip
  const activeStep = hoverIndex !== null && data[hoverIndex] ? data[hoverIndex] : data[endIndex] || null;

  useEffect(() => {
    if (onHoverStep) {
      onHoverStep(activeStep);
    }
  }, [activeStep, onHoverStep]);

  // Canvas refs for the 4 plots
  const canvas1Ref = useRef<HTMLCanvasElement>(null);
  const canvas2Ref = useRef<HTMLCanvasElement>(null);
  const canvas3Ref = useRef<HTMLCanvasElement>(null);
  const canvas4Ref = useRef<HTMLCanvasElement>(null);

  // Quick Zoom presets
  const handleZoomPreset = (days: number | 'all') => {
    if (days === 'all') {
      setWindowRange([0, data.length - 1]);
    } else {
      const stepsToFit = Math.min(data.length, Math.round(days * 96));
      setWindowRange([0, stepsToFit - 1]);
    }
  };

  // Render Canvas Plots
  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;

    const renderPlot = (
      canvas: HTMLCanvasElement | null,
      drawFn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
    ) => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);
      drawFn(ctx, rect.width, rect.height);
      ctx.restore();
    };

    const leftMargin = 55;
    const rightMargin = 55;
    const topMargin = 20;
    const bottomMargin = 22;

    // Helper: Map data index to X coordinate
    const getX = (idx: number, w: number) => {
      const plotWidth = w - leftMargin - rightMargin;
      return leftMargin + ((idx - startIndex) / (endIndex - startIndex)) * plotWidth;
    };

    // Helper: Draw horizontal grid lines & axis labels
    const drawGrid = (
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      yMin: number,
      yMax: number,
      yUnit: string,
      yRightMin?: number,
      yRightMax?: number,
      yRightUnit?: string
    ) => {
      const plotWidth = w - leftMargin - rightMargin;
      const plotHeight = h - topMargin - bottomMargin;

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';

      const gridDivisions = 4;
      for (let i = 0; i <= gridDivisions; i++) {
        const yFrac = i / gridDivisions;
        const yPos = topMargin + plotHeight * (1 - yFrac);
        const yVal = yMin + yFrac * (yMax - yMin);

        ctx.beginPath();
        ctx.moveTo(leftMargin, yPos);
        ctx.lineTo(w - rightMargin, yPos);
        ctx.stroke();

        ctx.fillText(`${yVal.toFixed(yVal >= 10 ? 1 : 2)} ${i === gridDivisions ? yUnit : ''}`, leftMargin - 6, yPos + 3);

        if (yRightMin !== undefined && yRightMax !== undefined) {
          const yRightVal = yRightMin + yFrac * (yRightMax - yRightMin);
          ctx.textAlign = 'left';
          ctx.fillText(
            `${yRightVal.toFixed(yRightVal >= 10 ? 1 : 2)} ${i === gridDivisions ? (yRightUnit || '') : ''}`,
            w - rightMargin + 6,
            yPos + 3
          );
          ctx.textAlign = 'right';
        }
      }

      // X-axis time marks
      ctx.textAlign = 'center';
      const xMarks = Math.min(8, Math.max(3, Math.floor(plotWidth / 90)));
      for (let i = 0; i <= xMarks; i++) {
        const frac = i / xMarks;
        const targetIdx = Math.round(startIndex + frac * (endIndex - startIndex));
        const step = data[targetIdx];
        if (step) {
          const xPos = getX(targetIdx, w);
          ctx.beginPath();
          ctx.moveTo(xPos, topMargin);
          ctx.lineTo(xPos, topMargin + plotHeight);
          ctx.strokeStyle = '#172033';
          ctx.stroke();

          // Time label: show Day X if > 1 day, else HH:MM
          let label = step.timestamp.split(' ')[1] || `${step.hour.toFixed(1)}h`;
          if (data.length > 96) {
            const datePart = step.timestamp.split(' ')[0];
            const dayPart = datePart.split('-')[2] || `D${step.day}`;
            label = `D${dayPart} ${label}`;
          }
          ctx.fillStyle = '#64748b';
          ctx.fillText(label, xPos, h - 6);
        }
      }

      // Border frame
      ctx.strokeStyle = '#334155';
      ctx.strokeRect(leftMargin, topMargin, plotWidth, plotHeight);
    };

    // Helper: Draw crosshair
    const drawCrosshair = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      if (hoverIndex === null || hoverIndex < startIndex || hoverIndex > endIndex) return;
      const xPos = getX(hoverIndex, w);
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(xPos, topMargin);
      ctx.lineTo(xPos, h - bottomMargin);
      ctx.stroke();
      ctx.restore();
    };

    // ----------------------------------------------------
    // PLOT 1: Power Dispatch Stack (kW)
    // ----------------------------------------------------
    renderPlot(canvas1Ref.current, (ctx, w, h) => {
      let maxP = 1.0;
      let minP = 0.0;
      for (let i = startIndex; i <= endIndex; i++) {
        const s = data[i];
        maxP = Math.max(maxP, s.p_pv_bus_kw, s.p_load_kw, s.p_elec_bus_kw, s.p_fc_bus_kw, s.p_curtailed_kw, s.p_bess_chg_kw);
        minP = Math.min(minP, -s.p_bess_dis_kw);
      }
      maxP = Math.ceil(maxP * 1.15);
      minP = Math.floor(minP * 1.15);

      drawGrid(ctx, w, h, minP, maxP, 'kW');

      const getY = (val: number) => {
        const plotHeight = h - topMargin - bottomMargin;
        return topMargin + plotHeight * (1 - (val - minP) / (maxP - minP));
      };

      // Draw zero reference line
      const yZero = getY(0);
      ctx.strokeStyle = '#475569';
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(leftMargin, yZero);
      ctx.lineTo(w - rightMargin, yZero);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw Series:
      // 1. Curtailed (Slate)
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = startIndex; i <= endIndex; i++) {
        const x = getX(i, w);
        const y = getY(data[i].p_curtailed_kw);
        if (i === startIndex) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 2. Solar PV Output (Amber/Gold)
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = startIndex; i <= endIndex; i++) {
        const x = getX(i, w);
        const y = getY(data[i].p_pv_bus_kw);
        if (i === startIndex) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 3. Load Demand (Red)
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = startIndex; i <= endIndex; i++) {
        const x = getX(i, w);
        const y = getY(data[i].p_load_kw);
        if (i === startIndex) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 4. BESS Power (+ Charge, - Discharge) (Emerald / Blue)
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = '#10b981';
      ctx.beginPath();
      for (let i = startIndex; i <= endIndex; i++) {
        const netBess = data[i].p_bess_chg_kw > 0 ? data[i].p_bess_chg_kw : -data[i].p_bess_dis_kw;
        const x = getX(i, w);
        const y = getY(netBess);
        if (i === startIndex) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 5. PEM Electrolyzer (Cyan)
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = startIndex; i <= endIndex; i++) {
        const x = getX(i, w);
        const y = getY(data[i].p_elec_bus_kw);
        if (i === startIndex) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 6. PEM Fuel Cell (Purple)
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = startIndex; i <= endIndex; i++) {
        const x = getX(i, w);
        const y = getY(data[i].p_fc_bus_kw);
        if (i === startIndex) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      drawCrosshair(ctx, w, h);
    });

    // ----------------------------------------------------
    // PLOT 2: BESS SoC (%) & Active Controller State Bands
    // ----------------------------------------------------
    renderPlot(canvas2Ref.current, (ctx, w, h) => {
      const plotWidth = w - leftMargin - rightMargin;
      const plotHeight = h - topMargin - bottomMargin;

      // Draw State Background Bands (1: Emerald, 2: Cyan, 3: Amber, 4: Purple)
      const stateColors: Record<number, string> = {
        1: 'rgba(16, 185, 129, 0.12)', // BESS Charging
        2: 'rgba(6, 182, 212, 0.16)',  // Electrolyzer H2
        3: 'rgba(245, 158, 11, 0.08)', // BESS Discharging
        4: 'rgba(168, 85, 247, 0.22)', // Fuel Cell Active
      };

      for (let i = startIndex; i <= endIndex; i++) {
        const st = data[i].state;
        const xStart = getX(i, w);
        const xEnd = getX(i + 1, w);
        ctx.fillStyle = stateColors[st] || 'transparent';
        ctx.fillRect(xStart, topMargin, Math.max(1, xEnd - xStart), plotHeight);
      }

      drawGrid(ctx, w, h, 0, 100, '%');

      const getY = (socVal: number) => {
        return topMargin + plotHeight * (1 - socVal / 1.0);
      };

      // Draw Threshold Reference Lines
      const drawRefLine = (val: number, color: string, label: string) => {
        const y = getY(val);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(leftMargin, y);
        ctx.lineTo(w - rightMargin, y);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = '9px monospace';
        ctx.fillText(label, leftMargin + 4, y - 3);
        ctx.restore();
      };

      drawRefLine(1.0, '#10b981', '100% SoC Max');
      drawRefLine(params.soc_absorption_taper, '#34d399', `${(params.soc_absorption_taper * 100).toFixed(0)}% Taper`);
      drawRefLine(params.soc_fc_trigger_off, '#c084fc', `${(params.soc_fc_trigger_off * 100).toFixed(0)}% FC Stop`);
      drawRefLine(params.soc_fc_trigger_on, '#a855f7', `${(params.soc_fc_trigger_on * 100).toFixed(0)}% FC Start`);
      drawRefLine(params.soc_min, '#f43f5e', `${(params.soc_min * 100).toFixed(0)}% Min Cutoff`);

      // SoC Curve (Emerald / Bright Teal)
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = startIndex; i <= endIndex; i++) {
        const x = getX(i, w);
        const y = getY(data[i].soc);
        if (i === startIndex) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      drawCrosshair(ctx, w, h);
    });

    // ----------------------------------------------------
    // PLOT 3: H2 Tank Mass & Pressure & DI Water
    // ----------------------------------------------------
    renderPlot(canvas3Ref.current, (ctx, w, h) => {
      let maxMass = 0.5;
      let maxPress = params.tank_p_max_bar * 1.1;
      for (let i = startIndex; i <= endIndex; i++) {
        maxMass = Math.max(maxMass, data[i].m_h2_tank_kg);
        maxPress = Math.max(maxPress, data[i].p_tank_bar);
      }
      maxMass = Math.ceil(maxMass * 1.25 * 10) / 10;
      maxPress = Math.ceil(maxPress * 1.15);

      drawGrid(ctx, w, h, 0, maxMass, 'kg H₂', 0, maxPress, 'bar');

      const getYMass = (m: number) => {
        const plotHeight = h - topMargin - bottomMargin;
        return topMargin + plotHeight * (1 - m / maxMass);
      };

      const getYPress = (p: number) => {
        const plotHeight = h - topMargin - bottomMargin;
        return topMargin + plotHeight * (1 - p / maxPress);
      };

      // Max Working Pressure Limit Line (Dashed Red)
      const yPMax = getYPress(params.tank_p_max_bar);
      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(leftMargin, yPMax);
      ctx.lineTo(w - rightMargin, yPMax);
      ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.font = '9px monospace';
      ctx.fillText(`P_max: ${params.tank_p_max_bar} bar`, w - rightMargin - 95, yPMax - 3);
      ctx.restore();

      // H2 Mass Curve (Cyan Solid)
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let i = startIndex; i <= endIndex; i++) {
        const x = getX(i, w);
        const y = getYMass(data[i].m_h2_tank_kg);
        if (i === startIndex) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // H2 Tank Pressure Curve (Sky Blue Solid)
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 1]);
      ctx.beginPath();
      for (let i = startIndex; i <= endIndex; i++) {
        const x = getX(i, w);
        const y = getYPress(data[i].p_tank_bar);
        if (i === startIndex) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      drawCrosshair(ctx, w, h);
    });

    // ----------------------------------------------------
    // PLOT 4: DC Bus Voltage (V) & Branch Currents (A)
    // ----------------------------------------------------
    renderPlot(canvas4Ref.current, (ctx, w, h) => {
      let maxA = 10.0;
      let minV = 44.0;
      let maxV = 58.0;

      for (let i = startIndex; i <= endIndex; i++) {
        const s = data[i];
        maxA = Math.max(maxA, s.i_pv_a, s.i_load_a, Math.abs(s.i_bess_a), s.i_elec_a, s.i_fc_a);
        minV = Math.min(minV, s.v_bus_v);
        maxV = Math.max(maxV, s.v_bus_v);
      }
      maxA = Math.ceil(maxA * 1.25);
      minV = Math.floor(minV - 1.0);
      maxV = Math.ceil(maxV + 1.0);

      drawGrid(ctx, w, h, minV, maxV, 'V bus', 0, maxA, 'A');

      const getYVolt = (v: number) => {
        const plotHeight = h - topMargin - bottomMargin;
        return topMargin + plotHeight * (1 - (v - minV) / (maxV - minV));
      };

      const getYCurr = (a: number) => {
        const plotHeight = h - topMargin - bottomMargin;
        return topMargin + plotHeight * (1 - a / maxA);
      };

      // 48.0 V Nominal reference line
      const y48 = getYVolt(48.0);
      ctx.save();
      ctx.strokeStyle = '#475569';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(leftMargin, y48);
      ctx.lineTo(w - rightMargin, y48);
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      ctx.fillText('48.0V Nom', leftMargin + 4, y48 - 3);
      ctx.restore();

      // Bus Voltage Curve (Solid Yellow / Amber)
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let i = startIndex; i <= endIndex; i++) {
        const x = getX(i, w);
        const y = getYVolt(data[i].v_bus_v);
        if (i === startIndex) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Branch Currents (Lines):
      // PV Current (Amber)
      ctx.strokeStyle = '#f59e0b88';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = startIndex; i <= endIndex; i++) {
        const x = getX(i, w);
        const y = getYCurr(data[i].i_pv_a);
        if (i === startIndex) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Load Current (Rose)
      ctx.strokeStyle = '#f43f5e88';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = startIndex; i <= endIndex; i++) {
        const x = getX(i, w);
        const y = getYCurr(data[i].i_load_a);
        if (i === startIndex) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Electrolyzer Current (Cyan)
      ctx.strokeStyle = '#06b6d4aa';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = startIndex; i <= endIndex; i++) {
        const x = getX(i, w);
        const y = getYCurr(data[i].i_elec_a);
        if (i === startIndex) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Fuel Cell Current (Purple)
      ctx.strokeStyle = '#a855f7aa';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = startIndex; i <= endIndex; i++) {
        const x = getX(i, w);
        const y = getYCurr(data[i].i_fc_a);
        if (i === startIndex) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      drawCrosshair(ctx, w, h);
    });
  }, [data, startIndex, endIndex, hoverIndex, params]);

  // Handle Mouse Hover / Scrubbing across plots
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const leftMargin = 55;
    const rightMargin = 55;
    const plotWidth = rect.width - leftMargin - rightMargin;

    if (x >= leftMargin && x <= rect.width - rightMargin) {
      const frac = (x - leftMargin) / plotWidth;
      const targetIdx = Math.round(startIndex + frac * (endIndex - startIndex));
      if (targetIdx >= 0 && targetIdx < data.length) {
        setHoverIndex(targetIdx);
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!e.touches || e.touches.length === 0) return;
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const leftMargin = 55;
    const rightMargin = 55;
    const plotWidth = rect.width - leftMargin - rightMargin;

    if (x >= leftMargin && x <= rect.width - rightMargin) {
      const frac = (x - leftMargin) / plotWidth;
      const targetIdx = Math.round(startIndex + frac * (endIndex - startIndex));
      if (targetIdx >= 0 && targetIdx < data.length) {
        setHoverIndex(targetIdx);
      }
    }
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col bg-[#080d17] overflow-hidden border-b border-slate-800"
      style={{ touchAction: 'pan-y' }}
    >
      {/* Plot Header Toolbar: Time Range Controls & Synchronized Hover Readout */}
      <div className="bg-[#0b1220] border-b border-slate-800 px-3 sm:px-4 py-1.5 flex flex-wrap items-center justify-between text-xs gap-2">
        {/* Zoom Presets */}
        <div className="flex items-center gap-1 font-mono flex-wrap">
          <span className="text-slate-500 text-[11px] mr-1 uppercase">Zoom:</span>
          <button
            onClick={() => handleZoomPreset(1)}
            className="px-2 py-0.5 bg-[#141e33] hover:bg-[#1b2b4a] text-slate-300 rounded border border-slate-700/60 transition text-[11px]"
          >
            1 Day
          </button>
          <button
            onClick={() => handleZoomPreset(3)}
            className="px-2 py-0.5 bg-[#141e33] hover:bg-[#1b2b4a] text-slate-300 rounded border border-slate-700/60 transition text-[11px]"
          >
            3 Days
          </button>
          <button
            onClick={() => handleZoomPreset(7)}
            className="px-2 py-0.5 bg-[#141e33] hover:bg-[#1b2b4a] text-slate-300 rounded border border-slate-700/60 transition text-[11px]"
          >
            7 Days
          </button>
          <button
            onClick={() => handleZoomPreset('all')}
            className="px-2 py-0.5 bg-[#141e33] hover:bg-[#1b2b4a] text-cyan-300 font-bold rounded border border-slate-700/60 transition text-[11px]"
          >
            All ({data.length > 96 ? `${(data.length / 96).toFixed(0)}d` : '96pts'})
          </button>
          <button
            onClick={() => setWindowRange([0, data.length - 1])}
            title="Reset Zoom"
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition ml-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Live Hover Scrubber Telemetry Header */}
        {activeStep && (
          <div className="flex items-center gap-2 sm:gap-3 font-mono text-[11px] flex-wrap">
            <div className="flex items-center gap-1.5 bg-[#131d31] px-2 py-0.5 rounded border border-slate-700">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-cyan-300 font-bold">{activeStep.timestamp}</span>
              <span className="text-slate-500 hidden sm:inline">(Step {activeStep.step})</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  activeStep.state === 1
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : activeStep.state === 2
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : activeStep.state === 3
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                }`}
              >
                {activeStep.state === 1
                  ? 'STATE 1: BESS Chg'
                  : activeStep.state === 2
                  ? 'STATE 2: H₂ Elec'
                  : activeStep.state === 3
                  ? 'STATE 3: BESS Dis'
                  : 'STATE 4: FC Active'}
              </span>
            </div>

            <div className="hidden xl:flex items-center gap-2.5 text-slate-300">
              <span>
                PV: <strong className="text-amber-400">{activeStep.p_pv_bus_kw.toFixed(2)} kW</strong>
              </span>
              <span>
                Load: <strong className="text-rose-400">{activeStep.p_load_kw.toFixed(2)} kW</strong>
              </span>
              <span>
                SoC: <strong className="text-emerald-400">{(activeStep.soc * 100).toFixed(1)}%</strong>
              </span>
              <span>
                V_bus: <strong className="text-yellow-400">{activeStep.v_bus_v.toFixed(1)} V</strong>
              </span>
              <span>
                H₂ Tank: <strong className="text-sky-400">{activeStep.p_tank_bar.toFixed(1)} bar</strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 4 Synchronized Canvas Plot Tracks */}
      <div
        className="flex-1 flex flex-col divide-y divide-slate-800/80 cursor-crosshair overflow-hidden min-h-[360px]"
        style={{ touchAction: 'pan-y' }}
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouchMove}
        onMouseLeave={handleMouseLeave}
        onTouchEnd={handleMouseLeave}
      >
        {/* PLOT 1: Power Dispatch Stack (kW) */}
        <div className="flex-1 flex flex-col relative min-h-[110px]">
          <div className="absolute top-1 left-14 z-10 flex items-center gap-2 text-[10px] font-mono text-slate-400 bg-[#080d17]/80 px-2 py-0.5 rounded border border-slate-800 backdrop-blur-sm">
            <span className="font-bold text-slate-200">Track 1: Power Dispatch Stack (kW)</span>
            <span className="text-amber-400">● PV Gen</span>
            <span className="text-rose-400">● Load</span>
            <span className="text-emerald-400">● BESS Chg</span>
            <span className="text-blue-400">● BESS Dis</span>
            <span className="text-cyan-400">● PEM Elec</span>
            <span className="text-purple-400">● Fuel Cell</span>
            <span className="text-slate-400">● Curtail</span>
          </div>
          <canvas ref={canvas1Ref} className="w-full h-full block" />
        </div>

        {/* PLOT 2: BESS SoC (%) & Active Controller State Bands */}
        <div className="flex-1 flex flex-col relative min-h-[110px]">
          <div className="absolute top-1 left-14 z-10 flex items-center gap-2 text-[10px] font-mono text-slate-400 bg-[#080d17]/80 px-2 py-0.5 rounded border border-slate-800 backdrop-blur-sm">
            <span className="font-bold text-slate-200">Track 2: BESS State of Charge & Controller States</span>
            <span className="text-emerald-400">● SoC %</span>
            <span className="text-emerald-300/80">■ St 1 (Chg)</span>
            <span className="text-cyan-300/80">■ St 2 (H₂)</span>
            <span className="text-amber-300/80">■ St 3 (Dis)</span>
            <span className="text-purple-300/80">■ St 4 (FC)</span>
          </div>
          <canvas ref={canvas2Ref} className="w-full h-full block" />
        </div>

        {/* PLOT 3: H2 Tank Mass & Pressure */}
        <div className="flex-1 flex flex-col relative min-h-[110px]">
          <div className="absolute top-1 left-14 z-10 flex items-center gap-2 text-[10px] font-mono text-slate-400 bg-[#080d17]/80 px-2 py-0.5 rounded border border-slate-800 backdrop-blur-sm">
            <span className="font-bold text-slate-200">Track 3: H₂ Storage Tank & Thermodynamics</span>
            <span className="text-cyan-400">― Stored H₂ Mass (kg)</span>
            <span className="text-sky-400">·· Tank Pressure (bar)</span>
            <span className="text-rose-400">-- P_max Rating</span>
          </div>
          <canvas ref={canvas3Ref} className="w-full h-full block" />
        </div>

        {/* PLOT 4: DC Bus Voltage & Branch Currents */}
        <div className="flex-1 flex flex-col relative min-h-[110px]">
          <div className="absolute top-1 left-14 z-10 flex items-center gap-2 text-[10px] font-mono text-slate-400 bg-[#080d17]/80 px-2 py-0.5 rounded border border-slate-800 backdrop-blur-sm">
            <span className="font-bold text-slate-200">Track 4: 48V Bus Voltage & Branch Current Limits</span>
            <span className="text-yellow-400">― V_bus (V)</span>
            <span className="text-amber-400/80">· I_pv (A)</span>
            <span className="text-rose-400/80">· I_load (A)</span>
            <span className="text-cyan-400/80">· I_elec (A)</span>
            <span className="text-purple-400/80">· I_fc (A)</span>
          </div>
          <canvas ref={canvas4Ref} className="w-full h-full block" />
        </div>
      </div>
    </div>
  );
};
