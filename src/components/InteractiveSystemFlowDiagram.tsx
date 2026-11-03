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
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Sliders,
  Sun,
  Wind,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  SubsystemEditorDrawer,
  SubsystemId,
} from './SubsystemEditorDrawer';
import {
  adjustTankForPressure,
  calculateH2TankMaxCapacity,
  calculateH2TankPressure,
  calculateH2TankVolumeForMass,
  TANK_PRESSURE_PRESETS,
} from '../simulation/simulationEngine';

interface Props {
  currentStep: TimeSeriesOutputStep | null;
  allSteps: TimeSeriesOutputStep[];
  params: SystemParameters;
  onSelectStepIndex?: (index: number) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onChangeParams?: (params: SystemParameters) => void;
  onScaleLoad?: (multiplier: number) => void;
}

export const InteractiveSystemFlowDiagram: React.FC<Props> = ({
  currentStep,
  allSteps,
  params,
  onSelectStepIndex,
  isFullscreen,
  onToggleFullscreen,
  onChangeParams,
  onScaleLoad,
}) => {
  // Layer visibility toggles
  const [showPowerFlow, setShowPowerFlow] = useState<boolean>(true);
  const [showMaterialFlow, setShowMaterialFlow] = useState<boolean>(true);
  const [showDataSignals, setShowDataSignals] = useState<boolean>(true);
  const [animateFlow, setAnimateFlow] = useState<boolean>(true);

  // Subsystem click-to-edit drawer state
  const [selectedSubsystem, setSelectedSubsystem] = useState<SubsystemId | null>(null);

  // Tablet zoom state
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);

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
        No simulation data available. Load a dataset or preset to view live flow.
      </div>
    );
  }

  // Active step electrical quantities
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

  // Curtailed power & current
  const p_curtailed_w = Math.round(activeStep.p_curtailed_kw * 1000);
  const i_curtailed_a = activeStep.i_curtailed_a;
  const isTankFull = activeStep.p_tank_bar >= params.tank_p_max_bar;

  // Material Flow variables (rates per hour, dt = 0.25h)
  const dt_h = 0.25;
  const h2_prod_rate_gh = ((activeStep.m_h2_prod_kg * 1000) / dt_h).toFixed(1);
  const di_water_rate_lh = (activeStep.v_di_water_l / dt_h).toFixed(2);
  const o2_vent_rate_nm3h = (activeStep.v_o2_nm3 / dt_h).toFixed(2);
  const h2_cons_rate_gh = ((activeStep.m_h2_cons_kg * 1000) / dt_h).toFixed(1);

  // Array STC operating voltage estimate
  const v_pv_array = activeStep.p_pv_bus_kw > 0 ? 98.4 : 0.0;
  const i_pv_array = activeStep.p_pv_bus_kw > 0 ? (p_pv_w / v_pv_array).toFixed(1) : '0.0';

  // Tank metrics & real gas Z factor
  const isFcEnabled = params.fc_enabled !== false;
  const tankVolL = Math.round(params.tank_volume_m3 * 1000);
  const maxStorageKg = calculateH2TankMaxCapacity(params.tank_p_max_bar, params.tank_volume_m3, activeStep.t_amb_c);
  const realGasZ = 1.0 + 0.0006 * params.tank_p_max_bar;

  const handleUpdateParam = (key: keyof SystemParameters, value: any) => {
    if (onChangeParams) {
      onChangeParams({
        ...params,
        [key]: value,
      });
    }
  };

  return (
    <div className="relative flex flex-col h-full w-full bg-[#070c16] text-slate-200 select-none overflow-hidden rounded border border-slate-800">
      {/* ========================================================= */}
      {/* TOP LIVE FLOW TOOLBAR: PLAYBACK + LIVE SCALING CONTROLS    */}
      {/* ========================================================= */}
      <div className="bg-[#0b1220] border-b border-slate-800 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* Playback Controls & Time Stamp */}
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
              title={isPlaying ? 'Pause Simulation' : 'Auto-Play Simulation'}
              className={`px-2 py-0.5 rounded font-bold transition flex items-center gap-1 text-[11px] ${
                isPlaying
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-cyan-700 hover:bg-cyan-600 text-white'
              }`}
            >
              {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
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
          <div className="flex items-center gap-2 bg-[#101726] px-2 py-1 rounded border border-slate-700/80">
            <span className="text-[11px] font-mono text-cyan-300 font-bold whitespace-nowrap">
              {activeStep.timestamp}
            </span>
            <input
              type="range"
              min="0"
              max={Math.max(0, allSteps.length - 1)}
              value={activeIndex}
              onChange={(e) => {
                if (onSelectStepIndex) {
                  onSelectStepIndex(parseInt(e.target.value, 10));
                }
              }}
              className="w-20 sm:w-28 md:w-36 accent-cyan-400 cursor-pointer"
            />
            <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
              Step {activeStep.step}/{allSteps.length}
            </span>
            <span
              className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold ${
                p_pv_w > 0
                  ? 'bg-amber-950/80 text-amber-300 border border-amber-600/50'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {p_pv_w > 0 ? `☀️ Day (${p_pv_w}W)` : '🌙 Night'}
            </span>
          </div>

          {/* Quick Jump to Midday Solar Peak (12:00) */}
          <button
            onClick={() => {
              if (onSelectStepIndex && allSteps.length > 0) {
                let bestIdx = 0;
                let maxPv = -1;
                allSteps.forEach((s, idx) => {
                  if (s.p_pv_bus_kw > maxPv) {
                    maxPv = s.p_pv_bus_kw;
                    bestIdx = idx;
                  }
                });
                if (maxPv <= 0) {
                  bestIdx = allSteps.findIndex((s) => s.hour >= 12.0) || 48;
                }
                onSelectStepIndex(Math.max(0, bestIdx));
              }
            }}
            className="flex items-center gap-1 px-2 py-1 rounded bg-[#16253d] hover:bg-amber-950/80 text-amber-300 border border-amber-600/50 text-[10px] font-mono font-bold transition shadow"
            title="Jump directly to solar peak (midday) to view solar surplus flowing into PEM electrolyzer"
          >
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Midday Peak</span>
          </button>

          {/* Playback speed toggle */}
          <button
            onClick={() => {
              setPlaybackSpeed((prev) => (prev === 1 ? 2 : prev === 2 ? 4 : prev === 4 ? 8 : 1));
            }}
            className="hidden md:inline px-1.5 py-0.5 rounded bg-[#131d31] hover:bg-slate-700 text-[10px] font-mono text-cyan-400 border border-slate-700 transition"
            title="Toggle playback speed"
          >
            {playbackSpeed}x
          </button>
        </div>

        {/* Live Parameter Quick-Scale Ribbon (Directly in Live Flow) */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tank Pressure Selector */}
          <div className="flex items-center gap-1 bg-[#131d31] px-2 py-0.5 rounded border border-sky-800/80 text-[11px]">
            <Gauge className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-slate-400 text-[10px] hidden sm:inline">Pressure:</span>
            <select
              value={params.tank_p_max_bar}
              onChange={(e) => {
                const newP = parseFloat(e.target.value) || 30;
                const updates = adjustTankForPressure(newP, params);
                if (onChangeParams) {
                  onChangeParams({
                    ...params,
                    ...updates,
                  });
                }
              }}
              className="bg-[#0b1322] border border-sky-900 rounded px-1.5 py-0.5 text-[10px] text-sky-300 font-bold"
            >
              <option value={1}>1 bar (Atmos)</option>
              <option value={10}>10 bar (Buffer)</option>
              <option value={30}>30 bar (PEM)</option>
              <option value={200}>200 bar (Quad)</option>
              <option value={350}>350 bar (Type IV)</option>
              <option value={700}>700 bar (Mobility)</option>
            </select>
            <span className="text-[10px] text-cyan-300 font-mono font-bold hidden xl:inline">
              {tankVolL}L
            </span>
          </div>

          {/* Fuel Cell Toggle */}
          <button
            onClick={() => handleUpdateParam('fc_enabled', params.fc_enabled === false)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition flex items-center gap-1 border ${
              params.fc_enabled !== false
                ? 'bg-purple-950/80 text-purple-300 border-purple-600'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
            title="Toggle PEM Fuel Cell Range-Extender Subsystem"
          >
            <Flame className="w-3 h-3 text-purple-400" />
            <span>FC: {params.fc_enabled !== false ? 'ON' : 'OFF'}</span>
          </button>

          {/* Tablet Zoom Controls */}
          <div className="flex items-center bg-[#131d31] rounded border border-slate-700 p-0.5 text-[11px]">
            <button
              onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.15))}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 transition"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoomLevel(1.0)}
              className="px-1.5 py-0.5 text-[10px] text-slate-300 font-mono hover:bg-slate-700 rounded transition"
              title="Reset Zoom to 100%"
            >
              {Math.round(zoomLevel * 100)}%
            </button>
            <button
              onClick={() => setZoomLevel((z) => Math.min(1.8, z + 0.15))}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 transition"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Hint badge: Click to edit */}
          <button
            onClick={() => setSelectedSubsystem(selectedSubsystem ? null : 'tank')}
            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono flex items-center gap-1 transition ${
              selectedSubsystem
                ? 'bg-cyan-600 text-white shadow'
                : 'bg-cyan-950/80 text-cyan-300 border border-cyan-800 hover:bg-cyan-900/60'
            }`}
            title="Click any subsystem in diagram to edit"
          >
            <Sliders className="w-3 h-3" />
            <span className="hidden sm:inline">
              {selectedSubsystem ? 'Subsystem Inspector Active' : 'Click Block to Edit'}
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* MAIN SVG SCHEMATIC CANVAS STAGE (SCROLLABLE & ZOOMABLE)    */}
      {/* ========================================================= */}
      <div className="flex-1 w-full h-full relative overflow-auto bg-[#060a12] p-2 flex items-center justify-center">
        <div
          style={{
            transform: `scale(${zoomLevel})`,
            transformOrigin: 'center center',
            transition: 'transform 0.12s ease-out',
            width: '100%',
            maxWidth: '1240px',
          }}
          className="flex items-center justify-center select-none"
        >
          <svg
            viewBox="0 0 1200 780"
            className="w-full h-auto max-h-[760px] drop-shadow-md select-none"
            preserveAspectRatio="xMidYMid meet"
            style={{ touchAction: 'pan-x pan-y pinch-zoom' }}
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
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#06b6d4" />
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
            {/* LAYER 3: DATA & COMMUNICATION SIGNALS                     */}
            {/* ========================================================= */}
            {showDataSignals && (
              <g id="layer-comms-signals" stroke="#a855f7" strokeWidth="1.2" opacity="0.65">
                {/* DAQ to Weather Station */}
                <path
                  d="M 600 70 L 150 70 L 150 140"
                  fill="none"
                  strokeDasharray="4 4"
                  className={animateFlow ? 'flow-active-data' : ''}
                  markerEnd="url(#arrow-signal-purple)"
                />
                {/* DAQ to MPPT */}
                <path
                  d="M 600 95 L 340 95 L 340 180"
                  fill="none"
                  strokeDasharray="4 4"
                  className={animateFlow ? 'flow-active-data' : ''}
                  markerEnd="url(#arrow-signal-purple)"
                />
                {/* DAQ to BMS (BESS) */}
                <path
                  d="M 600 105 L 700 105 L 700 160"
                  fill="none"
                  strokeDasharray="4 4"
                  className={animateFlow ? 'flow-active-data' : ''}
                  markerEnd="url(#arrow-signal-purple)"
                />
                {/* DAQ to Electrolyzer Controller */}
                <path
                  d="M 540 105 L 240 105 L 240 485"
                  fill="none"
                  strokeDasharray="4 4"
                  className={animateFlow ? 'flow-active-data' : ''}
                  markerEnd="url(#arrow-signal-purple)"
                />
                {/* DAQ to H2 Tank Pressure Transducer */}
                <path
                  d="M 580 105 L 530 105 L 530 530"
                  fill="none"
                  strokeDasharray="4 4"
                  className={animateFlow ? 'flow-active-data' : ''}
                  markerEnd="url(#arrow-signal-purple)"
                />
                {/* DAQ to Fuel Cell ECU */}
                <path
                  d="M 650 105 L 870 105 L 870 485"
                  fill="none"
                  strokeDasharray="4 4"
                  className={animateFlow ? 'flow-active-data' : ''}
                  markerEnd="url(#arrow-signal-purple)"
                />
                {/* DAQ to DC Load Shunt */}
                <path
                  d="M 680 85 L 1105 85 L 1105 160"
                  fill="none"
                  strokeDasharray="4 4"
                  className={animateFlow ? 'flow-active-data' : ''}
                  markerEnd="url(#arrow-signal-purple)"
                />

                {/* Comms Bus Protocol Text */}
                <text x="160" y="85" fill="#c084fc" fontSize="8.5" fontFamily="monospace">
                  4-20mA Weather
                </text>
                <text x="350" y="90" fill="#c084fc" fontSize="8.5" fontFamily="monospace">
                  Modbus-RTU MPPT
                </text>
                <text x="710" y="100" fill="#c084fc" fontSize="8.5" fontFamily="monospace">
                  CAN 2.0B BMS
                </text>
                <text x="250" y="470" fill="#c084fc" fontSize="8.5" fontFamily="monospace">
                  Modbus-RTU Elec
                </text>
                <text x="540" y="470" fill="#c084fc" fontSize="8.5" fontFamily="monospace">
                  4-20mA Pressure
                </text>
                <text x="880" y="470" fill="#c084fc" fontSize="8.5" fontFamily="monospace">
                  CAN 2.0B FC ECU
                </text>
                <text x="970" y="80" fill="#c084fc" fontSize="8.5" fontFamily="monospace">
                  Modbus DC Load
                </text>
              </g>
            )}

            {/* ========================================================= */}
            {/* LAYER 2: MATERIAL FLOW LINES (FLUIDS: H2, DI WATER, O2)   */}
            {/* ========================================================= */}
            {showMaterialFlow && (
              <g id="layer-material-flow">
                {/* DI Water Pipe: Tank (x=120) -> Electrolyzer (x=170) */}
                <path
                  d="M 120 635 L 170 635"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="3.5"
                  className={elecIsActive && animateFlow ? 'flow-active-fluid' : ''}
                  markerEnd="url(#arrow-fluid-blue)"
                />
                {/* Oxygen Safe Vent: Electrolyzer -> Exhaust Down */}
                <path
                  d="M 240 695 L 240 745"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                  strokeDasharray="4 3"
                  className={elecIsActive && animateFlow ? 'flow-active-fluid' : ''}
                  markerEnd="url(#arrow-fluid-cyan)"
                />
                {/* Hydrogen Production: Electrolyzer (x=310) -> H2 Tank (x=440) */}
                <path
                  d="M 310 635 L 440 635"
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="3.8"
                  className={elecIsActive && animateFlow ? 'flow-active-fluid' : ''}
                  markerEnd="url(#arrow-fluid-cyan)"
                />

                {/* Hydrogen Fuel Supply: H2 Tank (x=620) -> Regulator (x=730) -> Fuel Cell (x=800) */}
                {isFcEnabled ? (
                  <>
                    <path
                      d="M 620 635 L 730 635"
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="3.5"
                      className={fcIsActive && animateFlow ? 'flow-active-fluid' : ''}
                      markerEnd="url(#arrow-fluid-cyan)"
                    />
                    <path
                      d="M 760 635 L 800 635"
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="3.5"
                      className={fcIsActive && animateFlow ? 'flow-active-fluid' : ''}
                      markerEnd="url(#arrow-fluid-cyan)"
                    />
                  </>
                ) : (
                  <path
                    d="M 620 635 L 800 635"
                    fill="none"
                    stroke="#334155"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                  />
                )}

                {/* Exhaust Vapor from FC Down */}
                <path
                  d="M 870 695 L 870 745"
                  fill="none"
                  stroke="#60a5fa"
                  strokeWidth="2.5"
                  strokeDasharray="4 3"
                  className={fcIsActive && animateFlow ? 'flow-active-fluid' : ''}
                  markerEnd="url(#arrow-fluid-blue)"
                />

                {/* Material Flow Badges (Cleanly Spaced) */}
                {/* DI Water Badge */}
                <g transform="translate(125, 595)">
                  <rect width="75" height="24" rx="3" fill="#0f172a" stroke="#3b82f6" strokeWidth="1" />
                  <text x="37.5" y="10" fill="#93c5fd" fontSize="8" fontFamily="monospace" textAnchor="middle">
                    DI WATER
                  </text>
                  <text x="37.5" y="20" fill="#60a5fa" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                    {di_water_rate_lh} L/h
                  </text>
                </g>

                {/* H2 Production Badge */}
                <g transform="translate(325, 595)">
                  <rect width="95" height="26" rx="4" fill="#0f172a" stroke="#06b6d4" strokeWidth="1" />
                  <text x="47.5" y="11" fill="#67e8f9" fontSize="8" fontFamily="monospace" textAnchor="middle">
                    H₂ GEN RATE
                  </text>
                  <text x="47.5" y="21" fill="#22d3ee" fontSize="9.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                    {h2_prod_rate_gh} g/h H₂
                  </text>
                </g>

                {/* O2 Vent Badge */}
                <g transform="translate(195, 748)">
                  <rect width="90" height="20" rx="3" fill="#0f172a" stroke="#38bdf8" strokeWidth="0.8" />
                  <text x="45" y="13" fill="#7dd3fc" fontSize="8" fontFamily="monospace" textAnchor="middle">
                    O₂: {o2_vent_rate_nm3h} Nm³/h
                  </text>
                </g>

                {/* H2 Fuel Supply Badge */}
                <g transform="translate(630, 595)">
                  <rect width="95" height="26" rx="4" fill="#0f172a" stroke={isFcEnabled ? '#06b6d4' : '#475569'} strokeWidth="1" />
                  <text x="47.5" y="11" fill={isFcEnabled ? '#67e8f9' : '#94a3b8'} fontSize="8" fontFamily="monospace" textAnchor="middle">
                    {isFcEnabled ? 'H₂ FUEL INLET' : 'FC ISOLATED'}
                  </text>
                  <text x="47.5" y="21" fill={isFcEnabled ? '#22d3ee' : '#64748b'} fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                    {isFcEnabled ? `${h2_cons_rate_gh} g/h @ 1.5b` : 'P2G STANDALONE'}
                  </text>
                </g>

                {/* FC Vapor Exhaust Badge */}
                <g transform="translate(825, 748)">
                  <rect width="90" height="20" rx="3" fill="#0f172a" stroke="#60a5fa" strokeWidth="0.8" />
                  <text x="45" y="13" fill="#93c5fd" fontSize="8" fontFamily="monospace" textAnchor="middle">
                    {isFcEnabled && fcIsActive ? 'H₂O Vapor Exhaust' : 'Exhaust Standby'}
                  </text>
                </g>
              </g>
            )}

            {/* ========================================================= */}
            {/* LAYER 1: ELECTRICAL POWER FLOW (V, A, W - DC ANNOTATIONS) */}
            {/* ========================================================= */}
            {showPowerFlow && (
              <g id="layer-electrical-power-flow">
                {/* Branch 1: PV Array -> MPPT DC-DC */}
                <path
                  d="M 185 230 L 285 230"
                  fill="none"
                  stroke={p_pv_w > 0 ? '#f59e0b' : '#334155'}
                  strokeWidth={p_pv_w > 0 ? '4' : '2'}
                  className={p_pv_w > 0 && animateFlow ? 'flow-active-forward' : ''}
                  markerEnd="url(#arrow-power-amber)"
                />

                {/* Branch 1: MPPT DC-DC -> 48V Busbar (T1 at x=400) */}
                <path
                  d="M 395 230 L 420 230 L 420 360"
                  fill="none"
                  stroke={p_pv_w > 0 ? '#f59e0b' : '#334155'}
                  strokeWidth={p_pv_w > 0 ? '4.5' : '2'}
                  className={p_pv_w > 0 && animateFlow ? 'flow-active-forward' : ''}
                  markerEnd="url(#arrow-power-amber)"
                />

                {/* Branch 2: 48V Busbar (T2 at x=1000) -> DC Load */}
                <path
                  d="M 1000 360 L 1000 240 L 1040 240"
                  fill="none"
                  stroke={p_load_w > 0 ? '#f43f5e' : '#334155'}
                  strokeWidth={p_load_w > 0 ? '4.5' : '2'}
                  className={p_load_w > 0 && animateFlow ? 'flow-active-forward' : ''}
                  markerEnd="url(#arrow-power-rose)"
                />

                {/* Branch 3: 48V Busbar (T3 at x=650) <-> BESS BiDir */}
                {bessIsCharging ? (
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
                      d="M 755 230 L 770 230"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="4.5"
                      className={animateFlow ? 'flow-active-forward' : ''}
                      markerEnd="url(#arrow-power-emerald)"
                    />
                  </>
                ) : bessIsDischarging ? (
                  <>
                    <path
                      d="M 770 230 L 755 230"
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
                  <path
                    d="M 650 360 L 650 230 L 770 230"
                    fill="none"
                    stroke="#334155"
                    strokeWidth="2"
                  />
                )}

                {/* Branch 4: 48V Busbar (T4 at x=330) -> PEM Electrolyzer Step-Down CC/CV */}
                <path
                  d="M 330 400 L 330 460 L 240 460 L 240 485"
                  fill="none"
                  stroke={elecIsActive ? '#06b6d4' : '#334155'}
                  strokeWidth={elecIsActive ? '4.2' : '2'}
                  className={elecIsActive && animateFlow ? 'flow-active-forward' : ''}
                  markerEnd="url(#arrow-power-cyan)"
                />
                {/* Step-down CC/CV DC-DC -> PEM Electrolyzer Stack */}
                <path
                  d="M 240 540 L 240 575"
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
                      d="M 870 575 L 870 540"
                      fill="none"
                      stroke={fcIsActive ? '#a855f7' : '#334155'}
                      strokeWidth={fcIsActive ? '4.5' : '2'}
                      className={fcIsActive && animateFlow ? 'flow-active-forward' : ''}
                      markerEnd="url(#arrow-power-purple)"
                    />
                    {/* Boost DC-DC -> 48V Busbar (T5 at x=800) */}
                    <path
                      d="M 870 485 L 870 460 L 800 460 L 800 400"
                      fill="none"
                      stroke={fcIsActive ? '#a855f7' : '#334155'}
                      strokeWidth={fcIsActive ? '4.5' : '2'}
                      className={fcIsActive && animateFlow ? 'flow-active-forward' : ''}
                      markerEnd="url(#arrow-power-purple)"
                    />
                  </>
                ) : (
                  <path
                    d="M 870 575 L 870 485 L 800 485 L 800 400"
                    fill="none"
                    stroke="#334155"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                )}

                {/* Branch 6: 48V Busbar Curtailment / Throttled Surplus Line */}
                {p_curtailed_w > 0 && (
                  <path
                    d="M 530 400 L 530 445"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="3.5"
                    strokeDasharray="4 2"
                    className={animateFlow ? 'flow-active-forward' : ''}
                    markerEnd="url(#arrow-power-amber)"
                  />
                )}

                {/* ========================================================= */}
                {/* ELECTRICAL POWER READOUT BADGES: VOLT, AMP, WATT & DC     */}
                {/* ========================================================= */}
                {/* PV Array to MPPT */}
                <g transform="translate(195, 205)">
                  <rect width="80" height="30" rx="3" fill="#0c1322" stroke="#f59e0b" strokeWidth="1" />
                  <text x="40" y="10" fill="#fef3c7" fontSize="7.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                    PV STRING DC
                  </text>
                  <text x="40" y="19" fill="#fde68a" fontSize="8" fontFamily="monospace" textAnchor="middle">
                    {v_pv_array.toFixed(1)} V DC
                  </text>
                  <text x="40" y="27" fill="#fbbf24" fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                    {i_pv_array} A | {p_pv_w} W
                  </text>
                </g>

                {/* MPPT to Busbar */}
                <g transform="translate(370, 290)">
                  <rect width="115" height="42" rx="4" fill="#0c1322" stroke="#f59e0b" strokeWidth="1.2" />
                  <text x="57.5" y="11" fill="#fef3c7" fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                    BRANCH 1: PV [DC]
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
                <g transform="translate(640, 310)">
                  <rect
                    width="120"
                    height="42"
                    rx="4"
                    fill="#0c1322"
                    stroke={bessIsCharging ? '#10b981' : bessIsDischarging ? '#3b82f6' : '#64748b'}
                    strokeWidth="1.2"
                  />
                  <text
                    x="60"
                    y="11"
                    fill={bessIsCharging ? '#6ee7b7' : bessIsDischarging ? '#93c5fd' : '#94a3b8'}
                    fontSize="8"
                    fontWeight="bold"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    BRANCH 3: BESS {bessIsCharging ? '[CHG]' : bessIsDischarging ? '[DIS]' : '[IDLE]'}
                  </text>
                  <text x="60" y="22" fill="#cbd5e1" fontSize="9" fontFamily="monospace" textAnchor="middle">
                    VOLTS: {v_bus.toFixed(2)} V DC
                  </text>
                  <text x="60" y="31" fill="#cbd5e1" fontSize="9" fontFamily="monospace" textAnchor="middle">
                    CURRENT: {i_bess_abs_a.toFixed(1)} A DC
                  </text>
                  <text
                    x="60"
                    y="39"
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
                <g transform="translate(1045, 310)">
                  <rect width="120" height="42" rx="4" fill="#0c1322" stroke="#f43f5e" strokeWidth="1.2" />
                  <text x="60" y="11" fill="#fecdd3" fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                    BRANCH 2: LOAD [DC]
                  </text>
                  <text x="60" y="22" fill="#fda4af" fontSize="9" fontFamily="monospace" textAnchor="middle">
                    VOLTS: {v_bus.toFixed(2)} V DC
                  </text>
                  <text x="60" y="31" fill="#fda4af" fontSize="9" fontFamily="monospace" textAnchor="middle">
                    CURRENT: {i_load_a.toFixed(1)} A DC
                  </text>
                  <text x="60" y="39" fill="#f43f5e" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                    POWER: {p_load_w} W DC
                  </text>
                </g>

                {/* Electrolyzer Branch Bus Infeed */}
                <g transform="translate(215, 415)">
                  <rect width="125" height="42" rx="4" fill="#0c1322" stroke="#06b6d4" strokeWidth="1.2" />
                  <text x="62.5" y="11" fill="#cffafe" fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                    BRANCH 4: ELEC [DC]
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
                <g transform="translate(140, 548)">
                  <rect width="130" height="22" rx="3" fill="#0a101d" stroke="#06b6d4" strokeWidth="0.8" />
                  <text x="65" y="10" fill="#67e8f9" fontSize="7.5" fontFamily="monospace" textAnchor="middle">
                    STACK LOW-V BUS [DC]
                  </text>
                  <text x="65" y="19" fill="#22d3ee" fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                    20V DC | {i_elec_stack_a}A | {p_elec_stack_w}W
                  </text>
                </g>

                {/* Branch 6: Curtailment / Throttling Badge */}
                {p_curtailed_w > 0 && (
                  <g
                    transform="translate(460, 420)"
                    className="cursor-pointer group"
                    onClick={() => setSelectedSubsystem('elec')}
                  >
                    <rect width="140" height="42" rx="4" fill="#1c1106" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="3 2" />
                    <text x="70" y="11" fill="#fef3c7" fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                      BRANCH 6: CURTAILED [DC]
                    </text>
                    <text x="70" y="21" fill="#fde68a" fontSize="8.5" fontFamily="monospace" textAnchor="middle">
                      {v_bus.toFixed(2)}V | {i_curtailed_a.toFixed(1)}A DC
                    </text>
                    <text x="70" y="30" fill="#f59e0b" fontSize="8.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                      {p_curtailed_w} W DISSIPATED
                    </text>
                    <text x="70" y="38" fill="#d97706" fontSize="7" fontFamily="monospace" textAnchor="middle">
                      {isTankFull ? 'H₂ TANK FULL (30b)' : `STACK CAPPED (${params.elec_rated_kw}kW)`}
                    </text>
                  </g>
                )}

                {/* Fuel Cell Branch Stack Side */}
                <g transform="translate(805, 548)">
                  <rect width="130" height="22" rx="3" fill="#0a101d" stroke={isFcEnabled ? '#a855f7' : '#475569'} strokeWidth="0.8" />
                  <text x="65" y="10" fill={isFcEnabled ? '#e9d5ff' : '#94a3b8'} fontSize="7.5" fontFamily="monospace" textAnchor="middle">
                    {isFcEnabled ? 'FC STACK OUTPUT [DC]' : 'FC STACK [DISABLED]'}
                  </text>
                  <text x="65" y="19" fill={isFcEnabled ? '#c084fc' : '#64748b'} fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                    {isFcEnabled ? `28V DC | ${i_fc_stack_a}A | ${p_fc_stack_w}W` : 'ISOLATED (P2G)'}
                  </text>
                </g>

                {/* Fuel Cell Branch Bus Infeed */}
                <g transform="translate(835, 415)">
                  <rect width="130" height="42" rx="4" fill="#0c1322" stroke={isFcEnabled ? '#a855f7' : '#475569'} strokeWidth="1.2" />
                  <text x="65" y="11" fill={isFcEnabled ? '#f3e8ff' : '#94a3b8'} fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                    {isFcEnabled ? 'BRANCH 5: FC [DC]' : 'BRANCH 5: DISABLED'}
                  </text>
                  <text x="65" y="22" fill={isFcEnabled ? '#e9d5ff' : '#64748b'} fontSize="9" fontFamily="monospace" textAnchor="middle">
                    VOLTS: {v_bus.toFixed(2)} V DC
                  </text>
                  <text x="65" y="31" fill={isFcEnabled ? '#e9d5ff' : '#64748b'} fontSize="9" fontFamily="monospace" textAnchor="middle">
                    CURRENT: {isFcEnabled ? `${i_fc_a.toFixed(1)} A DC` : '0.0 A DC'}
                  </text>
                  <text x="65" y="39" fill={isFcEnabled ? '#a855f7' : '#64748b'} fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                    POWER: {isFcEnabled ? `${p_fc_w} W DC` : '0 W (P2G MODE)'}
                  </text>
                </g>
              </g>
            )}

            {/* ========================================================= */}
            {/* PHYSICAL EQUIPMENT NODES & SUBSYSTEM BLOCKS (CLICKABLE!)  */}
            {/* ========================================================= */}

            {/* NODE 1: SOLAR PV ARRAY */}
            <g
              id="node-pv-array"
              transform="translate(40, 160)"
              className="cursor-pointer group"
              onClick={() => setSelectedSubsystem(selectedSubsystem === 'pv' ? null : 'pv')}
            >
              <rect
                width="145"
                height="140"
                rx="6"
                fill="url(#panelGrad)"
                stroke={selectedSubsystem === 'pv' ? '#38bdf8' : '#f59e0b'}
                strokeWidth={selectedSubsystem === 'pv' ? '2.5' : '1.5'}
                className="transition group-hover:stroke-amber-300"
              />
              <rect x="0" y="0" width="145" height="24" rx="6" fill="#1e293b" />
              <text x="72.5" y="16" fill="#fbbf24" fontSize="10" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
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
              <rect x="10" y="122" width="125" height="12" rx="2" fill="#451a03" />
              <text x="72.5" y="131" fill="#fcd34d" fontSize="7.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                CLICK TO TUNE PV
              </text>
            </g>

            {/* NODE 2: MPPT DC-DC CONVERTER */}
            <g
              id="node-mppt"
              transform="translate(285, 180)"
              className="cursor-pointer group"
              onClick={() => setSelectedSubsystem(selectedSubsystem === 'mppt' ? null : 'mppt')}
            >
              <rect
                width="110"
                height="100"
                rx="5"
                fill="#0f172a"
                stroke={selectedSubsystem === 'mppt' ? '#38bdf8' : '#f59e0b'}
                strokeWidth={selectedSubsystem === 'mppt' ? '2.5' : '1.5'}
                className="transition group-hover:stroke-amber-300"
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
            <g
              id="node-dc-busbar"
              transform="translate(280, 360)"
              className="cursor-pointer group"
              onClick={() => setSelectedSubsystem(selectedSubsystem === 'busbar' ? null : 'busbar')}
            >
              <rect
                x="0"
                y="0"
                width="740"
                height="40"
                rx="6"
                fill="url(#busbarGrad)"
                stroke={selectedSubsystem === 'busbar' ? '#38bdf8' : '#fbbf24'}
                strokeWidth={selectedSubsystem === 'busbar' ? '3' : '2'}
                className="drop-shadow-lg transition group-hover:stroke-yellow-300"
              />
              <line x1="10" y1="20" x2="730" y2="20" stroke="#713f12" strokeWidth="1" strokeDasharray="6 3" />
              <text x="370" y="17" fill="#451a03" fontSize="12" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                COMMON 48 V DC BUSBAR SYSTEM (48.0 V to 56.8 V DC)
              </text>
              <text x="370" y="32" fill="#713f12" fontSize="11" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                V_BUS: {v_bus.toFixed(2)} V DC | KCL RESIDUAL: {activeStep.kcl_residual_a.toFixed(3)} A
              </text>

              {/* Tap Point Terminals on Busbar */}
              {/* Tap 1: PV Infeed (x=420 -> cx=140 relative to 280) */}
              <circle cx="140" cy="20" r="5" fill="#f59e0b" stroke="#78350f" strokeWidth="2" />
              <text x="140" y="-8" fill="#fef3c7" fontSize="8.5" fontFamily="monospace" textAnchor="middle">
                T1: PV (+)
              </text>

              {/* Tap 4: Electrolyzer Tap (x=330 -> cx=50) */}
              <circle cx="50" cy="20" r="5" fill="#06b6d4" stroke="#083344" strokeWidth="2" />
              <text x="50" y="52" fill="#cffafe" fontSize="8.5" fontFamily="monospace" textAnchor="middle">
                T4: ELEC (-)
              </text>

              {/* Tap 6: Curtailment / Surplus Dump Tap (x=530 -> cx=250) */}
              {p_curtailed_w > 0 && (
                <>
                  <circle cx="250" cy="20" r="4.5" fill="#f59e0b" stroke="#78350f" strokeWidth="1.5" />
                  <text x="250" y="52" fill="#fef3c7" fontSize="8" fontFamily="monospace" textAnchor="middle">
                    T6: DUMP (-)
                  </text>
                </>
              )}

              {/* Tap 3: BESS BiDir Tap (x=650 -> cx=370) */}
              <circle cx="370" cy="20" r="5" fill="#10b981" stroke="#064e3b" strokeWidth="2" />
              <text x="370" y="-8" fill="#d1fae5" fontSize="8.5" fontFamily="monospace" textAnchor="middle">
                T3: BESS (+/-)
              </text>

              {/* Tap 5: Fuel Cell Injection Tap (x=800 -> cx=520) */}
              <circle cx="520" cy="20" r="5" fill="#a855f7" stroke="#3b0764" strokeWidth="2" />
              <text x="520" y="52" fill="#f3e8ff" fontSize="8.5" fontFamily="monospace" textAnchor="middle">
                T5: FC (+)
              </text>

              {/* Tap 2: DC Load Tap (x=1000 -> cx=720) */}
              <circle cx="720" cy="20" r="5" fill="#f43f5e" stroke="#881337" strokeWidth="2" />
              <text x="720" y="-8" fill="#ffe4e6" fontSize="8.5" fontFamily="monospace" textAnchor="middle">
                T2: LOAD (-)
              </text>
            </g>

            {/* NODE 3: BESS BIDIRECTIONAL DC-DC & 16S LIFEPO4 PACK */}
            <g
              id="node-bess-subsystem"
              transform="translate(650, 160)"
              className="cursor-pointer group"
              onClick={() => setSelectedSubsystem(selectedSubsystem === 'bess' ? null : 'bess')}
            >
              {/* Bidirectional DC-DC Converter */}
              <rect
                width="105"
                height="140"
                rx="5"
                fill="#0f172a"
                stroke={selectedSubsystem === 'bess' ? '#38bdf8' : '#10b981'}
                strokeWidth={selectedSubsystem === 'bess' ? '2.5' : '1.5'}
                className="transition group-hover:stroke-emerald-300"
              />
              <rect x="0" y="0" width="105" height="22" rx="5" fill="#1e293b" />
              <text x="52.5" y="15" fill="#6ee7b7" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                BiDir DC-DC
              </text>
              <text x="8" y="42" fill="#cbd5e1" fontSize="8.5" fontFamily="monospace">
                Rating: {params.bess_dis_max_kw.toFixed(1)} kW
              </text>
              <text x="8" y="58" fill="#94a3b8" fontSize="8" fontFamily="monospace">
                Chg: {params.bess_chg_max_kw.toFixed(1)} kW
              </text>
              <text x="8" y="74" fill="#94a3b8" fontSize="8" fontFamily="monospace">
                Eff: {(params.eta_bess_chg * 100).toFixed(0)}%
              </text>
              <text x="8" y="90" fill="#94a3b8" fontSize="8" fontFamily="monospace">
                Mode: {bessIsCharging ? 'BUCK CHG' : bessIsDischarging ? 'BOOST DIS' : 'STANDBY'}
              </text>
              <rect x="6" y="118" width="93" height="14" rx="2" fill="#064e3b" />
              <text x="52.5" y="128" fill="#a7f3d0" fontSize="7.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                {bessIsCharging ? 'CHARGING' : bessIsDischarging ? 'DISCHARGING' : 'FLOAT / IDLE'}
              </text>

              {/* 16S LiFePO4 Battery Pack (Attached to right) */}
              <g transform="translate(120, 0)">
                <rect
                  width="125"
                  height="140"
                  rx="6"
                  fill="#06251b"
                  stroke={selectedSubsystem === 'bess' ? '#38bdf8' : '#10b981'}
                  strokeWidth={selectedSubsystem === 'bess' ? '2.5' : '1.5'}
                  className="transition group-hover:stroke-emerald-300"
                />
                <rect x="0" y="0" width="125" height="24" rx="6" fill="#064e3b" />
                <text x="62.5" y="16" fill="#ecfdf5" fontSize="9.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  16S LiFePO4 BESS
                </text>
                <Battery className="text-emerald-400" x="8" y="32" width="16" height="16" />
                <text x="28" y="44" fill="#a7f3d0" fontSize="10" fontWeight="bold" fontFamily="monospace">
                  SoC: {(activeStep.soc * 100).toFixed(1)}%
                </text>
                {/* Visual SoC Bar */}
                <rect x="8" y="52" width="109" height="10" rx="2" fill="#0f172a" />
                <rect
                  x="8"
                  y="52"
                  width={Math.max(2, Math.min(109, 109 * activeStep.soc))}
                  height="10"
                  rx="2"
                  fill={activeStep.soc > 0.4 ? '#10b981' : activeStep.soc > 0.2 ? '#eab308' : '#ef4444'}
                />
                <text x="8" y="78" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
                  E: {activeStep.e_bess_kwh.toFixed(2)} kWh
                </text>
                <text x="8" y="94" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
                  Cap: {params.bess_cap_kwh.toFixed(1)} kWh
                </text>
                <text x="8" y="110" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
                  Voc: {activeStep.v_oc_bess_v.toFixed(2)} V
                </text>
                <rect x="8" y="120" width="109" height="14" rx="2" fill="#022c22" />
                <text x="62.5" y="130" fill="#6ee7b7" fontSize="7.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  TUNE BATTERY PARAMS
                </text>
              </g>
            </g>

            {/* NODE 4: PROGRAMMABLE DC ELECTRONIC LOAD */}
            <g
              id="node-dc-load"
              transform="translate(1040, 160)"
              className="cursor-pointer group"
              onClick={() => setSelectedSubsystem(selectedSubsystem === 'load' ? null : 'load')}
            >
              <rect
                width="130"
                height="140"
                rx="6"
                fill="#1f1015"
                stroke={selectedSubsystem === 'load' ? '#38bdf8' : '#f43f5e'}
                strokeWidth={selectedSubsystem === 'load' ? '2.5' : '1.5'}
                className="transition group-hover:stroke-rose-400"
              />
              <rect x="0" y="0" width="130" height="24" rx="6" fill="#881337" />
              <text x="65" y="16" fill="#ffe4e6" fontSize="9.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                PROGRAMMABLE LOAD
              </text>
              <Activity className="text-rose-400" x="10" y="32" width="16" height="16" />
              <text x="30" y="44" fill="#fda4af" fontSize="9.5" fontWeight="bold" fontFamily="monospace">
                {p_load_w} W DC
              </text>
              <text x="10" y="66" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
                I_load: {i_load_a.toFixed(1)} A DC
              </text>
              <text x="10" y="82" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
                V_bus: {v_bus.toFixed(2)} V DC
              </text>
              <text x="10" y="98" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
                Unserved: {Math.round(activeStep.p_unserved_kw * 1000)} W
              </text>
              <rect x="8" y="118" width="114" height="14" rx="2" fill="#4c0519" />
              <text x="65" y="128" fill="#f43f5e" fontSize="7.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                SCALE LOAD DEMAND
              </text>
            </g>

            {/* NODE 5: CENTRAL INDUSTRIAL DAQ CONTROLLER */}
            <g
              id="node-daq-controller"
              transform="translate(520, 35)"
              className="cursor-pointer group"
              onClick={() => setSelectedSubsystem(selectedSubsystem === 'daq' ? null : 'daq')}
            >
              <rect
                width="160"
                height="70"
                rx="6"
                fill="#111827"
                stroke={selectedSubsystem === 'daq' ? '#38bdf8' : '#a855f7'}
                strokeWidth={selectedSubsystem === 'daq' ? '2.5' : '1.5'}
                className="transition group-hover:stroke-purple-300"
              />
              <rect x="0" y="0" width="160" height="20" rx="6" fill="#3b0764" />
              <text x="80" y="14" fill="#f3e8ff" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                SUPERVISORY DAQ CONTROLLER
              </text>
              <text x="10" y="36" fill="#c084fc" fontSize="8.5" fontFamily="monospace">
                Active State: <strong>State {activeStep.state}</strong>
              </text>
              <text x="10" y="49" fill="#94a3b8" fontSize="8" fontFamily="monospace">
                {activeStep.state === 1 && 'BESS Priority Charging'}
                {activeStep.state === 2 && 'Excess Solar to PEM H₂'}
                {activeStep.state === 3 && 'Normal BESS Discharge'}
                {activeStep.state === 4 && 'PEM Fuel Cell Backup'}
              </text>
              <text x="10" y="62" fill="#a855f7" fontSize="8" fontWeight="bold" fontFamily="monospace">
                100 Hz RT Cyclic Telemetry
              </text>
            </g>

            {/* NODE 6: DI WATER FEED RESERVOIR */}
            <g
              id="node-di-water-tank"
              transform="translate(25, 575)"
              className="cursor-pointer group"
              onClick={() => setSelectedSubsystem(selectedSubsystem === 'elec' ? null : 'elec')}
            >
              <rect
                width="95"
                height="120"
                rx="6"
                fill="#081e36"
                stroke="#3b82f6"
                strokeWidth="1.5"
                className="transition group-hover:stroke-blue-400"
              />
              <rect x="0" y="0" width="95" height="22" rx="6" fill="#1e3a8a" />
              <text x="47.5" y="15" fill="#dbeafe" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                DI WATER TANK
              </text>
              <Droplets className="text-blue-400" x="8" y="30" width="16" height="16" />
              <text x="28" y="42" fill="#93c5fd" fontSize="9" fontFamily="monospace">
                Feed Buffer
              </text>
              <text x="8" y="62" fill="#94a3b8" fontSize="8" fontFamily="monospace">
                Resistivity: &gt;18 MΩ·cm
              </text>
              <text x="8" y="78" fill="#94a3b8" fontSize="8" fontFamily="monospace">
                Feed: {params.di_water_l_per_kg_h2} L/kg
              </text>
              <rect x="6" y="98" width="83" height="14" rx="2" fill="#172554" />
              <text x="47.5" y="108" fill="#60a5fa" fontSize="7.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                ION EXCHANGE
              </text>
            </g>

            {/* NODE 7: PEM ELECTROLYZER SUBSYSTEM */}
            {/* Step-Down CC/CV DC-DC Converter */}
            <g
              id="node-elec-dcdc"
              transform="translate(180, 485)"
              className="cursor-pointer group"
              onClick={() => setSelectedSubsystem(selectedSubsystem === 'elec' ? null : 'elec')}
            >
              <rect
                width="120"
                height="55"
                rx="4"
                fill="#0f172a"
                stroke={selectedSubsystem === 'elec' ? '#38bdf8' : '#06b6d4'}
                strokeWidth={selectedSubsystem === 'elec' ? '2.5' : '1.2'}
                className="transition group-hover:stroke-cyan-300"
              />
              <rect x="0" y="0" width="120" height="18" rx="4" fill="#083344" />
              <text x="60" y="13" fill="#cffafe" fontSize="8.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                STEP-DOWN CC/CV DC-DC
              </text>
              <text x="8" y="32" fill="#cbd5e1" fontSize="8" fontFamily="monospace">
                48V DC → 20V DC Stack
              </text>
              <text x="8" y="45" fill="#06b6d4" fontSize="8" fontWeight="bold" fontFamily="monospace">
                Eff: {(params.eta_elec_dcdc * 100).toFixed(0)}%
              </text>
            </g>

            {/* PEM Electrolyzer Stack */}
            <g
              id="node-pem-electrolyzer"
              transform="translate(170, 575)"
              className="cursor-pointer group"
              onClick={() => setSelectedSubsystem(selectedSubsystem === 'elec' ? null : 'elec')}
            >
              <rect
                width="140"
                height="120"
                rx="6"
                fill="#0b1e2e"
                stroke={selectedSubsystem === 'elec' ? '#38bdf8' : '#06b6d4'}
                strokeWidth={selectedSubsystem === 'elec' ? '2.5' : '1.8'}
                className="transition group-hover:stroke-cyan-300"
              />
              <rect x="0" y="0" width="140" height="24" rx="6" fill="#0e7490" />
              <text x="70" y="16" fill="#ecfeff" fontSize="9.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                PEM ELECTROLYZER
              </text>
              <Droplets className="text-cyan-300" x="10" y="32" width="16" height="16" />
              <text x="30" y="44" fill="#a5f3fc" fontSize="9.5" fontWeight="bold" fontFamily="monospace">
                {params.elec_rated_kw.toFixed(1)} kW Stack
              </text>
              <text x="10" y="66" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
                SEC: {params.sec_elec_kwh_per_kg} kWh/kg
              </text>
              <text x="10" y="82" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
                Min: {(params.elec_k_turndown * 100).toFixed(0)}% (Safety)
              </text>
              <rect x="8" y="98" width="124" height="15" rx="2" fill={elecIsActive ? '#164e63' : isTankFull ? '#78350f' : '#1e293b'} />
              <text x="70" y="109" fill={elecIsActive ? '#67e8f9' : isTankFull ? '#fbbf24' : '#94a3b8'} fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                {elecIsActive
                  ? 'ACTIVE H₂ PROD'
                  : isTankFull
                  ? '⚠️ TANK FULL (30b)'
                  : activeStep.p_pv_bus_kw === 0
                  ? 'STANDBY (NIGHT)'
                  : 'TURNDOWN OFF'}
              </text>
            </g>

            {/* NODE 8: MAIN HYDROGEN STORAGE TANK (PRESSURE ADJUSTABLE) */}
            <g
              id="node-h2-tank"
              transform="translate(440, 530)"
              className="cursor-pointer group"
              onClick={() => setSelectedSubsystem(selectedSubsystem === 'tank' ? null : 'tank')}
            >
              <rect
                width="180"
                height="170"
                rx="8"
                fill="#091424"
                stroke={selectedSubsystem === 'tank' ? '#38bdf8' : isTankFull ? '#f59e0b' : '#0284c7'}
                strokeWidth={selectedSubsystem === 'tank' ? '3' : isTankFull ? '2.5' : '2'}
                className="transition group-hover:stroke-sky-300 shadow-xl"
              />
              <rect x="0" y="0" width="180" height="26" rx="8" fill={isTankFull ? '#b45309' : '#0369a1'} />
              <text x="90" y="17" fill="#f0f9ff" fontSize="10" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                {isTankFull ? '⚠️ H₂ TANK FULL (OVERPRESSURE)' : 'H₂ STORAGE VESSEL'}
              </text>
              <Gauge className="text-sky-300" x="10" y="35" width="18" height="18" />
              <text x="34" y="49" fill="#bae6fd" fontSize="12" fontWeight="bold" fontFamily="monospace">
                {activeStep.p_tank_bar.toFixed(1)} bar
              </text>

              {/* Dynamic Pressure Class Badge */}
              <rect x="10" y="60" width="160" height="18" rx="3" fill="#082f49" />
              <text x="90" y="73" fill="#7dd3fc" fontSize="8.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                CLASS: {params.tank_p_max_bar} BAR RATING
              </text>

              <text x="12" y="96" fill="#cbd5e1" fontSize="9" fontFamily="monospace font-semibold">
                Geometric Vol: <strong className="text-cyan-300">{tankVolL} L</strong> ({params.tank_volume_m3.toFixed(3)} m³)
              </text>
              <text x="12" y="112" fill="#cbd5e1" fontSize="9" fontFamily="monospace">
                Stored Mass: <strong className="text-sky-300">{activeStep.m_h2_tank_kg.toFixed(3)} kg</strong>
              </text>
              <text x="12" y="128" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
                Max Capacity: {maxStorageKg.toFixed(3)} kg H₂
              </text>
              <text x="12" y="144" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
                Compressibility Z(P): ~{realGasZ.toFixed(3)}
              </text>

              <rect x="10" y="150" width="160" height="14" rx="2" fill="#0c4a6e" />
              <text x="90" y="160" fill="#38bdf8" fontSize="7.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                CLICK TO ADJUST PRESSURE & VOL
              </text>
            </g>

            {/* NODE 9: PRESSURE REGULATOR / VALVE */}
            <g
              id="node-h2-regulator"
              transform="translate(730, 620)"
              className="cursor-pointer group"
              onClick={() => setSelectedSubsystem(selectedSubsystem === 'fc' ? null : 'fc')}
            >
              <circle
                cx="15"
                cy="15"
                r="14"
                fill="#131d31"
                stroke={isFcEnabled ? '#38bdf8' : '#475569'}
                strokeWidth="1.4"
                strokeDasharray={isFcEnabled ? undefined : '2 2'}
                className="transition group-hover:stroke-cyan-300"
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

            {/* NODE 10: PEM FUEL CELL & BOOST DC-DC (OPTIONAL SUBSYSTEM) */}
            {/* Step-Up Boost DC-DC Converter */}
            <g
              id="node-fc-boost-dcdc"
              transform="translate(810, 485)"
              className="cursor-pointer group"
              onClick={() => setSelectedSubsystem(selectedSubsystem === 'fc' ? null : 'fc')}
            >
              <rect
                width="120"
                height="55"
                rx="4"
                fill="#0f172a"
                stroke={isFcEnabled ? (selectedSubsystem === 'fc' ? '#38bdf8' : '#a855f7') : '#475569'}
                strokeWidth={selectedSubsystem === 'fc' ? '2.5' : '1.2'}
                strokeDasharray={isFcEnabled ? undefined : '3 3'}
                className="transition group-hover:stroke-purple-300"
              />
              <rect x="0" y="0" width="120" height="18" rx="4" fill={isFcEnabled ? '#3b0764' : '#1e293b'} />
              <text x="60" y="13" fill={isFcEnabled ? '#e9d5ff' : '#94a3b8'} fontSize="8.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                BOOST DC-DC
              </text>
              <text x="8" y="31" fill="#cbd5e1" fontSize="8" fontFamily="monospace">
                {isFcEnabled ? '28V DC → 48V DC' : 'ISOLATED'}
              </text>
              <text x="8" y="44" fill={isFcEnabled ? '#a855f7' : '#64748b'} fontSize="8" fontWeight="bold" fontFamily="monospace">
                {isFcEnabled ? (fcIsActive ? 'BOOSTING 48V' : 'STANDBY') : 'BRANCH 5 OPEN'}
              </text>
            </g>

            {/* PEM Fuel Cell Stack */}
            <g
              id="node-pem-fuel-cell"
              transform="translate(800, 575)"
              className="cursor-pointer group"
              onClick={() => setSelectedSubsystem(selectedSubsystem === 'fc' ? null : 'fc')}
            >
              <rect
                width="140"
                height="120"
                rx="6"
                fill="#0f172a"
                stroke={isFcEnabled ? (selectedSubsystem === 'fc' ? '#38bdf8' : '#a855f7') : '#475569'}
                strokeWidth={selectedSubsystem === 'fc' ? '2.5' : '1.8'}
                strokeDasharray={isFcEnabled ? undefined : '4 4'}
                className="transition group-hover:stroke-purple-300"
              />
              <rect x="0" y="0" width="140" height="24" rx="6" fill={isFcEnabled ? '#3b0764' : '#1e293b'} />
              <text
                x="70"
                y="16"
                fill={isFcEnabled ? '#e9d5ff' : '#94a3b8'}
                fontSize="9.5"
                fontWeight="bold"
                fontFamily="monospace"
                textAnchor="middle"
              >
                {isFcEnabled ? 'PEM FUEL CELL' : 'FC (OPTIONAL: OFF)'}
              </text>
              <Activity className={isFcEnabled ? 'text-purple-400' : 'text-slate-500'} x="10" y="32" width="16" height="16" />
              <text x="30" y="44" fill={isFcEnabled ? '#f3e8ff' : '#64748b'} fontSize="9" fontWeight="bold" fontFamily="monospace">
                {isFcEnabled ? `Rating: ${params.fc_rated_kw.toFixed(1)} kW` : 'NOT INSTALLED'}
              </text>
              <text x="10" y="66" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
                Opt Set: {isFcEnabled ? `${params.fc_opt_setpoint_kw.toFixed(1)} kW` : 'N/A (P2G)'}
              </text>
              <text x="10" y="82" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
                Eff: {(params.eta_fc_stack * 100).toFixed(0)}%
              </text>
              <rect x="8" y="98" width="124" height="14" rx="2" fill={isFcEnabled ? '#3b0764' : '#1e293b'} />
              <text
                x="70"
                y="108"
                fill={isFcEnabled ? (fcIsActive ? '#d8b4fe' : '#64748b') : '#94a3b8'}
                fontSize="7.5"
                fontWeight="bold"
                fontFamily="monospace"
                textAnchor="middle"
              >
                {isFcEnabled ? (fcIsActive ? 'ACTIVE BACKUP' : 'LATCH OFF') : 'CLICK TO ENABLE FC'}
              </text>
            </g>

            {/* Diagram Legend (Cleanly in bottom right, without overlapping anything) */}
            <g id="diagram-legend" transform="translate(970, 655)">
              <rect width="220" height="110" rx="5" fill="#0c1322" stroke="#334155" strokeWidth="1" />
              <text x="10" y="16" fill="#94a3b8" fontSize="8.5" fontWeight="bold" fontFamily="monospace">
                NOTATION & FLOW LEGEND:
              </text>
              <circle cx="18" cy="30" r="3.5" fill="#f59e0b" />
              <text x="28" y="33" fill="#cbd5e1" fontSize="7.5" fontFamily="monospace">
                DC Power Lines (V, A, W with Direction)
              </text>
              <circle cx="18" cy="46" r="3.5" fill="#06b6d4" />
              <text x="28" y="49" fill="#cbd5e1" fontSize="7.5" fontFamily="monospace">
                Hydrogen Gas (H₂ g/h @ Pressure)
              </text>
              <circle cx="18" cy="62" r="3.5" fill="#3b82f6" />
              <text x="28" y="65" fill="#cbd5e1" fontSize="7.5" fontFamily="monospace">
                DI Water (H₂O L/h) & O₂ Vent
              </text>
              <line x1="14" y1="78" x2="24" y2="78" stroke="#c084fc" strokeWidth="2" strokeDasharray="2 2" />
              <text x="28" y="81" fill="#cbd5e1" fontSize="7.5" fontFamily="monospace">
                Supervisory DAQ (CAN / Modbus)
              </text>
              <rect x="8" y="90" width="204" height="14" rx="2" fill="#1e293b" />
              <text x="110" y="100" fill="#38bdf8" fontSize="7.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                💡 CLICK ANY BLOCK TO EDIT
              </text>
            </g>
          </svg>
        </div>

        {/* Floating Nighttime Indicator with Instant Midday Jump */}
        {activeStep.p_pv_bus_kw === 0 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 bg-[#0c1424]/95 backdrop-blur border border-amber-500/60 rounded-full px-3.5 py-1.5 flex items-center gap-2.5 text-[11px] font-mono shadow-2xl">
            <span className="text-amber-300 flex items-center gap-1 font-semibold">
              <span>🌙</span>
              <span>Viewing Night ({activeStep.timestamp}) - Solar is 0 W</span>
            </span>
            <button
              onClick={() => {
                if (onSelectStepIndex && allSteps.length > 0) {
                  let bestIdx = 0;
                  let maxPv = -1;
                  allSteps.forEach((s, idx) => {
                    if (s.p_pv_bus_kw > maxPv) {
                      maxPv = s.p_pv_bus_kw;
                      bestIdx = idx;
                    }
                  });
                  if (maxPv <= 0) {
                    bestIdx = allSteps.findIndex((s) => s.hour >= 12.0) || 48;
                  }
                  onSelectStepIndex(Math.max(0, bestIdx));
                }
              }}
              className="text-cyan-300 hover:text-white font-bold underline flex items-center gap-1 bg-[#132238] px-2 py-0.5 rounded border border-cyan-500/40"
            >
              <Sun className="w-3.5 h-3.5 text-yellow-400" />
              <span>Jump to Midday (12:00)</span>
            </button>
          </div>
        )}

        {/* Embedded Subsystem Parameter Drawer */}
        <SubsystemEditorDrawer
          subsystem={selectedSubsystem}
          onClose={() => setSelectedSubsystem(null)}
          params={params}
          onChangeParams={(newParams) => {
            if (onChangeParams) onChangeParams(newParams);
          }}
          currentStep={activeStep}
          onScaleLoad={onScaleLoad}
        />
      </div>

      {/* ========================================================= */}
      {/* DIAGRAM FOOTER: KIRCHHOFF'S CURRENT LAW & NODAL AUDIT     */}
      {/* ========================================================= */}
      <div className="bg-[#0b1220] border-t border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-3 text-slate-300 flex-wrap">
          <span>
            Bus Voltage: <strong className="text-yellow-400">{v_bus.toFixed(2)} V DC</strong>
          </span>
          <span className="text-slate-600">|</span>
          <span>
            PV: <strong className="text-amber-400">{p_pv_w} W</strong> ({i_pv_a.toFixed(1)} A)
          </span>
          <span className="text-slate-600">|</span>
          <span>
            Load: <strong className="text-rose-400">{p_load_w} W</strong> ({i_load_a.toFixed(1)} A)
          </span>
          <span className="text-slate-600">|</span>
          <span>
            BESS: <strong className={bessIsCharging ? 'text-emerald-400' : bessIsDischarging ? 'text-blue-400' : 'text-slate-400'}>
              {bessIsCharging ? `+${p_bess_chg_w}W (Chg)` : bessIsDischarging ? `-${p_bess_dis_w}W (Dis)` : '0W'}
            </strong>
          </span>
          <span className="text-slate-600">|</span>
          <span>
            Elec: <strong className={elecIsActive ? 'text-cyan-400' : 'text-slate-500'}>
              {elecIsActive ? `${p_elec_w}W (${h2_prod_rate_gh}g/h)` : '0W'}
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

          <div className="flex items-center gap-1.5 bg-[#121c2e] px-2 py-0.5 rounded border border-sky-800">
            <span className="text-slate-400 text-[10px]">Tank:</span>
            <strong className="text-cyan-400 text-[11px]">
              {activeStep.m_h2_tank_kg.toFixed(3)} kg ({activeStep.p_tank_bar.toFixed(1)} bar)
            </strong>
          </div>

          <div className="flex items-center gap-1.5 bg-[#121c2e] px-2 py-0.5 rounded border border-slate-700">
            <span className="text-slate-400 text-[10px]">FC:</span>
            <strong className={`text-[11px] ${isFcEnabled ? (fcIsActive ? 'text-purple-300' : 'text-slate-400') : 'text-amber-400'}`}>
              {isFcEnabled ? (fcIsActive ? `${p_fc_w} W` : 'STANDBY') : 'P2G'}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
};
