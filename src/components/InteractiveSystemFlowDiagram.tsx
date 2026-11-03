import React, { useState, useEffect, useRef } from 'react';
import {
  TimeSeriesOutputStep,
  SystemParameters,
  DispatchState,
} from '../types/microgrid';
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Battery,
  Check,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Droplets,
  Eye,
  EyeOff,
  Flame,
  Gauge,
  Info,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Sliders,
  Sun,
  Wind,
  Zap,
} from 'lucide-react';

interface Props {
  currentStep: TimeSeriesOutputStep | null;
  allSteps: TimeSeriesOutputStep[];
  params: SystemParameters;
  onSelectStepIndex?: (index: number) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export const InteractiveSystemFlowDiagram: React.FC<Props> = ({
  currentStep,
  allSteps,
  params,
  onSelectStepIndex,
  isFullscreen,
  onToggleFullscreen,
}) => {
  // Layer visibility toggles
  const [showPowerFlow, setShowPowerFlow] = useState<boolean>(true);
  const [showMaterialFlow, setShowMaterialFlow] = useState<boolean>(true);
  const [showDataSignals, setShowDataSignals] = useState<boolean>(true);
  const [animateFlow, setAnimateFlow] = useState<boolean>(true);

  // Playback state for scrubber
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const playTimerRef = useRef<number | null>(null);

  // Current active step fallback
  const activeStep = currentStep || allSteps[0] || null;
  const activeIndex = activeStep ? Math.max(0, activeStep.step - 1) : 0;

  // Auto-play scrubber effect
  useEffect(() => {
    if (isPlaying && allSteps.length > 0) {
      const intervalMs = Math.max(40, 200 / playbackSpeed);
      playTimerRef.current = window.setInterval(() => {
        if (onSelectStepIndex) {
          const nextIdx = (activeIndex + 1) % allSteps.length;
          onSelectStepIndex(nextIdx);
        }
      }, intervalMs);
    } else if (playTimerRef.current) {
      clearInterval(playTimerRef.current);
      playTimerRef.current = null;
    }

    return () => {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
      }
    };
  }, [isPlaying, activeIndex, allSteps.length, playbackSpeed, onSelectStepIndex]);

  if (!activeStep) {
    return (
      <div className="p-8 text-center text-slate-500 font-mono text-xs">
        No simulation telemetry loaded. Execute simulation to inspect power & material flow.
      </div>
    );
  }

  // Electrical variables for active step
  const v_bus = activeStep.v_bus_v;
  const p_pv_w = Math.round(activeStep.p_pv_bus_kw * 1000);
  const i_pv_a = activeStep.i_pv_a;

  const p_load_w = Math.round(activeStep.p_load_kw * 1000);
  const i_load_a = activeStep.i_load_a;

  const p_bess_chg_w = Math.round(activeStep.p_bess_chg_kw * 1000);
  const p_bess_dis_w = Math.round(activeStep.p_bess_dis_kw * 1000);
  const bessIsCharging = p_bess_chg_w > 0;
  const bessIsDischarging = p_bess_dis_w > 0;
  const i_bess_abs_a = Math.abs(activeStep.i_bess_a);
  const v_bess_ocv = activeStep.v_oc_bess_v;

  const p_elec_w = Math.round(activeStep.p_elec_bus_kw * 1000);
  const i_elec_a = activeStep.i_elec_a;
  const elecIsActive = p_elec_w > 0;
  // Step-down low-V side of electrolyzer (approx 20V DC)
  const v_elec_stack = 20.0;
  const p_elec_stack_w = Math.round(p_elec_w * params.eta_elec_dcdc);
  const i_elec_stack_a = elecIsActive ? (p_elec_stack_w / v_elec_stack).toFixed(1) : '0.0';

  const p_fc_w = Math.round(activeStep.p_fc_bus_kw * 1000);
  const i_fc_a = activeStep.i_fc_a;
  const fcIsActive = p_fc_w > 0;
  // Step-up stack side (approx 28V DC)
  const v_fc_stack = 28.0;
  const p_fc_stack_w = fcIsActive ? Math.round(p_fc_w / params.eta_fc_dcdc) : 0;
  const i_fc_stack_a = fcIsActive ? (p_fc_stack_w / v_fc_stack).toFixed(1) : '0.0';

  // Material Flow variables (rates per hour, dt = 0.25h)
  const dt_h = 0.25;
  const h2_prod_rate_gh = ((activeStep.m_h2_prod_kg * 1000) / dt_h).toFixed(1);
  const di_water_rate_lh = (activeStep.v_di_water_l / dt_h).toFixed(2);
  const o2_vent_rate_nm3h = (activeStep.v_o2_nm3 / dt_h).toFixed(2);
  const h2_cons_rate_gh = ((activeStep.m_h2_cons_kg * 1000) / dt_h).toFixed(1);

  // Array STC operating voltage estimate
  const v_pv_array = activeStep.p_pv_bus_kw > 0 ? 98.4 : 0.0;
  const i_pv_array = activeStep.p_pv_bus_kw > 0 ? (p_pv_w / v_pv_array).toFixed(1) : '0.0';

  // Tedlar Bags & Optional Fuel Cell status
  const isFcEnabled = params.fc_enabled !== false;
  const isTedlarEnabled = params.tedlar_bags_enabled !== false;
  const tedlarVolumeL = (activeStep.v_tedlar_liters || 0).toFixed(1);
  const tedlarBagsCount = activeStep.tedlar_bags_count || 0;
  const tedlarChunkSize = params.tedlar_bag_chunk_l || 10;
  const tedlarIsReceiving = (activeStep.m_h2_tedlar_kg || 0) > 0 && elecIsActive;

  return (
    <div className="flex flex-col h-full w-full bg-[#070c16] text-slate-200 select-none overflow-hidden rounded border border-slate-800">
      {/* Top Diagram Toolbar: Playback, Time Scrubber, Layer Filters */}
      <div className="bg-[#0b1220] border-b border-slate-800 px-3 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Playback & Step Scrubbing */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#131d31] p-1 rounded border border-slate-700">
            <button
              onClick={() => {
                if (onSelectStepIndex && activeIndex > 0) {
                  onSelectStepIndex(activeIndex - 1);
                }
              }}
              title="Previous Step"
              className="p-1 hover:bg-slate-700 rounded text-slate-300 transition"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              title={isPlaying ? 'Pause Playback' : 'Play Simulation'}
              className={`p-1 rounded font-bold transition flex items-center gap-1 px-2 text-[11px] ${
                isPlaying
                  ? 'bg-amber-600 text-white'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white'
              }`}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isPlaying ? 'Pause' : 'Play'}</span>
            </button>
            <button
              onClick={() => {
                if (onSelectStepIndex && activeIndex < allSteps.length - 1) {
                  onSelectStepIndex(activeIndex + 1);
                }
              }}
              title="Next Step"
              className="p-1 hover:bg-slate-700 rounded text-slate-300 transition"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Time Scrubber Slider */}
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <input
              type="range"
              min={0}
              max={Math.max(0, allSteps.length - 1)}
              value={activeIndex}
              onChange={(e) => {
                if (onSelectStepIndex) {
                  onSelectStepIndex(Number(e.target.value));
                }
              }}
              className="w-28 sm:w-44 accent-cyan-400 h-1.5 bg-slate-700 rounded cursor-pointer"
            />
            <span className="text-cyan-300 font-bold whitespace-nowrap">
              {activeStep.timestamp}
            </span>
            <span className="text-slate-500 hidden md:inline">
              (Step {activeStep.step}/{allSteps.length})
            </span>
          </div>

          {/* State Badge */}
          <div
            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider border ${
              activeStep.state === 1
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                : activeStep.state === 2
                ? 'bg-cyan-950/80 text-cyan-300 border-cyan-500/50'
                : activeStep.state === 3
                ? 'bg-amber-950/80 text-amber-300 border-amber-500/50'
                : 'bg-purple-950/80 text-purple-300 border-purple-500/50'
            }`}
          >
            {activeStep.state === 1
              ? 'STATE 1: BESS Charging'
              : activeStep.state === 2
              ? 'STATE 2: Electrolyzer H₂'
              : activeStep.state === 3
              ? 'STATE 3: BESS Discharging'
              : 'STATE 4: PEMFC Range-Extender'}
          </div>
        </div>

        {/* Layer Visibility Filters */}
        <div className="flex items-center gap-2 font-mono text-[11px]">
          {/* Layer 1: Electrical Power Flow */}
          <button
            onClick={() => setShowPowerFlow(!showPowerFlow)}
            className={`flex items-center gap-1 px-2 py-1 rounded border transition ${
              showPowerFlow
                ? 'bg-amber-950/60 text-amber-300 border-amber-500/50'
                : 'bg-[#101726] text-slate-500 border-slate-800'
            }`}
          >
            <Zap className="w-3 h-3 text-amber-400" />
            <span>Power (V,A,W DC)</span>
          </button>

          {/* Layer 2: Material Flow (H2, DI H2O, O2) */}
          <button
            onClick={() => setShowMaterialFlow(!showMaterialFlow)}
            className={`flex items-center gap-1 px-2 py-1 rounded border transition ${
              showMaterialFlow
                ? 'bg-cyan-950/60 text-cyan-300 border-cyan-500/50'
                : 'bg-[#101726] text-slate-500 border-slate-800'
            }`}
          >
            <Droplets className="w-3 h-3 text-cyan-400" />
            <span>Fluids (H₂, H₂O, O₂)</span>
          </button>

          {/* Layer 3: Comms / Signals */}
          <button
            onClick={() => setShowDataSignals(!showDataSignals)}
            className={`flex items-center gap-1 px-2 py-1 rounded border transition ${
              showDataSignals
                ? 'bg-purple-950/60 text-purple-300 border-purple-500/50'
                : 'bg-[#101726] text-slate-500 border-slate-800'
            }`}
          >
            <Cpu className="w-3 h-3 text-purple-400" />
            <span>Data & Signals</span>
          </button>

          {/* Flow Directional Animation Toggle */}
          <button
            onClick={() => setAnimateFlow(!animateFlow)}
            title={animateFlow ? 'Disable Flow Animation' : 'Enable Flow Animation'}
            className={`p-1 px-2 rounded border text-[11px] transition flex items-center gap-1 ${
              animateFlow
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50'
                : 'bg-[#101726] text-slate-500 border-slate-800'
            }`}
          >
            <Activity className="w-3 h-3 text-emerald-400" />
            <span className="hidden sm:inline">Animation</span>
          </button>

          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              title="Toggle Fullscreen Diagram"
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition ml-1"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main SVG Schematic Canvas Stage */}
      <div className="flex-1 w-full h-full relative overflow-auto bg-[#060a12] p-2 flex items-center justify-center">
        <svg
          viewBox="0 0 1200 780"
          className="w-full h-auto max-h-[760px] max-w-[1240px] drop-shadow-md select-none"
          preserveAspectRatio="xMidYMid meet"
          style={{ touchAction: 'pan-y pinch-zoom' }}
        >
          <defs>
            {/* Arrowhead Markers for Electrical Power */}
            <marker
              id="arrow-power-amber"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
            </marker>
            <marker
              id="arrow-power-emerald"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
            </marker>
            <marker
              id="arrow-power-rose"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#f43f5e" />
            </marker>
            <marker
              id="arrow-power-cyan"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#06b6d4" />
            </marker>
            <marker
              id="arrow-power-purple"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#a855f7" />
            </marker>

            {/* Fluid Flow Markers */}
            <marker
              id="arrow-fluid-cyan"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
            </marker>
            <marker
              id="arrow-fluid-blue"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#3b82f6" />
            </marker>

            {/* Comms Signal Marker */}
            <marker
              id="arrow-signal-purple"
              viewBox="0 0 10 10"
              refX="5"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <circle cx="5" cy="5" r="3" fill="#c084fc" />
            </marker>

            {/* Gradients */}
            <linearGradient id="busbarGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ca8a04" />
              <stop offset="50%" stopColor="#eab308" />
              <stop offset="100%" stopColor="#facc15" />
            </linearGradient>

            <linearGradient id="panelGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
          </defs>

          {/* Background Grid Accent */}
          <g opacity="0.08" stroke="#64748b" strokeWidth="0.5">
            {Array.from({ length: 24 }).map((_, i) => (
              <line key={`vg-${i}`} x1={i * 50} y1="0" x2={i * 50} y2="780" />
            ))}
            {Array.from({ length: 16 }).map((_, i) => (
              <line key={`hg-${i}`} x1="0" y1={i * 50} x2="1200" y2={i * 50} />
            ))}
          </g>

          {/* ========================================================= */}
          {/* LAYER 3: DATA & COMMUNICATION SIGNALS (BACKGROUND WIRES)  */}
          {/* ========================================================= */}
          {showDataSignals && (
            <g id="layer-comms-signals" stroke="#a855f7" strokeWidth="1.2" opacity="0.65">
              {/* DAQ to Weather Station */}
              <path
                d="M 600 80 L 150 80 L 150 140"
                fill="none"
                strokeDasharray="4 4"
                className={animateFlow ? 'flow-active-data' : ''}
                markerEnd="url(#arrow-signal-purple)"
              />
              {/* DAQ to MPPT */}
              <path
                d="M 600 110 L 320 110 L 320 180"
                fill="none"
                strokeDasharray="4 4"
                className={animateFlow ? 'flow-active-data' : ''}
                markerEnd="url(#arrow-signal-purple)"
              />
              {/* DAQ to BMS (BESS) */}
              <path
                d="M 600 120 L 730 120 L 730 180"
                fill="none"
                strokeDasharray="4 4"
                className={animateFlow ? 'flow-active-data' : ''}
                markerEnd="url(#arrow-signal-purple)"
              />
              {/* DAQ to Electrolyzer Controller */}
              <path
                d="M 600 130 L 190 130 L 190 540"
                fill="none"
                strokeDasharray="4 4"
                className={animateFlow ? 'flow-active-data' : ''}
                markerEnd="url(#arrow-signal-purple)"
              />
              {/* DAQ to H2 Tank Pressure Transducer */}
              <path
                d="M 600 140 L 450 140 L 450 560"
                fill="none"
                strokeDasharray="4 4"
                className={animateFlow ? 'flow-active-data' : ''}
                markerEnd="url(#arrow-signal-purple)"
              />
              {/* DAQ to Fuel Cell ECU */}
              <path
                d="M 600 130 L 710 130 L 710 540"
                fill="none"
                strokeDasharray="4 4"
                className={animateFlow ? 'flow-active-data' : ''}
                markerEnd="url(#arrow-signal-purple)"
              />
              {/* DAQ to DC Load Shunt */}
              <path
                d="M 600 100 L 1050 100 L 1050 210"
                fill="none"
                strokeDasharray="4 4"
                className={animateFlow ? 'flow-active-data' : ''}
                markerEnd="url(#arrow-signal-purple)"
              />

              {/* Protocol Annotation Tags */}
              <text x="210" y="72" fill="#c084fc" fontSize="9" fontFamily="monospace">
                4-20mA Weather
              </text>
              <text x="325" y="105" fill="#c084fc" fontSize="9" fontFamily="monospace">
                Modbus-RTU MPPT
              </text>
              <text x="735" y="115" fill="#c084fc" fontSize="9" fontFamily="monospace">
                CAN 2.0B BMS
              </text>
              <text x="200" y="470" fill="#c084fc" fontSize="9" fontFamily="monospace">
                Modbus-RTU Elec
              </text>
              <text x="460" y="470" fill="#c084fc" fontSize="9" fontFamily="monospace">
                4-20mA Pressure
              </text>
              <text x="720" y="470" fill="#c084fc" fontSize="9" fontFamily="monospace">
                CAN 2.0B FC ECU
              </text>
              <text x="960" y="92" fill="#c084fc" fontSize="9" fontFamily="monospace">
                Modbus DC Load
              </text>
            </g>
          )}

          {/* ========================================================= */}
          {/* LAYER 2: MATERIAL FLOW LINES (FLUIDS: H2, DI WATER, O2)   */}
          {/* ========================================================= */}
          {showMaterialFlow && (
            <g id="layer-material-flow">
              {/* DI Water Pipe: Tank -> Electrolyzer */}
              <path
                d="M 80 620 L 130 620"
                fill="none"
                stroke="#3b82f6"
                strokeWidth="3.5"
                className={elecIsActive && animateFlow ? 'flow-active-fluid' : ''}
                markerEnd="url(#arrow-fluid-blue)"
              />
              {/* Oxygen Safe Vent: Electrolyzer -> Exhaust */}
              <path
                d="M 190 710 L 190 755"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2.5"
                strokeDasharray="4 3"
                className={elecIsActive && animateFlow ? 'flow-active-fluid' : ''}
                markerEnd="url(#arrow-fluid-cyan)"
              />
              {/* Hydrogen Production: Electrolyzer -> H2 Tank */}
              <path
                d="M 260 620 L 360 620"
                fill="none"
                stroke="#06b6d4"
                strokeWidth="3.8"
                className={elecIsActive && animateFlow ? 'flow-active-fluid' : ''}
                markerEnd="url(#arrow-fluid-cyan)"
              />
              {/* Excess H2 Diversion: Tank Manifold -> Atmospheric Tedlar Bags */}
              {isTedlarEnabled && (
                <path
                  d="M 475 620 L 490 620"
                  fill="none"
                  stroke={tedlarIsReceiving ? '#38bdf8' : '#0284c7'}
                  strokeWidth="3.5"
                  className={tedlarIsReceiving && animateFlow ? 'flow-active-fluid' : ''}
                  markerEnd="url(#arrow-fluid-cyan)"
                />
              )}
              {/* Hydrogen Fuel Supply: H2 Tank -> Pressure Regulator -> Fuel Cell */}
              {isFcEnabled ? (
                <>
                  <path
                    d="M 615 620 L 635 620"
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="3.5"
                    className={fcIsActive && animateFlow ? 'flow-active-fluid' : ''}
                    markerEnd="url(#arrow-fluid-cyan)"
                  />
                  <path
                    d="M 665 620 L 680 620"
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="3.5"
                    className={fcIsActive && animateFlow ? 'flow-active-fluid' : ''}
                    markerEnd="url(#arrow-fluid-cyan)"
                  />
                </>
              ) : (
                <path
                  d="M 615 620 L 680 620"
                  fill="none"
                  stroke="#334155"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />
              )}

              {/* Material Flow Rate Text Badges */}
              {/* DI Water Badge */}
              <g transform="translate(65, 580)">
                <rect width="80" height="26" rx="4" fill="#0f172a" stroke="#3b82f6" strokeWidth="1" />
                <text x="40" y="12" fill="#93c5fd" fontSize="8.5" fontFamily="monospace" textAnchor="middle">
                  DI WATER (H₂O)
                </text>
                <text x="40" y="22" fill="#60a5fa" fontSize="9.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  {di_water_rate_lh} L/h
                </text>
              </g>

              {/* H2 Production Badge */}
              <g transform="translate(265, 580)">
                <rect width="90" height="26" rx="4" fill="#0f172a" stroke="#06b6d4" strokeWidth="1" />
                <text x="45" y="12" fill="#67e8f9" fontSize="8.5" fontFamily="monospace" textAnchor="middle">
                  H₂ GAS GEN
                </text>
                <text x="45" y="22" fill="#22d3ee" fontSize="9.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  {h2_prod_rate_gh} g/h H₂
                </text>
              </g>

              {/* Tedlar Bags Excess H2 Badge */}
              {isTedlarEnabled && (
                <g transform="translate(420, 520)">
                  <rect width="115" height="26" rx="4" fill="#0c1322" stroke="#38bdf8" strokeWidth="1" />
                  <text x="57.5" y="11" fill="#7dd3fc" fontSize="8" fontFamily="monospace" textAnchor="middle">
                    EXCESS H₂ TO TEDLAR
                  </text>
                  <text x="57.5" y="21" fill="#38bdf8" fontSize="8.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                    {tedlarVolumeL} L ({tedlarBagsCount} × {tedlarChunkSize}L)
                  </text>
                </g>
              )}

              {/* O2 Vent Badge */}
              <g transform="translate(145, 750)">
                <rect width="90" height="20" rx="3" fill="#0f172a" stroke="#38bdf8" strokeWidth="0.8" />
                <text x="45" y="13" fill="#7dd3fc" fontSize="8" fontFamily="monospace" textAnchor="middle">
                  O₂ Vent: {o2_vent_rate_nm3h} Nm³/h
                </text>
              </g>

              {/* H2 Fuel Supply Badge */}
              <g transform="translate(585, 580)">
                <rect width="95" height="26" rx="4" fill="#0f172a" stroke={isFcEnabled ? '#06b6d4' : '#475569'} strokeWidth="1" />
                <text x="47.5" y="12" fill={isFcEnabled ? '#67e8f9' : '#94a3b8'} fontSize="8.5" fontFamily="monospace" textAnchor="middle">
                  {isFcEnabled ? 'H₂ FUEL INLET' : 'FC ISOLATED'}
                </text>
                <text x="47.5" y="22" fill={isFcEnabled ? '#22d3ee' : '#64748b'} fontSize="9.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  {isFcEnabled ? `${h2_cons_rate_gh} g/h @ 1.5b` : 'P2G STANDALONE'}
                </text>
              </g>
            </g>
          )}

          {/* ========================================================= */}
          {/* LAYER 1: ELECTRICAL POWER FLOW (V, A, W - DC/AC ANNOTATIONS) */}
          {/* ========================================================= */}
          {showPowerFlow && (
            <g id="layer-electrical-power-flow">
              {/* Branch 1: PV Array -> MPPT DC-DC */}
              <path
                d="M 180 230 L 260 230"
                fill="none"
                stroke={p_pv_w > 0 ? '#f59e0b' : '#334155'}
                strokeWidth={p_pv_w > 0 ? '4' : '2'}
                className={p_pv_w > 0 && animateFlow ? 'flow-active-forward' : ''}
                markerEnd="url(#arrow-power-amber)"
              />

              {/* Branch 1: MPPT DC-DC -> 48V Busbar */}
              <path
                d="M 370 230 L 450 230 L 450 360"
                fill="none"
                stroke={p_pv_w > 0 ? '#f59e0b' : '#334155'}
                strokeWidth={p_pv_w > 0 ? '4.5' : '2'}
                className={p_pv_w > 0 && animateFlow ? 'flow-active-forward' : ''}
                markerEnd="url(#arrow-power-amber)"
              />

              {/* Branch 2: 48V Busbar -> Programmable DC Load */}
              <path
                d="M 1000 400 L 1000 240 L 1040 240"
                fill="none"
                stroke={p_load_w > 0 ? '#f43f5e' : '#334155'}
                strokeWidth={p_load_w > 0 ? '4.5' : '2'}
                className={p_load_w > 0 && animateFlow ? 'flow-active-forward' : ''}
                markerEnd="url(#arrow-power-rose)"
              />

              {/* Branch 3: 48V Busbar <-> BESS BiDir DC-DC */}
              {bessIsCharging ? (
                // Charging: Bus -> BiDir -> Battery Pack
                <>
                  <path
                    d="M 650 360 L 650 230 L 670 230"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="4.5"
                    className={animateFlow ? 'flow-active-forward' : ''}
                    markerEnd="url(#arrow-power-emerald)"
                  />
                  <path
                    d="M 780 230 L 840 230"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="4.5"
                    className={animateFlow ? 'flow-active-forward' : ''}
                    markerEnd="url(#arrow-power-emerald)"
                  />
                </>
              ) : bessIsDischarging ? (
                // Discharging: Battery Pack -> BiDir -> Bus
                <>
                  <path
                    d="M 840 230 L 780 230"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="4.5"
                    className={animateFlow ? 'flow-active-forward' : ''}
                    markerEnd="url(#arrow-power-emerald)"
                  />
                  <path
                    d="M 670 230 L 650 230 L 650 360"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="4.5"
                    className={animateFlow ? 'flow-active-forward' : ''}
                    markerEnd="url(#arrow-power-emerald)"
                  />
                </>
              ) : (
                // Idle BESS
                <path
                  d="M 650 360 L 650 230 L 840 230"
                  fill="none"
                  stroke="#334155"
                  strokeWidth="2"
                />
              )}

              {/* Branch 4: 48V Busbar -> PEM Electrolyzer Step-Down CC/CV */}
              <path
                d="M 330 400 L 330 470 L 230 470 L 230 500"
                fill="none"
                stroke={elecIsActive ? '#06b6d4' : '#334155'}
                strokeWidth={elecIsActive ? '4.2' : '2'}
                className={elecIsActive && animateFlow ? 'flow-active-forward' : ''}
                markerEnd="url(#arrow-power-cyan)"
              />
              {/* Step-down CC/CV DC-DC -> PEM Electrolyzer Stack */}
              <path
                d="M 190 560 L 190 590"
                fill="none"
                stroke={elecIsActive ? '#06b6d4' : '#334155'}
                strokeWidth={elecIsActive ? '4.5' : '2'}
                className={elecIsActive && animateFlow ? 'flow-active-forward' : ''}
                markerEnd="url(#arrow-power-cyan)"
              />

              {/* Branch 5: PEM Fuel Cell Stack -> Boost DC-DC */}
              {isFcEnabled ? (
                <>
                  <path
                    d="M 745 590 L 745 560"
                    fill="none"
                    stroke={fcIsActive ? '#a855f7' : '#334155'}
                    strokeWidth={fcIsActive ? '4.5' : '2'}
                    className={fcIsActive && animateFlow ? 'flow-active-forward' : ''}
                    markerEnd="url(#arrow-power-purple)"
                  />
                  {/* Boost DC-DC -> 48V Busbar */}
                  <path
                    d="M 750 500 L 750 470 L 800 470 L 800 400"
                    fill="none"
                    stroke={fcIsActive ? '#a855f7' : '#334155'}
                    strokeWidth={fcIsActive ? '4.5' : '2'}
                    className={fcIsActive && animateFlow ? 'flow-active-forward' : ''}
                    markerEnd="url(#arrow-power-purple)"
                  />
                </>
              ) : (
                <path
                  d="M 745 590 L 745 500 L 800 500 L 800 400"
                  fill="none"
                  stroke="#334155"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
              )}

              {/* ========================================================= */}
              {/* EXACT POWER READOUT BADGES: VOLT, AMP, WATT & DC/AC TAGS  */}
              {/* ========================================================= */}
              {/* PV Array to MPPT */}
              <g transform="translate(185, 195)">
                <rect width="70" height="30" rx="3" fill="#0c1322" stroke="#f59e0b" strokeWidth="1" />
                <text x="35" y="10" fill="#fef3c7" fontSize="7.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  PV STRING DC
                </text>
                <text x="35" y="19" fill="#fde68a" fontSize="8" fontFamily="monospace" textAnchor="middle">
                  {v_pv_array.toFixed(1)} V DC
                </text>
                <text x="35" y="27" fill="#fbbf24" fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  {i_pv_array} A | {p_pv_w} W
                </text>
              </g>

              {/* MPPT to Busbar */}
              <g transform="translate(385, 270)">
                <rect width="115" height="42" rx="4" fill="#0c1322" stroke="#f59e0b" strokeWidth="1.2" />
                <text x="57.5" y="11" fill="#fef3c7" fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  BRANCH 1: PV INFEED [DC]
                </text>
                <text x="57.5" y="22" fill="#fde68a" fontSize="9" fontFamily="monospace" textAnchor="middle">
                  VOLTS: {v_bus.toFixed(2)} V DC
                </text>
                <text x="57.5" y="31" fill="#fbbf24" fontSize="9" fontFamily="monospace" textAnchor="middle">
                  CURRENT: {i_pv_a.toFixed(1)} A DC
                </text>
                <text x="57.5" y="39" fill="#f59e0b" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  POWER: {p_pv_w} W DC
                </text>
              </g>

              {/* BESS to/from Busbar */}
              <g transform="translate(680, 260)">
                <rect
                  width="125"
                  height="44"
                  rx="4"
                  fill="#0c1322"
                  stroke={bessIsCharging ? '#10b981' : bessIsDischarging ? '#3b82f6' : '#64748b'}
                  strokeWidth="1.2"
                />
                <text
                  x="62.5"
                  y="11"
                  fill={bessIsCharging ? '#6ee7b7' : bessIsDischarging ? '#93c5fd' : '#94a3b8'}
                  fontSize="8"
                  fontWeight="bold"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  BRANCH 3: BESS {bessIsCharging ? '[DC CHARGE]' : bessIsDischarging ? '[DC DISCHARGE]' : '[DC IDLE]'}
                </text>
                <text x="62.5" y="22" fill="#cbd5e1" fontSize="9" fontFamily="monospace" textAnchor="middle">
                  VOLTS: {v_bus.toFixed(2)} V DC
                </text>
                <text x="62.5" y="32" fill="#cbd5e1" fontSize="9" fontFamily="monospace" textAnchor="middle">
                  CURRENT: {i_bess_abs_a.toFixed(1)} A DC
                </text>
                <text
                  x="62.5"
                  y="41"
                  fill={bessIsCharging ? '#34d399' : bessIsDischarging ? '#60a5fa' : '#94a3b8'}
                  fontSize="9.5"
                  fontWeight="bold"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  POWER: {bessIsCharging ? p_bess_chg_w : p_bess_dis_w} W DC
                </text>
              </g>

              {/* DC Load Branch */}
              <g transform="translate(1030, 290)">
                <rect width="115" height="42" rx="4" fill="#0c1322" stroke="#f43f5e" strokeWidth="1.2" />
                <text x="57.5" y="11" fill="#fecdd3" fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  BRANCH 2: LOAD [DC]
                </text>
                <text x="57.5" y="22" fill="#fda4af" fontSize="9" fontFamily="monospace" textAnchor="middle">
                  VOLTS: {v_bus.toFixed(2)} V DC
                </text>
                <text x="57.5" y="31" fill="#fda4af" fontSize="9" fontFamily="monospace" textAnchor="middle">
                  CURRENT: {i_load_a.toFixed(1)} A DC
                </text>
                <text x="57.5" y="39" fill="#f43f5e" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  POWER: {p_load_w} W DC
                </text>
              </g>

              {/* Electrolyzer Branch Bus Infeed */}
              <g transform="translate(240, 420)">
                <rect width="125" height="42" rx="4" fill="#0c1322" stroke="#06b6d4" strokeWidth="1.2" />
                <text x="62.5" y="11" fill="#cffafe" fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  BRANCH 4: ELEC INFEED [DC]
                </text>
                <text x="62.5" y="22" fill="#a5f3fc" fontSize="9" fontFamily="monospace" textAnchor="middle">
                  VOLTS: {v_bus.toFixed(2)} V DC
                </text>
                <text x="62.5" y="31" fill="#a5f3fc" fontSize="9" fontFamily="monospace" textAnchor="middle">
                  CURRENT: {i_elec_a.toFixed(1)} A DC
                </text>
                <text x="62.5" y="39" fill="#06b6d4" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  POWER: {p_elec_w} W DC
                </text>
              </g>

              {/* Electrolyzer Low-V Stack Side */}
              <g transform="translate(125, 555)">
                <rect width="130" height="26" rx="3" fill="#0a101d" stroke="#06b6d4" strokeWidth="0.8" />
                <text x="65" y="11" fill="#67e8f9" fontSize="8" fontFamily="monospace" textAnchor="middle">
                  STACK LOW-V BUS [DC]
                </text>
                <text x="65" y="21" fill="#22d3ee" fontSize="8.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  20.0V DC | {i_elec_stack_a}A DC | {p_elec_stack_w}W DC
                </text>
              </g>

              {/* Fuel Cell Branch Stack Side */}
              <g transform="translate(685, 555)">
                <rect width="130" height="26" rx="3" fill="#0a101d" stroke={isFcEnabled ? '#a855f7' : '#475569'} strokeWidth="0.8" />
                <text x="65" y="11" fill={isFcEnabled ? '#e9d5ff' : '#94a3b8'} fontSize="8" fontFamily="monospace" textAnchor="middle">
                  {isFcEnabled ? 'FC STACK OUTPUT [DC]' : 'FC STACK [DISABLED]'}
                </text>
                <text x="65" y="21" fill={isFcEnabled ? '#c084fc' : '#64748b'} fontSize="8.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  {isFcEnabled ? `28.0V DC | ${i_fc_stack_a}A DC | ${p_fc_stack_w}W DC` : '0.0V DC | 0.0A | 0W (P2G)'}
                </text>
              </g>

              {/* Fuel Cell Branch Bus Infeed */}
              <g transform="translate(810, 420)">
                <rect width="125" height="42" rx="4" fill="#0c1322" stroke={isFcEnabled ? '#a855f7' : '#475569'} strokeWidth="1.2" />
                <text x="62.5" y="11" fill={isFcEnabled ? '#f3e8ff' : '#94a3b8'} fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  {isFcEnabled ? 'BRANCH 5: FC INJECTION [DC]' : 'BRANCH 5: FC DISABLED [DC]'}
                </text>
                <text x="62.5" y="22" fill={isFcEnabled ? '#e9d5ff' : '#64748b'} fontSize="9" fontFamily="monospace" textAnchor="middle">
                  VOLTS: {v_bus.toFixed(2)} V DC
                </text>
                <text x="62.5" y="31" fill={isFcEnabled ? '#e9d5ff' : '#64748b'} fontSize="9" fontFamily="monospace" textAnchor="middle">
                  CURRENT: {isFcEnabled ? `${i_fc_a.toFixed(1)} A DC` : '0.0 A DC (ISOLATED)'}
                </text>
                <text x="62.5" y="39" fill={isFcEnabled ? '#a855f7' : '#64748b'} fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  POWER: {isFcEnabled ? `${p_fc_w} W DC` : '0 W DC (P2G MODE)'}
                </text>
              </g>
            </g>
          )}

          {/* ========================================================= */}
          {/* PHYSICAL EQUIPMENT NODES & SUBSYSTEM BLOCKS               */}
          {/* ========================================================= */}

          {/* NODE 1: SOLAR PV ARRAY */}
          <g id="node-pv-array" transform="translate(40, 160)">
            <rect
              width="140"
              height="140"
              rx="6"
              fill="url(#panelGrad)"
              stroke="#f59e0b"
              strokeWidth="1.5"
            />
            <rect x="0" y="0" width="140" height="24" rx="6" fill="#1e293b" />
            <text x="70" y="16" fill="#fbbf24" fontSize="10" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              SOLAR PV ARRAY
            </text>
            <Sun className="text-amber-400" x="10" y="32" width="16" height="16" />
            <text x="32" y="44" fill="#fef3c7" fontSize="9.5" fontFamily="monospace">
              STC: {params.pv_peak_kw.toFixed(1)} kWp
            </text>
            <text x="12" y="66" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
              G(t): {Math.round(activeStep.g_irr_wm2)} W/m²
            </text>
            <text x="12" y="82" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
              T_cell: {activeStep.t_cell_c.toFixed(1)} °C
            </text>
            <text x="12" y="98" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
              T_amb: {activeStep.t_amb_c.toFixed(1)} °C
            </text>
            <text x="12" y="114" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
              v_wind: {activeStep.v_wind_ms.toFixed(1)} m/s
            </text>
            <rect x="10" y="122" width="120" height="12" rx="2" fill="#451a03" />
            <text x="70" y="131" fill="#fcd34d" fontSize="7.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              DC ARRAY VOLTAGE ~98V DC
            </text>
          </g>

          {/* NODE 2: MPPT DC-DC CONVERTER */}
          <g id="node-mppt" transform="translate(260, 180)">
            <rect
              width="110"
              height="100"
              rx="5"
              fill="#0f172a"
              stroke="#f59e0b"
              strokeWidth="1.5"
            />
            <rect x="0" y="0" width="110" height="22" rx="5" fill="#1e293b" />
            <text x="55" y="15" fill="#fcd34d" fontSize="9.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              MPPT DC-DC
            </text>
            <text x="10" y="42" fill="#cbd5e1" fontSize="9" fontFamily="monospace">
              Rating: {params.mppt_max_kw.toFixed(1)} kW
            </text>
            <text x="10" y="58" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
              Eff: {(params.eta_mppt * 100).toFixed(0)}%
            </text>
            <text x="10" y="74" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
              Mode: Sync Buck
            </text>
            <text x="10" y="90" fill="#f59e0b" fontSize="8.5" fontWeight="bold" fontFamily="monospace">
              Status: {p_pv_w > 0 ? 'TRACKING' : 'IDLE'}
            </text>
          </g>

          {/* ========================================================= */}
          {/* THE COMMON 48V DC BUSBAR SYSTEM (+ / - COPPER BARS)       */}
          {/* ========================================================= */}
          <g id="node-dc-busbar" transform="translate(280, 360)">
            {/* Busbar shadow/glow */}
            <rect
              x="0"
              y="0"
              width="740"
              height="40"
              rx="6"
              fill="url(#busbarGrad)"
              stroke="#fbbf24"
              strokeWidth="2"
              className="drop-shadow-lg"
            />
            {/* Busbar internal details */}
            <line x1="10" y1="20" x2="730" y2="20" stroke="#713f12" strokeWidth="1" strokeDasharray="6 3" />
            <text x="370" y="17" fill="#451a03" fontSize="12" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              COMMON 48 V DC BUSBAR SYSTEM (48.0 V to 56.8 V DC)
            </text>
            <text x="370" y="32" fill="#713f12" fontSize="11" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              V_BUS: {v_bus.toFixed(2)} V DC | KCL RESIDUAL: {activeStep.kcl_residual_a.toFixed(3)} A
            </text>

            {/* Tap Point Terminals on Busbar */}
            {/* Tap 1: PV Infeed */}
            <circle cx="170" cy="20" r="5" fill="#f59e0b" stroke="#78350f" strokeWidth="2" />
            <text x="170" y="-8" fill="#fef3c7" fontSize="8.5" fontFamily="monospace" textAnchor="middle">
              T1: PV (+)
            </text>

            {/* Tap 2: Electrolyzer Tap */}
            <circle cx="50" cy="20" r="5" fill="#06b6d4" stroke="#083344" strokeWidth="2" />
            <text x="50" y="52" fill="#cffafe" fontSize="8.5" fontFamily="monospace" textAnchor="middle">
              T4: ELEC (-)
            </text>

            {/* Tap 3: BESS BiDir Tap */}
            <circle cx="370" cy="20" r="5" fill="#10b981" stroke="#064e3b" strokeWidth="2" />
            <text x="370" y="-8" fill="#d1fae5" fontSize="8.5" fontFamily="monospace" textAnchor="middle">
              T3: BESS (+/-)
            </text>

            {/* Tap 4: Fuel Cell Injection Tap */}
            <circle cx="520" cy="20" r="5" fill="#a855f7" stroke="#3b0764" strokeWidth="2" />
            <text x="520" y="52" fill="#f3e8ff" fontSize="8.5" fontFamily="monospace" textAnchor="middle">
              T5: FC (+)
            </text>

            {/* Tap 5: DC Load Tap */}
            <circle cx="720" cy="20" r="5" fill="#f43f5e" stroke="#881337" strokeWidth="2" />
            <text x="720" y="52" fill="#ffe4e6" fontSize="8.5" fontFamily="monospace" textAnchor="middle">
              T2: LOAD (-)
            </text>
          </g>

          {/* NODE 3: BESS BIDIRECTIONAL DC-DC & 16S LIFEPO4 PACK */}
          <g id="node-bess-subsystem" transform="translate(670, 160)">
            {/* Bidirectional DC-DC Converter */}
            <rect width="110" height="140" rx="5" fill="#0f172a" stroke="#10b981" strokeWidth="1.5" />
            <rect x="0" y="0" width="110" height="22" rx="5" fill="#1e293b" />
            <text x="55" y="15" fill="#6ee7b7" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              BiDir DC-DC
            </text>
            <text x="10" y="42" fill="#cbd5e1" fontSize="8.5" fontFamily="monospace">
              Chg Max: {params.bess_chg_max_kw.toFixed(1)} kW
            </text>
            <text x="10" y="58" fill="#cbd5e1" fontSize="8.5" fontFamily="monospace">
              Dis Max: {params.bess_dis_max_kw.toFixed(1)} kW
            </text>
            <text x="10" y="74" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
              Eff: {(params.eta_bess_chg * 100).toFixed(0)}%
            </text>
            <text x="10" y="90" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
              R_int: {params.bess_r_internal_mohm} mΩ
            </text>
            <text
              x="55"
              y="114"
              fill={bessIsCharging ? '#34d399' : bessIsDischarging ? '#60a5fa' : '#94a3b8'}
              fontSize="9"
              fontWeight="bold"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {bessIsCharging ? 'CHARGING' : bessIsDischarging ? 'DISCHARGING' : 'IDLE'}
            </text>
            <rect
              x="8"
              y="122"
              width="94"
              height="12"
              rx="2"
              fill={bessIsCharging ? '#064e3b' : bessIsDischarging ? '#1e3a8a' : '#334155'}
            />
            <text
              x="55"
              y="131"
              fill="#ffffff"
              fontSize="7.5"
              fontWeight="bold"
              fontFamily="monospace"
              textAnchor="middle"
            >
              BUCK-BOOST DC
            </text>

            {/* 16S LiFePO4 Battery Pack Node */}
            <g transform="translate(170, 0)">
              <rect width="130" height="140" rx="6" fill="#0c1322" stroke="#10b981" strokeWidth="1.8" />
              <rect x="0" y="0" width="130" height="24" rx="6" fill="#1e293b" />
              <text x="65" y="16" fill="#34d399" fontSize="10" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                16S LiFePO4 BESS
              </text>
              <Battery className="text-emerald-400" x="10" y="32" width="16" height="16" />
              <text x="32" y="44" fill="#d1fae5" fontSize="9.5" fontWeight="bold" fontFamily="monospace">
                {(activeStep.soc * 100).toFixed(1)}% SoC
              </text>
              <text x="10" y="66" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
                Capacity: {params.bess_cap_kwh.toFixed(1)} kWh
              </text>
              <text x="10" y="82" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
                Energy: {activeStep.e_bess_kwh.toFixed(2)} kWh
              </text>
              <text x="10" y="98" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
                OCV: {v_bess_ocv.toFixed(2)} V DC
              </text>
              <text x="10" y="114" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
                BMS: Active Bal.
              </text>
              <rect x="10" y="122" width="110" height="12" rx="2" fill="#064e3b" />
              <text x="65" y="131" fill="#a7f3d0" fontSize="7.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                51.2V NOMINAL DC
              </text>
            </g>
          </g>

          {/* NODE 4: PROGRAMMABLE DC LOAD */}
          <g id="node-dc-load" transform="translate(1040, 160)">
            <rect width="130" height="140" rx="6" fill="#0f172a" stroke="#f43f5e" strokeWidth="1.5" />
            <rect x="0" y="0" width="130" height="24" rx="6" fill="#1e293b" />
            <text x="65" y="16" fill="#fda4af" fontSize="10" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              PROGRAMMABLE LOAD
            </text>
            <Zap className="text-rose-400" x="10" y="32" width="16" height="16" />
            <text x="32" y="44" fill="#ffe4e6" fontSize="9.5" fontWeight="bold" fontFamily="monospace">
              {activeStep.p_load_kw.toFixed(2)} kW DC
            </text>
            <text x="10" y="66" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
              Branch V: {v_bus.toFixed(1)} V DC
            </text>
            <text x="10" y="82" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
              Current: {i_load_a.toFixed(1)} A DC
            </text>
            <text x="10" y="98" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
              Duty: Community
            </text>
            <text x="10" y="114" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
              Deficit: {activeStep.p_unserved_kw.toFixed(2)} kW
            </text>
            <rect x="10" y="122" width="110" height="12" rx="2" fill="#4c0519" />
            <text x="65" y="131" fill="#fecdd3" fontSize="7.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              48V DC BUS INFEED
            </text>
          </g>

          {/* NODE 5: CENTRAL DAQ & SUPERVISORY CONTROLLER */}
          <g id="node-daq-controller" transform="translate(520, 50)">
            <rect width="160" height="85" rx="6" fill="#131d31" stroke="#a855f7" strokeWidth="1.5" />
            <rect x="0" y="0" width="160" height="20" rx="6" fill="#1e1b4b" />
            <text x="80" y="14" fill="#c084fc" fontSize="9.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              CENTRAL DAQ & CONTROLLER
            </text>
            <Cpu className="text-purple-400" x="8" y="26" width="14" height="14" />
            <text x="26" y="37" fill="#e9d5ff" fontSize="9" fontWeight="bold" fontFamily="monospace">
              State: {activeStep.state}
            </text>
            <text x="8" y="53" fill="#cbd5e1" fontSize="8" fontFamily="monospace">
              Dispatch: 4-State Hysteresis
            </text>
            <text x="8" y="66" fill="#94a3b8" fontSize="8" fontFamily="monospace">
              Buses: CAN 2.0B / Modbus RTU
            </text>
            <text x="8" y="78" fill="#a855f7" fontSize="8" fontWeight="bold" fontFamily="monospace">
              KCL Status: BALANCED
            </text>
          </g>

          {/* NODE 6: PEM WATER ELECTROLYZER SUBSYSTEM */}
          {/* DI Water Storage Tank */}
          <g id="node-di-water-tank" transform="translate(10, 590)">
            <rect width="70" height="110" rx="4" fill="#0f172a" stroke="#3b82f6" strokeWidth="1.2" />
            <rect x="0" y="0" width="70" height="20" rx="4" fill="#1e3a8a" />
            <text x="35" y="14" fill="#bfdbfe" fontSize="8.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              DI TANK
            </text>
            <Droplets className="text-blue-400" x="27" y="30" width="16" height="16" />
            <text x="35" y="62" fill="#93c5fd" fontSize="8" fontFamily="monospace" textAnchor="middle">
              11 L / kg H₂
            </text>
            <text x="35" y="78" fill="#94a3b8" fontSize="7.5" fontFamily="monospace" textAnchor="middle">
              Resin Bed
            </text>
            <text x="35" y="94" fill="#94a3b8" fontSize="7.5" fontFamily="monospace" textAnchor="middle">
              Polish loop
            </text>
          </g>

          {/* Step-Down CC/CV DC-DC Converter */}
          <g id="node-elec-dcdc" transform="translate(140, 500)">
            <rect width="100" height="60" rx="4" fill="#0f172a" stroke="#06b6d4" strokeWidth="1.2" />
            <rect x="0" y="0" width="100" height="18" rx="4" fill="#083344" />
            <text x="50" y="13" fill="#67e8f9" fontSize="8.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              CC/CV DC-DC
            </text>
            <text x="8" y="32" fill="#cbd5e1" fontSize="8" fontFamily="monospace">
              48V DC → 20V DC
            </text>
            <text x="8" y="44" fill="#94a3b8" fontSize="8" fontFamily="monospace">
              Eff: {(params.eta_elec_dcdc * 100).toFixed(0)}%
            </text>
            <text x="8" y="55" fill="#06b6d4" fontSize="8" fontWeight="bold" fontFamily="monospace">
              {elecIsActive ? 'CONVERTING' : 'STANDBY'}
            </text>
          </g>

          {/* Low-Voltage PEM Electrolyzer Stack */}
          <g id="node-pem-electrolyzer" transform="translate(130, 590)">
            <rect width="130" height="120" rx="6" fill="#0f172a" stroke="#06b6d4" strokeWidth="1.8" />
            <rect x="0" y="0" width="130" height="22" rx="6" fill="#083344" />
            <text x="65" y="15" fill="#67e8f9" fontSize="9.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              PEM ELECTROLYZER
            </text>
            <Flame className="text-cyan-400" x="10" y="30" width="16" height="16" />
            <text x="30" y="42" fill="#cffafe" fontSize="9" fontWeight="bold" fontFamily="monospace">
              Rating: {params.elec_rated_kw.toFixed(1)} kW
            </text>
            <text x="10" y="62" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
              SEC: {params.sec_elec_kwh_per_kg} kWh/kg
            </text>
            <text x="10" y="78" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
              Turndown: {(params.elec_k_turndown * 100).toFixed(0)}%
            </text>
            <text x="10" y="94" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
              V_stack: 20.0 V DC
            </text>
            <rect x="8" y="102" width="114" height="12" rx="2" fill="#083344" />
            <text
              x="65"
              y="111"
              fill={elecIsActive ? '#22d3ee' : '#64748b'}
              fontSize="7.5"
              fontWeight="bold"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {elecIsActive ? 'ACTIVE H₂ PROD' : 'TURNDOWN OFF'}
            </text>
          </g>

          {/* NODE 7: PRESSURIZED HYDROGEN STORAGE TANK */}
          <g id="node-h2-tank" transform="translate(360, 560)">
            <rect width="115" height="150" rx="8" fill="#0c1322" stroke="#38bdf8" strokeWidth="1.8" />
            <rect x="0" y="0" width="115" height="24" rx="8" fill="#0369a1" />
            <text x="57.5" y="16" fill="#f0f9ff" fontSize="9.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              H₂ STORAGE TANK
            </text>
            <Gauge className="text-sky-300" x="8" y="32" width="16" height="16" />
            <text x="28" y="44" fill="#bae6fd" fontSize="9.5" fontWeight="bold" fontFamily="monospace">
              {activeStep.p_tank_bar.toFixed(1)} bar
            </text>
            <text x="8" y="66" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
              Mass: {activeStep.m_h2_tank_kg.toFixed(3)} kg
            </text>
            <text x="8" y="82" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
              Vol: {Math.round(params.tank_volume_m3 * 1000)} Liters
            </text>
            <text x="8" y="98" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
              P_max: {params.tank_p_max_bar} bar
            </text>
            <text x="8" y="114" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
              Real Gas Z: ~1.02
            </text>
            <rect x="8" y="126" width="99" height="16" rx="3" fill="#082f49" />
            <text x="57.5" y="137" fill="#7dd3fc" fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              CYLINDER STORE
            </text>
          </g>

          {/* NODE 7b: ATMOSPHERIC TEDLAR GAS BAGS (EXCESS H2 STORAGE) */}
          <g id="node-tedlar-bags" transform="translate(490, 560)">
            <rect
              width="125"
              height="150"
              rx="8"
              fill="#081528"
              stroke={isTedlarEnabled ? (tedlarIsReceiving ? '#38bdf8' : '#0284c7') : '#334155'}
              strokeWidth="1.8"
              strokeDasharray={isTedlarEnabled ? undefined : '4 4'}
            />
            <rect x="0" y="0" width="125" height="24" rx="8" fill={isTedlarEnabled ? '#075985' : '#1e293b'} />
            <text
              x="62.5"
              y="16"
              fill={isTedlarEnabled ? '#e0f2fe' : '#94a3b8'}
              fontSize="9"
              fontWeight="bold"
              fontFamily="monospace"
              textAnchor="middle"
            >
              TEDLAR BAGS (1 ATM)
            </text>
            <text
              x="62.5"
              y="40"
              fill={isTedlarEnabled ? '#38bdf8' : '#64748b'}
              fontSize="11"
              fontWeight="bold"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {tedlarVolumeL} Liters
            </text>
            <text
              x="62.5"
              y="55"
              fill={isTedlarEnabled ? '#7dd3fc' : '#64748b'}
              fontSize="9"
              fontWeight="bold"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {tedlarBagsCount} × {tedlarChunkSize}L Chunks
            </text>
            <text x="10" y="74" fill="#94a3b8" fontSize="8" fontFamily="monospace">
              Pressure: 1.013 bar
            </text>
            <text x="10" y="89" fill="#94a3b8" fontSize="8" fontFamily="monospace">
              Mass: {((activeStep.m_h2_tedlar_kg || 0) * 1000).toFixed(1)} g H₂
            </text>
            <text x="10" y="104" fill="#94a3b8" fontSize="8" fontFamily="monospace">
              Material: PVF Tedlar
            </text>
            <text x="10" y="119" fill="#94a3b8" fontSize="8" fontFamily="monospace">
              Atmospheric Buffer
            </text>
            <rect x="8" y="128" width="109" height="15" rx="3" fill={isTedlarEnabled ? '#0c4a6e' : '#1e293b'} />
            <text
              x="62.5"
              y="139"
              fill={isTedlarEnabled ? (tedlarIsReceiving ? '#67e8f9' : '#bae6fd') : '#64748b'}
              fontSize="7.5"
              fontWeight="bold"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {isTedlarEnabled ? (tedlarIsReceiving ? 'RECEIVING EXCESS' : 'STANDBY BUFFER') : 'OPTIONAL: DISABLED'}
            </text>
          </g>

          {/* NODE 8: PEM FUEL CELL & BOOST DC-DC CONVERTER (OPTIONAL) */}
          {/* Pressure Regulator */}
          <g id="node-h2-regulator" transform="translate(635, 605)">
            <circle
              cx="15"
              cy="15"
              r="14"
              fill="#131d31"
              stroke={isFcEnabled ? '#38bdf8' : '#475569'}
              strokeWidth="1.2"
              strokeDasharray={isFcEnabled ? undefined : '2 2'}
            />
            <text
              x="15"
              y="18"
              fill={isFcEnabled ? '#38bdf8' : '#64748b'}
              fontSize="7.5"
              fontWeight="bold"
              fontFamily="monospace"
              textAnchor="middle"
            >
              REG
            </text>
            <text x="15" y="38" fill="#94a3b8" fontSize="7.5" fontFamily="monospace" textAnchor="middle">
              {isFcEnabled ? '1.5 bar' : 'CLOSED'}
            </text>
          </g>

          {/* PEM Fuel Cell Stack */}
          <g id="node-pem-fuel-cell" transform="translate(680, 590)">
            <rect
              width="130"
              height="120"
              rx="6"
              fill="#0f172a"
              stroke={isFcEnabled ? '#a855f7' : '#475569'}
              strokeWidth={isFcEnabled ? '1.8' : '1.2'}
              strokeDasharray={isFcEnabled ? undefined : '4 4'}
            />
            <rect x="0" y="0" width="130" height="22" rx="6" fill={isFcEnabled ? '#3b0764' : '#1e293b'} />
            <text
              x="65"
              y="15"
              fill={isFcEnabled ? '#e9d5ff' : '#94a3b8'}
              fontSize="9.5"
              fontWeight="bold"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {isFcEnabled ? 'PEM FUEL CELL' : 'FUEL CELL (OPTIONAL)'}
            </text>
            <Activity className={isFcEnabled ? 'text-purple-400' : 'text-slate-500'} x="10" y="30" width="16" height="16" />
            <text x="30" y="42" fill={isFcEnabled ? '#f3e8ff' : '#64748b'} fontSize="9" fontWeight="bold" fontFamily="monospace">
              {isFcEnabled ? `Rating: ${params.fc_rated_kw.toFixed(1)} kW` : 'NOT INSTALLED'}
            </text>
            <text x="10" y="62" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
              Opt Set: {isFcEnabled ? `${params.fc_opt_setpoint_kw.toFixed(1)} kW` : 'N/A (P2G)'}
            </text>
            <text x="10" y="78" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
              Eff: {(params.eta_fc_stack * 100).toFixed(0)}%
            </text>
            <text x="10" y="94" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
              V_fc: {isFcEnabled ? '28.0 V DC' : '0.0 V'}
            </text>
            <rect x="8" y="102" width="114" height="12" rx="2" fill={isFcEnabled ? '#3b0764' : '#1e293b'} />
            <text
              x="65"
              y="111"
              fill={isFcEnabled ? (fcIsActive ? '#d8b4fe' : '#64748b') : '#94a3b8'}
              fontSize="7.5"
              fontWeight="bold"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {isFcEnabled ? (fcIsActive ? 'ACTIVE BACKUP' : 'LATCH OFF') : 'P2G MODE (STANDALONE)'}
            </text>
          </g>

          {/* Step-Up Boost DC-DC Converter */}
          <g id="node-fc-boost-dcdc" transform="translate(700, 500)">
            <rect
              width="100"
              height="60"
              rx="4"
              fill="#0f172a"
              stroke={isFcEnabled ? '#a855f7' : '#475569'}
              strokeWidth={isFcEnabled ? '1.2' : '1'}
              strokeDasharray={isFcEnabled ? undefined : '3 3'}
            />
            <rect x="0" y="0" width="100" height="18" rx="4" fill={isFcEnabled ? '#3b0764' : '#1e293b'} />
            <text x="50" y="13" fill={isFcEnabled ? '#e9d5ff' : '#94a3b8'} fontSize="8.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              BOOST DC-DC
            </text>
            <text x="8" y="32" fill="#cbd5e1" fontSize="8" fontFamily="monospace">
              {isFcEnabled ? '28V DC → 48V DC' : 'ISOLATED'}
            </text>
            <text x="8" y="44" fill="#94a3b8" fontSize="8" fontFamily="monospace">
              Eff: {(params.eta_fc_dcdc * 100).toFixed(0)}%
            </text>
            <text x="8" y="55" fill={isFcEnabled ? '#a855f7' : '#64748b'} fontSize="8" fontWeight="bold" fontFamily="monospace">
              {isFcEnabled ? (fcIsActive ? 'BOOSTING' : 'STANDBY') : 'BRANCH 5 OPEN'}
            </text>
          </g>

          {/* Legend Strip at bottom right */}
          <g id="diagram-legend" transform="translate(860, 680)">
            <rect width="320" height="85" rx="5" fill="#0c1322" stroke="#334155" strokeWidth="1" />
            <text x="12" y="16" fill="#94a3b8" fontSize="9" fontWeight="bold" fontFamily="monospace">
              DIAGRAM NOTATION & FLOW LEGEND:
            </text>
            <circle cx="20" cy="30" r="4" fill="#f59e0b" />
            <text x="32" y="33" fill="#cbd5e1" fontSize="8" fontFamily="monospace">
              DC Power Lines (V, A, W with Directional Arrows)
            </text>
            <circle cx="20" cy="46" r="4" fill="#06b6d4" />
            <text x="32" y="49" fill="#cbd5e1" fontSize="8" fontFamily="monospace">
              Hydrogen Gas (H₂ g/h @ Pressure bar)
            </text>
            <circle cx="20" cy="62" r="4" fill="#3b82f6" />
            <text x="32" y="65" fill="#cbd5e1" fontSize="8" fontFamily="monospace">
              Deionized Water (DI H₂O L/h) & O₂ Vent
            </text>
            <line x1="16" y1="76" x2="26" y2="76" stroke="#c084fc" strokeWidth="2" strokeDasharray="2 2" />
            <text x="32" y="79" fill="#cbd5e1" fontSize="8" fontFamily="monospace">
              DAQ Telemetry & Control (Modbus / CAN bus)
            </text>
          </g>
        </svg>
      </div>

      {/* Diagram Footer Summary Bar: Kirchhoff's Law & Instantaneous Balance */}
      <div className="bg-[#0b1220] border-t border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-4 text-slate-300">
          <span>
            Bus Voltage: <strong className="text-yellow-400">{v_bus.toFixed(2)} V DC</strong>
          </span>
          <span className="text-slate-600">|</span>
          <span>
            PV Power: <strong className="text-amber-400">{p_pv_w} W DC</strong> ({i_pv_a.toFixed(1)} A)
          </span>
          <span className="text-slate-600">|</span>
          <span>
            Load Demand: <strong className="text-rose-400">{p_load_w} W DC</strong> ({i_load_a.toFixed(1)} A)
          </span>
          <span className="text-slate-600">|</span>
          <span>
            BESS Net: <strong className={bessIsCharging ? 'text-emerald-400' : bessIsDischarging ? 'text-blue-400' : 'text-slate-400'}>
              {bessIsCharging ? `+${p_bess_chg_w} W (Chg)` : bessIsDischarging ? `-${p_bess_dis_w} W (Dis)` : '0 W (Idle)'}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-[#121c2e] px-2 py-0.5 rounded border border-slate-700">
            <span className="text-slate-400 text-[10px]">KCL Residual:</span>
            <strong className="text-emerald-400 text-[11px]">
              {Math.abs(activeStep.kcl_residual_a) < 0.001 ? '0.000 A (PERFECT)' : `${activeStep.kcl_residual_a.toFixed(3)} A`}
            </strong>
          </div>

          <div className="flex items-center gap-1.5 bg-[#121c2e] px-2 py-0.5 rounded border border-slate-700">
            <span className="text-slate-400 text-[10px]">H₂ Tank:</span>
            <strong className="text-cyan-400 text-[11px]">
              {activeStep.m_h2_tank_kg.toFixed(3)} kg ({activeStep.p_tank_bar.toFixed(1)} bar)
            </strong>
          </div>

          {isTedlarEnabled && (
            <div className="flex items-center gap-1.5 bg-[#121c2e] px-2 py-0.5 rounded border border-sky-800">
              <span className="text-sky-400 text-[10px]">Tedlar:</span>
              <strong className="text-sky-300 text-[11px]">
                {tedlarVolumeL} L ({tedlarBagsCount} × {tedlarChunkSize}L)
              </strong>
            </div>
          )}

          <div className="flex items-center gap-1.5 bg-[#121c2e] px-2 py-0.5 rounded border border-slate-700">
            <span className="text-slate-400 text-[10px]">Fuel Cell:</span>
            <strong className={`text-[11px] ${isFcEnabled ? (fcIsActive ? 'text-purple-300' : 'text-slate-400') : 'text-amber-400'}`}>
              {isFcEnabled ? (fcIsActive ? `${p_fc_w} W DC` : 'STANDBY') : 'P2G MODE'}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
};
