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
import { InteractiveSystemFlowDiagram } from './src/components/InteractiveSystemFlowDiagram';
import { BottomInspectorTabs } from './src/components/BottomInspectorTabs';
import { AutoSizingModal } from './src/components/AutoSizingModal';
import { SystemDiagramModal } from './src/components/SystemDiagramModal';
import {
  Activity,
  Columns,
  Cpu,
  Download,
  Flame,
  Layers,
  LineChart,
  Menu,
  Play,
  RotateCcw,
  Sliders,
  Sparkles,
  Wand2,
  X,
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

  // Active Selected Step for Synchronized Scrubbing
  const [activeStep, setActiveStep] = useState<TimeSeriesOutputStep | null>(null);

  // Main Stage View Mode: 'flow' (Visual Line Diagram) | 'plots' (Canvas Plots) | 'split' (Both)
  const [mainViewMode, setMainViewMode] = useState<'flow' | 'plots' | 'split'>('flow');

  // Mobile drawer state
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

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

        // Keep active step in sync (default to midday solar peak on initial load so diagram is alive)
        if (result.steps.length > 0) {
          setActiveStep((prev) => {
            if (!prev) {
              const middayStep = result.steps.find((s) => s.hour >= 12.0 && s.p_pv_bus_kw > 0);
              return middayStep || result.steps[Math.floor(result.steps.length / 2)] || result.steps[0];
            }
            const found = result.steps.find((s) => s.step === prev.step);
            return found || result.steps[0];
          });
        }
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
      setActiveStep(null);
    } else if (params.scale === '1:10') {
      setParams({
        ...DEFAULT_PARAMETERS_1_TO_1,
      });
      setActiveStep(null);
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

  const handleScaleLoad = (multiplier: number) => {
    setInputSteps((prev) =>
      prev.map((s) => ({
        ...s,
        p_load_kw: Math.round(s.p_load_kw * multiplier * 1000) / 1000,
      }))
    );
  };

  const handleSelectStepIndex = (index: number) => {
    if (outputSteps[index]) {
      setActiveStep(outputSteps[index]);
    }
  };

  return (
    <div className="min-h-screen lg:h-screen w-full flex flex-col bg-[#080d17] text-slate-100 font-sans overflow-x-hidden lg:overflow-hidden">
      {/* Top Application Header Bar */}
      <header className="min-h-11 bg-[#0a0f1b] border-b border-slate-800 px-3 sm:px-4 py-1.5 flex flex-wrap items-center justify-between flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mobile Sidebar Hamburger Toggle */}
          <button
            onClick={() => setIsMobileSidebarOpen(true)}
            className="lg:hidden p-1.5 bg-[#141e33] hover:bg-[#1d2d4c] rounded border border-slate-700 text-slate-300 transition flex items-center gap-1 text-xs"
            title="Open Parameters"
          >
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span className="text-[11px] font-mono">Params</span>
          </button>

          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-xs font-bold font-mono tracking-wider text-slate-100 uppercase flex items-center gap-1.5">
                <span className="truncate max-w-[200px] sm:max-w-none">
                  Hybrid DC Microgrid & P2H2P Workbench
                </span>
                <span className="text-[10px] text-cyan-400 font-normal px-1.5 py-0.2 rounded bg-cyan-950/60 border border-cyan-800/40">
                  v2.5
                </span>
              </h1>
            </div>
          </div>

          <div className="hidden xl:flex items-center gap-2 text-[11px] font-mono text-slate-400 pl-2 border-l border-slate-800">
            <span>48V DC Bus</span>
            <span className="text-slate-600">•</span>
            <span>16S LiFePO4</span>
            <span className="text-slate-600">•</span>
            <span>PEM Electrolyzer</span>
            <span className="text-slate-600">•</span>
            <span>PEMFC</span>
          </div>
        </div>

        {/* Center / Right Stage View Switcher & Action Badges */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 font-mono text-xs">
          {/* View Mode Switcher */}
          <div className="flex items-center bg-[#101726] p-0.5 rounded border border-slate-700 text-[11px]">
            <button
              onClick={() => setMainViewMode('flow')}
              className={`px-2.5 py-1 rounded transition flex items-center gap-1 font-bold ${
                mainViewMode === 'flow'
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Show Visual Line Diagram with Power (V, A, W DC) & Material Flow"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>Flow Diagram</span>
            </button>

            <button
              onClick={() => setMainViewMode('plots')}
              className={`px-2.5 py-1 rounded transition flex items-center gap-1 font-bold ${
                mainViewMode === 'plots'
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Show 4-Track Synchronized Canvas Engineering Plots"
            >
              <LineChart className="w-3.5 h-3.5 text-emerald-400" />
              <span>Plots</span>
            </button>

            <button
              onClick={() => setMainViewMode('split')}
              className={`hidden md:flex items-center gap-1 px-2.5 py-1 rounded transition font-bold ${
                mainViewMode === 'split'
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Show Both Flow Diagram & Synchronized Plots Stacked"
            >
              <Columns className="w-3.5 h-3.5 text-purple-400" />
              <span>Split</span>
            </button>
          </div>

          {/* Active Preset Tag */}
          <div className="hidden sm:flex items-center gap-1.5 bg-[#121929] px-2.5 py-1 rounded border border-slate-700/80 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span className="text-slate-300 font-semibold truncate max-w-[150px]">
              {customDatasetActive
                ? `Custom: ${customDatasetName}`
                : PRESET_SCENARIOS.find((p) => p.id === activePresetId)?.name || 'Dataset'}
            </span>
          </div>

          {/* Scale Tag */}
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
              params.scale === '1:1'
                ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/50'
                : 'bg-amber-950/80 text-amber-300 border border-amber-500/50'
            }`}
          >
            {params.scale}
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

      {/* Main Center Area: Left Sidebar (Desktop) + Main Stage + Bottom Inspector */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
        {/* Left Sidebar: Parameter Control Matrix (Desktop Docked) */}
        <div className="hidden lg:block h-full">
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
        </div>

        {/* Center Main Stage */}
        <main className="flex-1 flex flex-col overflow-y-auto lg:overflow-hidden min-w-0">
          {/* Main Visual Display: Based on viewMode */}
          <div className="flex-1 flex flex-col overflow-y-auto lg:overflow-hidden min-h-[380px]">
            {mainViewMode === 'flow' ? (
              // 1. VISUAL LINE DIAGRAM: Dynamic Directional Flow Schematic
              <div className="flex-1 w-full h-full min-h-[460px] p-1 bg-[#060a12] flex flex-col overflow-hidden">
                <InteractiveSystemFlowDiagram
                  currentStep={activeStep}
                  allSteps={outputSteps}
                  params={params}
                  onSelectStepIndex={handleSelectStepIndex}
                  onChangeParams={setParams}
                  onScaleLoad={handleScaleLoad}
                  onToggleFullscreen={() =>
                    setDiagramModal({
                      isOpen: true,
                      imageSrc: '/diagrams/media_1793685530871_13054513.jpg',
                      title: 'Hybrid DC Microgrid Architecture & Single-Line Diagram',
                      description:
                        'Five branch common 48V DC bus microgrid with solar MPPT, BESS, PEM Electrolyzer, PEM Fuel Cell, and Programmable DC Load.',
                    })
                  }
                />
              </div>
            ) : mainViewMode === 'plots' ? (
              // 2. SYNCHRONIZED 4-TRACK PLOTS
              <div className="flex-1 w-full h-full min-h-[420px] flex flex-col overflow-hidden">
                <SynchronizedPlots
                  data={outputSteps}
                  params={params}
                  onHoverStep={setActiveStep}
                />
              </div>
            ) : (
              // 3. SPLIT VIEW: Both Flow Diagram & Synchronized Plots
              <div className="flex-1 flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-slate-800 overflow-y-auto lg:overflow-hidden">
                <div className="flex-1 min-h-[380px] h-full p-1 bg-[#060a12]">
                  <InteractiveSystemFlowDiagram
                    currentStep={activeStep}
                    allSteps={outputSteps}
                    params={params}
                    onSelectStepIndex={handleSelectStepIndex}
                    onChangeParams={setParams}
                    onScaleLoad={handleScaleLoad}
                  />
                </div>
                <div className="flex-1 min-h-[380px] h-full flex flex-col">
                  <SynchronizedPlots
                    data={outputSteps}
                    params={params}
                    onHoverStep={setActiveStep}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Bottom Tabbed Inspector (Data Table, Custom CSV, BoM, Architecture, Benchmark) */}
          <BottomInspectorTabs
            data={outputSteps}
            params={params}
            summary={summary}
            onLoadCustomDataset={handleLoadCustomDataset}
            activeStep={activeStep}
            onSelectStepIndex={handleSelectStepIndex}
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

      {/* Mobile Drawer for Parameter Matrix Sidebar */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          <div className="relative w-80 max-w-[85vw] h-full bg-[#0e1626] z-10 shadow-2xl flex flex-col">
            <ParameterMatrixSidebar
              params={params}
              onChangeParams={setParams}
              activePresetId={activePresetId}
              onSelectPreset={(p) => {
                handleSelectPreset(p);
                setIsMobileSidebarOpen(false);
              }}
              presets={PRESET_SCENARIOS}
              onOpenAutoSizer={() => {
                setIsAutoSizingOpen(true);
                setIsMobileSidebarOpen(false);
              }}
              onOpenDiagram={() => {
                setDiagramModal({
                  isOpen: true,
                  imageSrc: '/diagrams/media_1793685530871_13054513.jpg',
                  title: 'Hybrid DC Microgrid Architecture & Single-Line Diagram',
                  description:
                    'Five branch common 48V DC bus microgrid with solar MPPT, BESS, PEM Electrolyzer, PEM Fuel Cell, and Programmable DC Load.',
                });
                setIsMobileSidebarOpen(false);
              }}
              onResetDefaults={handleResetDefaults}
              autoRecompute={autoRecompute}
              onToggleAutoRecompute={setAutoRecompute}
              onCloseMobile={() => setIsMobileSidebarOpen(false)}
            />
          </div>
        </div>
      )}

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
        currentStep={activeStep}
        allSteps={outputSteps}
        params={params}
        onSelectStepIndex={handleSelectStepIndex}
      />
    </div>
  );
}
