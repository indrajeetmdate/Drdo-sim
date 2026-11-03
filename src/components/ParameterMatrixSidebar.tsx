import React, { useState } from 'react';
import { SystemParameters, PresetScenario } from '../types/microgrid';
import {
  Battery,
  ChevronDown,
  ChevronRight,
  Cpu,
  Flame,
  Gauge,
  RotateCcw,
  Sliders,
  Sun,
  Wand2,
  Zap,
} from 'lucide-react';

interface Props {
  params: SystemParameters;
  onChangeParams: (newParams: SystemParameters) => void;
  activePresetId: string;
  onSelectPreset: (presetId: string) => void;
  presets: PresetScenario[];
  onOpenAutoSizer: () => void;
  onOpenDiagram: () => void;
  onResetDefaults: () => void;
  autoRecompute: boolean;
  onToggleAutoRecompute: (val: boolean) => void;
}

export const ParameterMatrixSidebar: React.FC<Props> = ({
  params,
  onChangeParams,
  activePresetId,
  onSelectPreset,
  presets,
  onOpenAutoSizer,
  onOpenDiagram,
  onResetDefaults,
  autoRecompute,
  onToggleAutoRecompute,
}) => {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    solar: false,
    bess: false,
    electrolyzer: false,
    fuelcell: false,
    control: false,
  });

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const updateNumeric = (key: keyof SystemParameters, val: number) => {
    onChangeParams({
      ...params,
      [key]: val,
    });
  };

  return (
    <aside className="w-80 flex-shrink-0 bg-[#0e1626] border-r border-slate-800 flex flex-col h-full text-slate-200 select-none overflow-hidden">
      {/* Sidebar Header & Scenario Selector */}
      <div className="p-3 bg-[#0a0f1b] border-b border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
              Parameter Matrix
            </span>
          </div>
          <button
            onClick={onResetDefaults}
            title="Reset to engineering defaults"
            className="text-slate-400 hover:text-slate-200 p-1 hover:bg-slate-800 rounded transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Preset Selector */}
        <div>
          <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-1">
            Active Dataset / Scenario
          </label>
          <select
            value={activePresetId}
            onChange={(e) => onSelectPreset(e.target.value)}
            className="w-full bg-[#131d31] border border-slate-700 rounded px-2 py-1.5 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Scale Toggle: 1:1 vs 1:10 */}
        <div className="flex items-center justify-between bg-[#131d31] p-1.5 rounded border border-slate-700/80">
          <span className="text-[11px] font-mono text-slate-300">System Scale</span>
          <div className="flex bg-[#0a0f1b] rounded p-0.5 border border-slate-800">
            <button
              onClick={() => {
                if (params.scale !== '1:1') {
                  onChangeParams({
                    ...params,
                    scale: '1:1',
                    pv_peak_kw: 12.0,
                    mppt_max_kw: 12.5,
                    bess_cap_kwh: 30.72,
                    bess_chg_max_kw: 6.0,
                    bess_dis_max_kw: 8.0,
                    elec_rated_kw: 5.0,
                    tank_volume_m3: 0.50,
                    tank_m_h2_init_kg: 0.40,
                    fc_rated_kw: 3.0,
                    fc_opt_setpoint_kw: 2.0,
                  });
                }
              }}
              className={`px-2 py-0.5 text-[10px] font-mono rounded transition ${
                params.scale === '1:1'
                  ? 'bg-cyan-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              1:1 Microgrid
            </button>
            <button
              onClick={() => {
                if (params.scale !== '1:10') {
                  onChangeParams({
                    ...params,
                    scale: '1:10',
                    pv_peak_kw: 1.2,
                    mppt_max_kw: 1.25,
                    bess_cap_kwh: 3.072,
                    bess_chg_max_kw: 0.6,
                    bess_dis_max_kw: 0.8,
                    elec_rated_kw: 0.5,
                    tank_volume_m3: 0.05,
                    tank_m_h2_init_kg: 0.04,
                    fc_rated_kw: 0.3,
                    fc_opt_setpoint_kw: 0.2,
                  });
                }
              }}
              className={`px-2 py-0.5 text-[10px] font-mono rounded transition ${
                params.scale === '1:10'
                  ? 'bg-amber-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              1:10 Benchtop
            </button>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <button
            onClick={onOpenAutoSizer}
            className="flex items-center justify-center gap-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs py-1.5 px-2 rounded shadow transition"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>Auto-Size</span>
          </button>
          <button
            onClick={onOpenDiagram}
            className="flex items-center justify-center gap-1.5 bg-[#1b263b] hover:bg-[#22314d] text-slate-200 font-semibold text-xs py-1.5 px-2 rounded border border-slate-700 transition"
          >
            <Cpu className="w-3.5 h-3.5 text-amber-400" />
            <span>SLD Circuit</span>
          </button>
        </div>
      </div>

      {/* Scrollable Parameter Inputs */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 font-mono text-xs custom-scrollbar">
        {/* Branch 1: Weather & Solar PV Array */}
        <div className="border border-slate-800 rounded bg-[#0b101c] overflow-hidden">
          <button
            onClick={() => toggleSection('solar')}
            className="w-full flex items-center justify-between px-2.5 py-2 bg-[#121929] hover:bg-[#162035] text-left text-amber-400 font-bold transition"
          >
            <div className="flex items-center gap-1.5">
              <Sun className="w-3.5 h-3.5" />
              <span className="text-[11px] uppercase tracking-wide">1. Solar PV & MPPT</span>
            </div>
            {collapsedSections.solar ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
          {!collapsedSections.solar && (
            <div className="p-2.5 space-y-2 text-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">P_pv_peak [kWp]:</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="100"
                  value={params.pv_peak_kw}
                  onChange={(e) => updateNumeric('pv_peak_kw', parseFloat(e.target.value) || 0)}
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-amber-300 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">P_mppt_max [kW]:</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="100"
                  value={params.mppt_max_kw}
                  onChange={(e) => updateNumeric('mppt_max_kw', parseFloat(e.target.value) || 0)}
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-amber-300 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">NOCT [°C]:</span>
                <input
                  type="number"
                  step="0.5"
                  value={params.noct_c}
                  onChange={(e) => updateNumeric('noct_c', parseFloat(e.target.value) || 45)}
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-slate-300 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">γ_T Temp Coeff [%/°C]:</span>
                <input
                  type="number"
                  step="0.01"
                  value={Math.round(params.gamma_t * 10000) / 100}
                  onChange={(e) =>
                    updateNumeric('gamma_t', (parseFloat(e.target.value) || -0.38) / 100.0)
                  }
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-slate-300 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">η_mppt [%]:</span>
                <input
                  type="number"
                  step="0.1"
                  min="80"
                  max="100"
                  value={Math.round(params.eta_mppt * 1000) / 10}
                  onChange={(e) =>
                    updateNumeric('eta_mppt', (parseFloat(e.target.value) || 98) / 100.0)
                  }
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-slate-300 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>
          )}
        </div>

        {/* Branch 3: LiFePO4 BESS */}
        <div className="border border-slate-800 rounded bg-[#0b101c] overflow-hidden">
          <button
            onClick={() => toggleSection('bess')}
            className="w-full flex items-center justify-between px-2.5 py-2 bg-[#121929] hover:bg-[#162035] text-left text-emerald-400 font-bold transition"
          >
            <div className="flex items-center gap-1.5">
              <Battery className="w-3.5 h-3.5" />
              <span className="text-[11px] uppercase tracking-wide">2. 16S LiFePO4 BESS</span>
            </div>
            {collapsedSections.bess ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
          {!collapsedSections.bess && (
            <div className="p-2.5 space-y-2 text-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">E_bess_cap [kWh]:</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  value={params.bess_cap_kwh}
                  onChange={(e) => updateNumeric('bess_cap_kwh', parseFloat(e.target.value) || 1)}
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-emerald-300 focus:outline-none focus:border-emerald-400"
                />
              </div>
              <div className="text-[10px] text-slate-500 text-right">
                ≈ {Math.round((params.bess_cap_kwh * 1000) / 51.2)} Ah @ 51.2V
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">P_chg_max [kW]:</span>
                <input
                  type="number"
                  step="0.1"
                  value={params.bess_chg_max_kw}
                  onChange={(e) => updateNumeric('bess_chg_max_kw', parseFloat(e.target.value) || 0)}
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-emerald-300 focus:outline-none focus:border-emerald-400"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">P_dis_max [kW]:</span>
                <input
                  type="number"
                  step="0.1"
                  value={params.bess_dis_max_kw}
                  onChange={(e) => updateNumeric('bess_dis_max_kw', parseFloat(e.target.value) || 0)}
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-emerald-300 focus:outline-none focus:border-emerald-400"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">SoC Initial [%]:</span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={Math.round(params.soc_init * 100)}
                  onChange={(e) => updateNumeric('soc_init', (parseFloat(e.target.value) || 50) / 100.0)}
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-slate-300 focus:outline-none focus:border-emerald-400"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">SoC Cutoff Min [%]:</span>
                <input
                  type="number"
                  step="1"
                  min="5"
                  max="40"
                  value={Math.round(params.soc_min * 100)}
                  onChange={(e) => updateNumeric('soc_min', (parseFloat(e.target.value) || 15) / 100.0)}
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-slate-300 focus:outline-none focus:border-emerald-400"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">R_internal [mΩ]:</span>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={params.bess_r_internal_mohm}
                  onChange={(e) =>
                    updateNumeric('bess_r_internal_mohm', parseFloat(e.target.value) || 15)
                  }
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-slate-300 focus:outline-none focus:border-emerald-400"
                />
              </div>
            </div>
          )}
        </div>

        {/* Branch 4: PEM Electrolyzer & Tank */}
        <div className="border border-slate-800 rounded bg-[#0b101c] overflow-hidden">
          <button
            onClick={() => toggleSection('electrolyzer')}
            className="w-full flex items-center justify-between px-2.5 py-2 bg-[#121929] hover:bg-[#162035] text-left text-cyan-400 font-bold transition"
          >
            <div className="flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5" />
              <span className="text-[11px] uppercase tracking-wide">3. PEM Electrolyzer & H₂</span>
            </div>
            {collapsedSections.electrolyzer ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
          {!collapsedSections.electrolyzer && (
            <div className="p-2.5 space-y-2 text-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">P_elec_rated [kW]:</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={params.elec_rated_kw}
                  onChange={(e) => updateNumeric('elec_rated_kw', parseFloat(e.target.value) || 0)}
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-cyan-300 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Turndown k_min [%]:</span>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="20"
                  value={Math.round(params.elec_k_turndown * 100)}
                  onChange={(e) =>
                    updateNumeric('elec_k_turndown', (parseFloat(e.target.value) || 7) / 100.0)
                  }
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-slate-300 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">SEC [kWh/kg H₂]:</span>
                <input
                  type="number"
                  step="0.5"
                  min="40"
                  max="70"
                  value={params.sec_elec_kwh_per_kg}
                  onChange={(e) =>
                    updateNumeric('sec_elec_kwh_per_kg', parseFloat(e.target.value) || 52)
                  }
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-slate-300 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Tank Volume [Liters]:</span>
                <input
                  type="number"
                  step="10"
                  min="10"
                  value={Math.round(params.tank_volume_m3 * 1000)}
                  onChange={(e) =>
                    updateNumeric('tank_volume_m3', (parseFloat(e.target.value) || 500) / 1000.0)
                  }
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-sky-300 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Tank P_max [bar]:</span>
                <input
                  type="number"
                  step="1"
                  min="5"
                  max="700"
                  value={params.tank_p_max_bar}
                  onChange={(e) => updateNumeric('tank_p_max_bar', parseFloat(e.target.value) || 30)}
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-sky-300 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Initial H₂ Mass [kg]:</span>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  value={params.tank_m_h2_init_kg}
                  onChange={(e) =>
                    updateNumeric('tank_m_h2_init_kg', parseFloat(e.target.value) || 0)
                  }
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-slate-300 focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          )}
        </div>

        {/* Branch 5: PEM Fuel Cell */}
        <div className="border border-slate-800 rounded bg-[#0b101c] overflow-hidden">
          <button
            onClick={() => toggleSection('fuelcell')}
            className="w-full flex items-center justify-between px-2.5 py-2 bg-[#121929] hover:bg-[#162035] text-left text-purple-400 font-bold transition"
          >
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              <span className="text-[11px] uppercase tracking-wide">4. PEM Fuel Cell Stack</span>
            </div>
            {collapsedSections.fuelcell ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
          {!collapsedSections.fuelcell && (
            <div className="p-2.5 space-y-2 text-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">P_fc_rated [kW]:</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={params.fc_rated_kw}
                  onChange={(e) => updateNumeric('fc_rated_kw', parseFloat(e.target.value) || 0)}
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-purple-300 focus:outline-none focus:border-purple-400"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">P_fc_opt [kW]:</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={params.fc_opt_setpoint_kw}
                  onChange={(e) =>
                    updateNumeric('fc_opt_setpoint_kw', parseFloat(e.target.value) || 0)
                  }
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-purple-300 focus:outline-none focus:border-purple-400"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">η_fc_stack [%]:</span>
                <input
                  type="number"
                  step="1"
                  min="30"
                  max="70"
                  value={Math.round(params.eta_fc_stack * 100)}
                  onChange={(e) =>
                    updateNumeric('eta_fc_stack', (parseFloat(e.target.value) || 52) / 100.0)
                  }
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-slate-300 focus:outline-none focus:border-purple-400"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">η_fc_boost [%]:</span>
                <input
                  type="number"
                  step="1"
                  min="80"
                  max="99"
                  value={Math.round(params.eta_fc_dcdc * 100)}
                  onChange={(e) =>
                    updateNumeric('eta_fc_dcdc', (parseFloat(e.target.value) || 95) / 100.0)
                  }
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-slate-300 focus:outline-none focus:border-purple-400"
                />
              </div>
            </div>
          )}
        </div>

        {/* Control State Machine Thresholds */}
        <div className="border border-slate-800 rounded bg-[#0b101c] overflow-hidden">
          <button
            onClick={() => toggleSection('control')}
            className="w-full flex items-center justify-between px-2.5 py-2 bg-[#121929] hover:bg-[#162035] text-left text-slate-300 font-bold transition"
          >
            <div className="flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[11px] uppercase tracking-wide">5. Hysteresis Thresholds</span>
            </div>
            {collapsedSections.control ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
          {!collapsedSections.control && (
            <div className="p-2.5 space-y-2 text-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">FC Latch ON SoC [%]:</span>
                <input
                  type="number"
                  step="1"
                  min="10"
                  max="40"
                  value={Math.round(params.soc_fc_trigger_on * 100)}
                  onChange={(e) =>
                    updateNumeric('soc_fc_trigger_on', (parseFloat(e.target.value) || 25) / 100.0)
                  }
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-purple-300 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">FC Latch OFF SoC [%]:</span>
                <input
                  type="number"
                  step="1"
                  min="20"
                  max="60"
                  value={Math.round(params.soc_fc_trigger_off * 100)}
                  onChange={(e) =>
                    updateNumeric('soc_fc_trigger_off', (parseFloat(e.target.value) || 35) / 100.0)
                  }
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-purple-300 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Absorption Taper [%]:</span>
                <input
                  type="number"
                  step="1"
                  min="70"
                  max="98"
                  value={Math.round(params.soc_absorption_taper * 100)}
                  onChange={(e) =>
                    updateNumeric(
                      'soc_absorption_taper',
                      (parseFloat(e.target.value) || 90) / 100.0
                    )
                  }
                  className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-emerald-300 focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Controls: Live Recalculation Checkbox */}
      <div className="p-3 bg-[#0a0f1b] border-t border-slate-800 flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-slate-300">
          <input
            type="checkbox"
            checked={autoRecompute}
            onChange={(e) => onToggleAutoRecompute(e.target.checked)}
            className="w-3.5 h-3.5 rounded bg-slate-900 border-slate-700 text-cyan-600 focus:ring-0"
          />
          <span>Instant Solver Re-run</span>
        </label>
        <span className="text-[10px] text-slate-500 font-mono">15m dt = 0.25h</span>
      </div>
    </aside>
  );
};
