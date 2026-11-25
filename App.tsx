import React, { useState, useEffect, useCallback } from 'react';
import {
  ImportedLoadProfile,
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
import { inferDtHoursFromSteps, runSimulation } from './src/simulation/simulationEngine';
import { KpiAuditRibbon } from './src/components/KpiAuditRibbon';
import { ParameterMatrixSidebar } from './src/components/ParameterMatrixSidebar';
import { SynchronizedPlots } from './src/components/SynchronizedPlots';
import { InteractiveSystemFlowDiagram } from './src/components/InteractiveSystemFlowDiagram';
import { BottomInspectorTabs } from './src/components/BottomInspectorTabs';
import { AutoSizingModal } from './src/components/AutoSizingModal';
import { SystemDiagramModal } from './src/components/SystemDiagramModal';
import { CsvLoadProfileImporter } from './src/components/CsvLoadProfileImporter';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Gauge,
  LineChart,
  Sliders,
  Table,
  UploadCloud,
  Wand2,
  Zap,
} from 'lucide-react';

type AppScreen = 'flow' | 'parameters' | 'plots' | 'inspector' | 'kpi' | 'csv' | 'autosize';

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
  const [datasetDtHours, setDatasetDtHours] = useState<number>(0.25);
  const [importedProfiles, setImportedProfiles] = useState<ImportedLoadProfile[]>([]);

  // Simulation Results State
  const [outputSteps, setOutputSteps] = useState<TimeSeriesOutputStep[]>([]);
  const [summary, setSummary] = useState<SimulationSummary | null>(null);
  const [solverExecutionTimeMs, setSolverExecutionTimeMs] = useState<number>(0);
  const [autoRecompute, setAutoRecompute] = useState<boolean>(true);

  // Active Selected Step for Synchronized Scrubbing
  const [activeStep, setActiveStep] = useState<TimeSeriesOutputStep | null>(null);

  // Dedicated Individual Screen Router State
  const [activeScreen, setActiveScreen] = useState<AppScreen>('flow');

  // Live Flow Fullscreen State
  const [isLiveFlowFullscreen, setIsLiveFlowFullscreen] = useState<boolean>(false);

  // Architecture SLD Modal State
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
    (steps: TimeSeriesInputStep[], currentParams: SystemParameters, dtHint?: number) => {
      const tStart = performance.now();
      try {
        const dt = dtHint && dtHint > 0 ? dtHint : inferDtHoursFromSteps(steps, 0.25);
        const validDt = dt > 0 && dt <= 24.0 ? dt : 0.25;
        const result = runSimulation(steps, currentParams, validDt);
        const tEnd = performance.now();

        setOutputSteps(result.steps);
        setSummary(result.summary);
        setSolverExecutionTimeMs(Math.round((tEnd - tStart) * 100) / 100);

        // Keep active step in sync (preserve matching hour across different dataset resolutions, or default to midday peak)
        if (result.steps.length > 0) {
          setActiveStep((prev) => {
            if (!prev) {
              const middayStep = result.steps.find((s) => s.hour >= 12.0 && s.p_pv_bus_kw > 0);
              return middayStep || result.steps[Math.floor(result.steps.length / 2)] || result.steps[0];
            }
            const found = result.steps.find((s) => s.step === prev.step);
            if (found && Math.abs(found.hour - prev.hour) < 0.01) {
              return found;
            }
            let nearest = result.steps[0];
            let minDiff = Math.abs(nearest.hour - prev.hour);
            for (const s of result.steps) {
              const diff = Math.abs(s.hour - prev.hour);
              if (diff < minDiff) {
                minDiff = diff;
                nearest = s;
              }
            }
            return nearest;
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
      executeSimulation(inputSteps, params, datasetDtHours);
    }
  }, [inputSteps, params, datasetDtHours, autoRecompute, executeSimulation]);

  // Handle Preset Switching
  const handleSelectPreset = (presetId: string) => {
    setActivePresetId(presetId);
    setCustomDatasetActive(false);

    const preset = PRESET_SCENARIOS.find((p) => p.id === presetId);
    if (!preset) return;

    const newSteps = preset.generator();
    setDatasetDtHours(preset.dt_hours);
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

  // Handle Custom Dataset Ingestion (and store in importedProfiles switcher)
  const handleLoadCustomDataset = (steps: TimeSeriesInputStep[], name: string, dtHours?: number) => {
    const resolvedDt = dtHours && dtHours > 0 ? dtHours : inferDtHoursFromSteps(steps, 0.25);
    const peakKw = steps.length > 0 ? Math.max(...steps.map((s) => s.p_load_kw)) : 0;
    const sumKw = steps.reduce((acc, s) => acc + s.p_load_kw, 0);
    const avgKw = steps.length > 0 ? sumKw / steps.length : 0;
    const totalHours = steps.length * resolvedDt;
    const dailyKwh = (sumKw * resolvedDt) / (totalHours >= 23.5 ? totalHours / 24.0 : 1.0);

    setImportedProfiles((prev) => {
      const existingIdx = prev.findIndex((p) => p.name === name);
      const entry: ImportedLoadProfile = {
        id: existingIdx >= 0 ? prev[existingIdx].id : `csv-${Date.now()}`,
        name,
        steps,
        dt_hours: resolvedDt,
        peak_kw: peakKw,
        avg_kw: avgKw,
        daily_kwh: dailyKwh,
        source_rows: steps.length,
      };
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = entry;
        return next;
      }
      return [entry, ...prev];
    });

    setCustomDatasetActive(true);
    setCustomDatasetName(name);
    setDatasetDtHours(resolvedDt);
    setInputSteps(steps);
    setActiveStep(null);
  };

  // Switch between previously imported CSV load profiles
  const handleSelectImportedProfile = (profileId: string) => {
    const prof = importedProfiles.find((p) => p.id === profileId);
    if (!prof) return;
    setCustomDatasetActive(true);
    setCustomDatasetName(prof.name);
    setDatasetDtHours(prof.dt_hours);
    setInputSteps(prof.steps);
    setActiveStep(null);
  };

  const handleOpenCsvImporter = () => {
    setActiveScreen('csv');
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

  const navButtons: Array<{
    id: AppScreen;
    label: string;
    icon: React.ReactNode;
    accentClass: string;
  }> = [
    {
      id: 'flow',
      label: 'Visual Simulator',
      icon: <Zap className="w-3.5 h-3.5 text-amber-300" />,
      accentClass: 'bg-cyan-600 text-white border-cyan-400 shadow-cyan-900/40',
    },
    {
      id: 'parameters',
      label: 'Parameter Matrix',
      icon: <Sliders className="w-3.5 h-3.5 text-cyan-300" />,
      accentClass: 'bg-cyan-600 text-white border-cyan-400 shadow-cyan-900/40',
    },
    {
      id: 'plots',
      label: 'Engineering Plots',
      icon: <LineChart className="w-3.5 h-3.5 text-emerald-300" />,
      accentClass: 'bg-cyan-600 text-white border-cyan-400 shadow-cyan-900/40',
    },
    {
      id: 'inspector',
      label: 'Inspector & Telemetry Logs',
      icon: <Table className="w-3.5 h-3.5 text-sky-300" />,
      accentClass: 'bg-cyan-600 text-white border-cyan-400 shadow-cyan-900/40',
    },
    {
      id: 'kpi',
      label: 'KPI & Energy Audit',
      icon: <Gauge className="w-3.5 h-3.5 text-purple-300" />,
      accentClass: 'bg-cyan-600 text-white border-cyan-400 shadow-cyan-900/40',
    },
    {
      id: 'csv',
      label: 'Import Load CSV',
      icon: <UploadCloud className="w-3.5 h-3.5 text-emerald-300" />,
      accentClass: 'bg-emerald-600 text-white border-emerald-400 shadow-emerald-900/40',
    },
    {
      id: 'autosize',
      label: 'Auto-Sizer',
      icon: <Wand2 className="w-3.5 h-3.5 text-amber-200" />,
      accentClass: 'bg-blue-600 text-white border-blue-400 shadow-blue-900/40',
    },
  ];

  const openSldModal = () =>
    setDiagramModal({
      isOpen: true,
      imageSrc: '/diagrams/media_1793685530871_13054513.jpg',
      title: 'Hybrid DC Microgrid Architecture & Single-Line Diagram',
      description:
        'Five branch common 48V DC bus microgrid with solar MPPT, BESS, PEM Electrolyzer, PEM Fuel Cell, and Programmable DC Load.',
    });

  return (
    <div className="h-screen w-full flex flex-col bg-[#080d17] text-slate-100 font-sans overflow-hidden">
      {/* Top Application Header Bar */}
      <header className="bg-[#0a0f1b] border-b border-slate-800 flex-shrink-0">
        {/* Compact Brand + Live Micro-Status Strip */}
        <div className="px-3 sm:px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
              <Zap className="w-4 h-4" />
            </div>
            <h1 className="text-xs font-bold font-mono tracking-wider text-slate-100 uppercase flex items-center gap-1.5">
              <span className="truncate max-w-[200px] sm:max-w-none">
                Hybrid DC Microgrid & P2H2P Workbench
              </span>
              <span className="text-[10px] text-cyan-400 font-normal px-1.5 py-0.2 rounded bg-cyan-950/60 border border-cyan-800/40">
                v2.5
              </span>
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
            {/* Active Preset / CSV Tag */}
            <div className="flex items-center gap-1.5 bg-[#121929] px-2 py-0.5 rounded border border-slate-700/80">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              <span className="text-slate-300 font-semibold truncate max-w-[140px] sm:max-w-[200px]">
                {customDatasetActive
                  ? `CSV: ${customDatasetName}`
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

            {/* Compact Live Telemetry Pill */}
            {activeStep && (
              <div className="hidden md:flex items-center gap-2 bg-[#0f172a] px-2 py-0.5 rounded border border-slate-800 text-[10px] text-slate-400">
                <span>
                  V_bus: <strong className="text-amber-300">{activeStep.v_bus_v.toFixed(1)}V</strong>
                </span>
                <span>•</span>
                <span>
                  SoC: <strong className="text-emerald-300">{(activeStep.soc * 100).toFixed(0)}%</strong>
                </span>
                <span>•</span>
                <span>
                  H₂: <strong className="text-cyan-300">{activeStep.m_h2_tank_kg.toFixed(3)}kg</strong>
                </span>
                {summary && (
                  <>
                    <span>•</span>
                    <span className={summary.energy_conservation_pass ? 'text-emerald-400' : 'text-rose-400'}>
                      {summary.energy_conservation_pass ? 'Audit ✓' : 'Audit !'}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Dedicated Screen Switcher Button Bar */}
        <nav
          aria-label="Workspace Screens"
          className="px-3 sm:px-4 py-1.5 bg-[#070b13] flex items-center gap-1.5 overflow-x-auto whitespace-nowrap font-mono text-xs"
        >
          {navButtons.map((btn) => {
            const isActive = activeScreen === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => setActiveScreen(btn.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-[11px] font-bold transition flex-shrink-0 active:scale-95 ${
                  isActive
                    ? `${btn.accentClass} shadow`
                    : 'bg-[#101829] hover:bg-[#18243c] text-slate-300 hover:text-white border-slate-800'
                }`}
              >
                {btn.icon}
                <span>{btn.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Dedicated Single-Screen Viewport */}
      <main className="flex-1 flex flex-col overflow-hidden min-h-0">
        {activeScreen === 'flow' && (
          <div className="flex-1 w-full h-full p-1 bg-[#060a12] flex flex-col overflow-hidden">
            <InteractiveSystemFlowDiagram
              currentStep={activeStep}
              allSteps={outputSteps}
              params={params}
              dtHours={summary?.dt_hours ?? datasetDtHours}
              activeProfileName={
                customDatasetActive
                  ? customDatasetName
                  : PRESET_SCENARIOS.find((p) => p.id === activePresetId)?.name
              }
              importedProfiles={importedProfiles}
              onSelectStepIndex={handleSelectStepIndex}
              onChangeParams={setParams}
              onScaleLoad={handleScaleLoad}
              onLoadCustomDataset={handleLoadCustomDataset}
              onSelectImportedProfile={handleSelectImportedProfile}
              onOpenCsvImporter={handleOpenCsvImporter}
              isFullscreen={isLiveFlowFullscreen}
              onToggleFullscreen={() => setIsLiveFlowFullscreen((prev) => !prev)}
            />
          </div>
        )}

        {activeScreen === 'parameters' && (
          <div className="flex-1 w-full h-full flex flex-col overflow-hidden">
            <ParameterMatrixSidebar
              fullPage={true}
              params={params}
              onChangeParams={setParams}
              activePresetId={activePresetId}
              onSelectPreset={handleSelectPreset}
              presets={PRESET_SCENARIOS}
              onOpenAutoSizer={() => setActiveScreen('autosize')}
              onOpenDiagram={openSldModal}
              onResetDefaults={handleResetDefaults}
              autoRecompute={autoRecompute}
              onToggleAutoRecompute={setAutoRecompute}
              customDatasetActive={customDatasetActive}
              customDatasetName={customDatasetName}
              importedProfiles={importedProfiles}
              onSelectImportedProfile={handleSelectImportedProfile}
              onOpenCsvImporter={handleOpenCsvImporter}
            />
          </div>
        )}

        {activeScreen === 'plots' && (
          <div className="flex-1 w-full h-full flex flex-col overflow-hidden">
            <SynchronizedPlots
              data={outputSteps}
              params={params}
              onHoverStep={setActiveStep}
            />
          </div>
        )}

        {activeScreen === 'inspector' && (
          <div className="flex-1 w-full h-full flex flex-col overflow-hidden">
            <BottomInspectorTabs
              fullPage={true}
              data={outputSteps}
              params={params}
              summary={summary}
              onLoadCustomDataset={handleLoadCustomDataset}
              activeStep={activeStep}
              onSelectStepIndex={handleSelectStepIndex}
              activeProfileName={customDatasetActive ? customDatasetName : undefined}
              importedProfiles={importedProfiles}
              onSelectImportedProfile={handleSelectImportedProfile}
              onOpenDiagramModal={openSldModal}
            />
          </div>
        )}

        {activeScreen === 'kpi' && (
          <div className="flex-1 w-full h-full overflow-y-auto bg-[#080d17] font-mono">
            <KpiAuditRibbon summary={summary} />

            {/* Extended Energy, Mass & Telemetry Audit Summary Screen */}
            <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                    System Energy, Mass & Solver Telemetry Breakdown
                  </h2>
                </div>
                <span className="text-[11px] text-slate-400">
                  Solver Runtime: <strong className="text-cyan-300">{solverExecutionTimeMs} ms</strong>
                </span>
              </div>

              {summary && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Electrical Conservation Card */}
                  <div className="bg-[#0e1626] border border-slate-800 rounded-lg p-4 space-y-2">
                    <h3 className="text-amber-300 font-bold uppercase text-[11px] tracking-wider">
                      Electrical Bus Balance (DC)
                    </h3>
                    <div className="space-y-1 text-slate-300">
                      <div className="flex justify-between">
                        <span className="text-slate-400">PV Harvested:</span>
                        <span>{summary.total_pv_gen_kwh.toFixed(2)} kWh</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Load Served:</span>
                        <span>{(summary.total_load_demand_kwh - summary.total_unserved_kwh).toFixed(2)} kWh</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Unserved Load:</span>
                        <span className={summary.total_unserved_kwh > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                          {summary.total_unserved_kwh.toFixed(3)} kWh
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Solar Curtailed:</span>
                        <span className="text-amber-300">{summary.total_curtailed_kwh.toFixed(2)} kWh</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-800 pt-1">
                        <span className="text-slate-400">Bus Residual (ΔE):</span>
                        <span className={summary.energy_conservation_pass ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                          {summary.energy_conservation_residual_kwh.toExponential(2)} kWh
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Hydrogen Loop & Thermal Card */}
                  <div className="bg-[#0e1626] border border-slate-800 rounded-lg p-4 space-y-2">
                    <h3 className="text-cyan-300 font-bold uppercase text-[11px] tracking-wider">
                      Hydrogen & Thermal Ledger
                    </h3>
                    <div className="space-y-1 text-slate-300">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Electrolyzer Input:</span>
                        <span>{summary.elec_total_input_kwh.toFixed(2)} kWh</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">H₂ Produced:</span>
                        <span className="text-cyan-300">{summary.total_h2_prod_kg.toFixed(4)} kg</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Fuel Cell Consumed:</span>
                        <span>{summary.total_h2_cons_kg.toFixed(4)} kg</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Tank Volume / Class:</span>
                        <span>{Math.round(summary.tank_volume_liters)} L @ {summary.tank_pressure_class_bar} bar</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-800 pt-1">
                        <span className="text-slate-400">Peak Pressure:</span>
                        <span className="text-sky-300 font-bold">{summary.peak_tank_pressure_bar.toFixed(2)} bar</span>
                      </div>
                    </div>
                  </div>

                  {/* Active Step Instantaneous Snapshot */}
                  <div className="bg-[#0e1626] border border-slate-800 rounded-lg p-4 space-y-2">
                    <h3 className="text-emerald-300 font-bold uppercase text-[11px] tracking-wider">
                      Active Step Snapshot ({activeStep?.timestamp || '--'})
                    </h3>
                    {activeStep ? (
                      <div className="space-y-1 text-slate-300">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Dispatch State:</span>
                          <span className="text-cyan-300 font-bold">
                            State {activeStep.state} (
                            {activeStep.state === 1
                              ? 'BESS Chg'
                              : activeStep.state === 2
                              ? 'H₂ Prod'
                              : activeStep.state === 3
                              ? 'BESS Dis'
                              : 'FC Extender'}
                            )
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Bus Voltage:</span>
                          <span>{activeStep.v_bus_v.toFixed(2)} V DC</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">PV / Load:</span>
                          <span>{activeStep.p_pv_bus_kw.toFixed(2)} / {activeStep.p_load_kw.toFixed(2)} kW</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Elec / FC Power:</span>
                          <span>{activeStep.p_elec_bus_kw.toFixed(2)} / {activeStep.p_fc_bus_kw.toFixed(2)} kW</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-800 pt-1">
                          <span className="text-slate-400">KCL Current Residual:</span>
                          <span className="text-emerald-400 font-bold">{activeStep.kcl_residual_a.toFixed(4)} A</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-500">No simulation step selected.</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveScreen('flow')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white rounded font-bold transition"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Open Visual Simulator</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveScreen('inspector')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#131d31] hover:bg-[#1a2742] text-slate-200 border border-slate-700 rounded font-bold transition"
                >
                  <Table className="w-3.5 h-3.5 text-sky-400" />
                  <span>Inspect Telemetry Data Table</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeScreen === 'csv' && (
          <div className="flex-1 w-full h-full overflow-y-auto bg-[#080d17] p-3 sm:p-5 font-mono text-xs">
            <div className="max-w-5xl mx-auto bg-[#0b101c] border border-cyan-500/30 rounded-lg shadow-xl flex flex-col overflow-hidden">
              <div className="px-4 py-3 bg-[#070b13] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <UploadCloud className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-bold text-cyan-300 uppercase tracking-wider">
                    Import Daily Load Profile (CSV: Active Power vs Time in Hours)
                  </h2>
                </div>
                {customDatasetActive && (
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-[11px] text-emerald-300 bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Active: {customDatasetName}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveScreen('flow')}
                      className="flex items-center gap-1 px-2.5 py-1 bg-cyan-700 hover:bg-cyan-600 text-white font-bold rounded text-[11px] transition"
                    >
                      <span>View in Visual Simulator</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              <div className="p-3 sm:p-4">
                <CsvLoadProfileImporter
                  variant="full"
                  systemScale={params.scale}
                  activeProfileName={customDatasetActive ? customDatasetName : undefined}
                  importedProfiles={importedProfiles}
                  onApplyProfile={(steps, name, dt) => {
                    handleLoadCustomDataset(steps, name, dt);
                  }}
                  onSelectExistingProfile={(id) => {
                    handleSelectImportedProfile(id);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {activeScreen === 'autosize' && (
          <AutoSizingModal
            fullPage={true}
            isOpen={true}
            onClose={() => setActiveScreen('flow')}
            inputs={inputSteps}
            currentParams={params}
            onApplyRecommendation={handleApplyAutoSizing}
          />
        )}
      </main>

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
