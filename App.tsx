import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  SystemParameters,
  TimeSeriesInputStep,
  TimeSeriesOutputStep,
  SimulationSummary,
  SizingRecommendation,
} from './src/types/microgrid';
import {
  DEFAULT_PARAMETERS_1_TO_1,
  DEFAULT_PARAMETERS_1_TO_10,
  PRESET_SCENARIOS,
} from './src/simulation/benchmarkDatasets';
import { runSimulation } from './src/simulation/simulationEngine';
import { KpiAuditRibbon } from './src/components/KpiAuditRibbon';
import { ParameterMatrixSidebar } from './src/components/ParameterMatrixSidebar';
import { SynchronizedPlots } from './src/components/SynchronizedPlots';
import { BottomInspectorTabs } from './src/components/BottomInspectorTabs';
import { AutoSizingModal } from './src/components/AutoSizingModal';
import { SystemDiagramModal } from './src/components/SystemDiagramModal';
import {
  Activity,
  Cpu,
  Download,
  Flame,
  Layers,
  LineChart,
  Play,
  RotateCcw,
  Sparkles,
  Wand2,
  Zap,
} from 'lucide-react';

export default function App() {
  // Model Parameters State
  const [params, setParams] = useState<SystemParameters>(DEFAULT_PARAMETERS_1_TO_1);

  // Active Dataset / Scenario State
  const [activePresetId, setActivePresetId] = useState<string>('1day-baseline');
  const [inputSteps, setInputSteps] = useState<TimeSeriesInputStep[]>(() => {
    const defaultPreset = PRESET_SCENARIOS.find((p) => p.id === '1day-baseline');
    return defaultPreset ? defaultPreset.generator() : [];
  });
  const [customDatasetActive, setCustomDatasetActive] = useState<boolean>(false);
  const [customDatasetName, setCustomDatasetName] = useState<string>('');

  // Simulation Results State
  const [outputSteps, setOutputSteps] = useState<TimeSeriesOutputStep[]>([]);
  const [summary, setSummary] = useState<SimulationSummary | null>(null);
  const [solverExecutionTimeMs, setSolverExecutionTimeMs] = useState<number>(0);
  const [autoRecompute, setAutoRecompute] = useState<boolean>(true);

  // Modals State
  const [isAutoSizingOpen, setIsAutoSizingOpen] = useState<boolean>(false);
  const [diagramModal, setDiagramModal] = useState<{
    isOpen: boolean;
    imageSrc: string;
    title: string;
    description: string;
  }>({
    isOpen: false,
    imageSrc: '',
    title: '',
    description: '',
  });

  // Execute Simulation Core
  const executeSimulation = useCallback(
    (steps: TimeSeriesInputStep[], currentParams: SystemParameters) => {
      const tStart = performance.now();
      try {
        const dt = steps.length > 0 && steps[1] ? steps[1].hour - steps[0].hour : 0.25;
        const validDt = dt > 0 && dt <= 1.0 ? dt : 0.25;
        const result = runSimulation(steps, currentParams, validDt);
        const tEnd = performance.now();

        setOutputSteps(result.steps);
        setSummary(result.summary);
        setSolverExecutionTimeMs(Math.round((tEnd - tStart) * 100) / 100);
      } catch (err) {
        console.error('Simulation error:', err);
      }
    },
    []
  );

  // Initial & Auto re-run trigger
  useEffect(() => {
    if (autoRecompute) {
      executeSimulation(inputSteps, params);
    }
  }, [inputSteps, params, autoRecompute, executeSimulation]);

  // Handle Preset Switching
  const handleSelectPreset = (presetId: string) => {
    setActivePresetId(presetId);
    setCustomDatasetActive(false);

    const preset = PRESET_SCENARIOS.find((p) => p.id === presetId);
    if (!preset) return;

    const newSteps = preset.generator();
    setInputSteps(newSteps);

    // If 1:10 scale preset selected, switch parameters to 1:10 scale
    if (preset.isScaledBenchtop) {
      setParams({
        ...DEFAULT_PARAMETERS_1_TO_10,
      });
    } else if (params.scale === '1:10') {
      setParams({
        ...DEFAULT_PARAMETERS_1_TO_1,
      });
    }
  };

  // Handle Custom Dataset Ingestion
  const handleLoadCustomDataset = (steps: TimeSeriesInputStep[], name: string) => {
    setCustomDatasetActive(true);
    setCustomDatasetName(name);
    setInputSteps(steps);
  };

  // Handle Parameter Reset
  const handleResetDefaults = () => {
    if (params.scale === '1:10') {
      setParams(DEFAULT_PARAMETERS_1_TO_10);
    } else {
      setParams(DEFAULT_PARAMETERS_1_TO_1);
    }
  };

  // Handle Auto-Sizing Application
  const handleApplyAutoSizing = (rec: SizingRecommendation) => {
    setParams((prev) => ({
      ...prev,
      pv_peak_kw: rec.pv_peak_kw,
      mppt_max_kw: rec.mppt_power_kw,
      bess_cap_kwh: rec.bess_capacity_kwh,
      bess_dis_max_kw: rec.bess_bidirectional_dcdc_kw,
      bess_chg_max_kw: rec.bess_bidirectional_dcdc_kw * 0.8,
      elec_rated_kw: rec.elec_rated_kw,
      fc_rated_kw: rec.fc_rated_kw,
      tank_volume_m3: rec.tank_volume_l / 1000.0,
      tank_p_max_bar: rec.tank_pressure_bar,
    }));
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#080d17] text-slate-100 font-sans select-none overflow-hidden">
      {/* Top Application Header Bar */}
      <header className="h-10 bg-[#0a0f1b] border-b border-slate-800 px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-xs font-bold font-mono tracking-wider text-slate-100 uppercase flex items-center gap-1.5">
                <span>Hybrid DC Microgrid & P2H2P Simulation Workbench</span>
                <span className="text-[10px] text-cyan-400 font-normal px-1.5 py-0.2 rounded bg-cyan-950/60 border border-cyan-800/40">
                  v2.4
                </span>
              </h1>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 text-[11px] font-mono text-slate-400 pl-2 border-l border-slate-800">
            <span>48V DC Bus</span>
            <span className="text-slate-600">•</span>
            <span>16S LiFePO4</span>
            <span className="text-slate-600">•</span>
            <span>PEM Electrolyzer</span>
            <span className="text-slate-600">•</span>
            <span>PEMFC Range-Extender</span>
          </div>
        </div>

        {/* Right Status & Quick Action Badges */}
        <div className="flex items-center gap-3 font-mono text-xs">
          {/* Active Preset Tag */}
          <div className="hidden sm:flex items-center gap-1.5 bg-[#121929] px-2.5 py-0.5 rounded border border-slate-700/80 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span className="text-slate-300 font-semibold truncate max-w-[200px]">
              {customDatasetActive
                ? `Custom: ${customDatasetName}`
                : PRESET_SCENARIOS.find((p) => p.id === activePresetId)?.name || 'Dataset'}
            </span>
            <span className="text-slate-500">({inputSteps.length} pts)</span>
          </div>

          {/* Solver Performance Chip */}
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] bg-[#101726] px-2 py-0.5 rounded border border-slate-800">
            <Activity className="w-3 h-3 text-emerald-400" />
            <span>Solver:</span>
            <strong className="text-emerald-300">{solverExecutionTimeMs} ms</strong>
          </div>

          {/* Scale Tag */}
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
              params.scale === '1:1'
                ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/50'
                : 'bg-amber-950/80 text-amber-300 border border-amber-500/50'
            }`}
          >
            Scale {params.scale}
          </span>

          {/* Auto-Size Action */}
          <button
            onClick={() => setIsAutoSizingOpen(true)}
            className="flex items-center gap-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs px-2.5 py-1 rounded shadow transition"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Auto-Size</span>
          </button>
        </div>
      </header>

      {/* Top KPI & Energy Audit Ribbon */}
      <KpiAuditRibbon summary={summary} />

      {/* Main Center Area: Left Sidebar + Plots + Bottom Inspector */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Parameter Control Matrix */}
        <ParameterMatrixSidebar
          params={params}
          onChangeParams={setParams}
          activePresetId={activePresetId}
          onSelectPreset={handleSelectPreset}
          presets={PRESET_SCENARIOS}
          onOpenAutoSizer={() => setIsAutoSizingOpen(true)}
          onOpenDiagram={() =>
            setDiagramModal({
              isOpen: true,
              imageSrc: '/diagrams/media_1793685530871_13054513.jpg',
              title: 'Hybrid DC Microgrid Architecture & Single-Line Diagram',
              description:
                'Five branch common 48V DC bus microgrid with solar MPPT, BESS, PEM Electrolyzer, PEM Fuel Cell, and Programmable DC Load.',
            })
          }
          onResetDefaults={handleResetDefaults}
          autoRecompute={autoRecompute}
          onToggleAutoRecompute={setAutoRecompute}
        />

        {/* Center Main Stage: Synchronized 4-Track Plots & Bottom Inspector */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Synchronized 4-Track Engineering Plots */}
          <SynchronizedPlots data={outputSteps} params={params} />

          {/* Bottom Tabbed Inspector (Data Table, Custom CSV, BoM, Architecture, Benchmark) */}
          <BottomInspectorTabs
            data={outputSteps}
            params={params}
            summary={summary}
            onLoadCustomDataset={handleLoadCustomDataset}
            onOpenDiagramModal={() =>
              setDiagramModal({
                isOpen: true,
                imageSrc: '/diagrams/media_1793685530871_13054513.jpg',
                title: 'Hybrid DC Microgrid Single-Line Diagram & Instrumentation',
                description:
                  'Five branches governed by central DAQ supervisory controller and switchgear protection.',
              })
            }
          />
        </main>
      </div>

      {/* Modals */}
      <AutoSizingModal
        isOpen={isAutoSizingOpen}
        onClose={() => setIsAutoSizingOpen(false)}
        inputs={inputSteps}
        currentParams={params}
        onApplyRecommendation={handleApplyAutoSizing}
      />

      <SystemDiagramModal
        isOpen={diagramModal.isOpen}
        onClose={() => setDiagramModal((prev) => ({ ...prev, isOpen: false }))}
        imageSrc={diagramModal.imageSrc}
        title={diagramModal.title}
        description={diagramModal.description}
      />
    </div>
  );
}
