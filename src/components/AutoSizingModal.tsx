import React, { useState } from 'react';
import {
  AutoSizingTargets,
  SizingRecommendation,
  SystemParameters,
  TimeSeriesInputStep,
} from '../types/microgrid';
import { solveMicrogridComponentSizes } from '../simulation/autoSizer';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Cpu,
  Info,
  Sliders,
  Wand2,
  X,
  Zap,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  inputs: TimeSeriesInputStep[];
  currentParams: SystemParameters;
  onApplyRecommendation: (rec: SizingRecommendation) => void;
}

export const AutoSizingModal: React.FC<Props> = ({
  isOpen,
  onClose,
  inputs,
  currentParams,
  onApplyRecommendation,
}) => {
  const [targets, setTargets] = useState<AutoSizingTargets>({
    target_full_charge_hour: 12.5, // 12:30 PM
    max_allowable_dod_percent: 80, // 80% DoD
    target_autonomy_nights: 1.0,   // 1 night
    target_daily_h2_kg: currentParams.scale === '1:10' ? 0.08 : 0.80,
    minimize_curtailment: true,
    tank_pressure_class_bar: 30,   // 30 bar
  });

  const [recommendation, setRecommendation] = useState<SizingRecommendation | null>(() => {
    return solveMicrogridComponentSizes(inputs, targets, currentParams);
  });

  if (!isOpen) return null;

  const handleRecompute = () => {
    const rec = solveMicrogridComponentSizes(inputs, targets, currentParams);
    setRecommendation(rec);
  };

  const handleApply = () => {
    if (recommendation) {
      onApplyRecommendation(recommendation);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[#0e1626] border border-cyan-500/40 rounded-lg w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-200">
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-[#0a0f1b] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
              <Wand2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold font-mono text-cyan-300 uppercase tracking-wider">
                Automated Component Sizing Solver
              </h2>
              <p className="text-[11px] text-slate-400 font-sans">
                Analytical + Iterative dimensioning based on diurnal solar irradiance, load duration, and target H₂ yield
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1.5 hover:bg-slate-800 rounded transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs font-mono">
          {/* Sizing Target Inputs Grid */}
          <div className="bg-[#121b2d] border border-slate-800 rounded-lg p-4">
            <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>User Dimensioning Constraints & Targets</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Target 1: Hour of full charge */}
              <div className="space-y-1.5 bg-[#0b101c] p-2.5 rounded border border-slate-700/60">
                <label className="text-slate-300 font-semibold block text-[11px]">
                  Target 1: BESS 100% SoC Hour
                </label>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Target Time:</span>
                  <span className="text-amber-400 font-bold">
                    {Math.floor(targets.target_full_charge_hour)}:
                    {Math.round((targets.target_full_charge_hour % 1) * 60)
                      .toString()
                      .padStart(2, '0')}
                  </span>
                </div>
                <input
                  type="range"
                  min="10.0"
                  max="15.0"
                  step="0.25"
                  value={targets.target_full_charge_hour}
                  onChange={(e) => {
                    setTargets({ ...targets, target_full_charge_hour: parseFloat(e.target.value) });
                  }}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 block leading-tight">
                  Guarantees afternoon sun is routed directly to PEM Electrolyzer
                </span>
              </div>

              {/* Target 2: Max DoD & Autonomy */}
              <div className="space-y-1.5 bg-[#0b101c] p-2.5 rounded border border-slate-700/60">
                <label className="text-slate-300 font-semibold block text-[11px]">
                  Target 2: Max DoD & Autonomy
                </label>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Allowable DoD:</span>
                  <span className="text-emerald-400 font-bold">{targets.max_allowable_dod_percent}%</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="90"
                  step="5"
                  value={targets.max_allowable_dod_percent}
                  onChange={(e) => {
                    setTargets({
                      ...targets,
                      max_allowable_dod_percent: parseInt(e.target.value, 10),
                    });
                  }}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <div className="flex items-center justify-between text-slate-400 pt-1">
                  <span>Night Autonomy:</span>
                  <span className="text-emerald-400 font-bold">{targets.target_autonomy_nights} night(s)</span>
                </div>
              </div>

              {/* Target 3: Daily H2 Production & Tank Pressure */}
              <div className="space-y-1.5 bg-[#0b101c] p-2.5 rounded border border-slate-700/60">
                <label className="text-slate-300 font-semibold block text-[11px]">
                  Target 3: Daily H₂ Yield & Vessel
                </label>
                <div className="flex items-center justify-between text-slate-400">
                  <span>H₂ Target:</span>
                  <span className="text-cyan-400 font-bold">{targets.target_daily_h2_kg.toFixed(2)} kg/day</span>
                </div>
                <input
                  type="range"
                  min={currentParams.scale === '1:10' ? 0.02 : 0.2}
                  max={currentParams.scale === '1:10' ? 0.25 : 2.5}
                  step={currentParams.scale === '1:10' ? 0.01 : 0.1}
                  value={targets.target_daily_h2_kg}
                  onChange={(e) => {
                    setTargets({
                      ...targets,
                      target_daily_h2_kg: parseFloat(e.target.value),
                    });
                  }}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
                <div className="space-y-1 pt-1 border-t border-slate-800">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Pressure Class:</span>
                    <select
                      value={targets.tank_pressure_class_bar}
                      onChange={(e) => {
                        const newP = parseInt(e.target.value, 10);
                        const nextTargets = { ...targets, tank_pressure_class_bar: newP };
                        setTargets(nextTargets);
                        setRecommendation(solveMicrogridComponentSizes(inputs, nextTargets, currentParams));
                      }}
                      className="bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-sky-300 font-bold"
                    >
                      <option value={1}>1 bar (Atmospheric Gas Holder)</option>
                      <option value={10}>10 bar (Low-P Buffer)</option>
                      <option value={30}>30 bar (Direct PEM / Metal Hydride)</option>
                      <option value={200}>200 bar (Industrial Cylinder Quad)</option>
                      <option value={350}>350 bar (Type IV Stationary)</option>
                      <option value={700}>700 bar (Type IV Mobility)</option>
                    </select>
                  </div>
                  {recommendation && (
                    <div className="bg-[#0e1726] p-1.5 rounded border border-sky-900/50 flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">Required Geometric Vol:</span>
                      <span className="text-cyan-300 font-bold">
                        {recommendation.tank_volume_l} Liters ({(recommendation.tank_volume_l / 1000).toFixed(3)} m³)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                onClick={handleRecompute}
                className="flex items-center gap-1.5 bg-[#1a253a] hover:bg-[#233350] text-cyan-300 px-3 py-1.5 rounded border border-cyan-500/30 transition text-xs font-semibold"
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Re-Solve Optimal Sizing</span>
              </button>
            </div>
          </div>

          {/* Sizing Comparison Table */}
          {recommendation && (
            <div className="border border-slate-800 rounded-lg overflow-hidden">
              <div className="bg-[#0b101c] px-4 py-2 border-b border-slate-800 text-slate-300 font-bold text-xs flex items-center justify-between">
                <span>Comparison: Current Active Parameters vs. Solver Recommended Ratings</span>
                <span className="text-[10px] text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/60">
                  Engineering Sizing Validated
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[#121929] text-slate-400 border-b border-slate-800">
                      <th className="p-2.5">Subsystem Branch</th>
                      <th className="p-2.5">Current Model Parameter</th>
                      <th className="p-2.5 text-cyan-300">Solver Recommendation</th>
                      <th className="p-2.5">Engineering Dimensioning Justification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {/* Solar PV */}
                    <tr className="hover:bg-slate-800/20">
                      <td className="p-2.5 font-bold text-amber-400">1. Solar PV Array</td>
                      <td className="p-2.5">{currentParams.pv_peak_kw.toFixed(1)} kWp</td>
                      <td className="p-2.5 font-bold text-cyan-300">
                        {recommendation.pv_peak_kw.toFixed(1)} kWp (MPPT {recommendation.mppt_rating_a} A)
                      </td>
                      <td className="p-2.5 text-slate-400 text-[10px]">
                        {recommendation.explanation.pv}
                      </td>
                    </tr>

                    {/* LiFePO4 BESS */}
                    <tr className="hover:bg-slate-800/20">
                      <td className="p-2.5 font-bold text-emerald-400">2. LiFePO4 Battery Pack</td>
                      <td className="p-2.5">{currentParams.bess_cap_kwh.toFixed(1)} kWh</td>
                      <td className="p-2.5 font-bold text-cyan-300">
                        {recommendation.bess_capacity_kwh.toFixed(1)} kWh ({recommendation.bess_capacity_ah} Ah @ 51.2V)
                      </td>
                      <td className="p-2.5 text-slate-400 text-[10px]">
                        {recommendation.explanation.bess}
                      </td>
                    </tr>

                    {/* Bidirectional DC-DC */}
                    <tr className="hover:bg-slate-800/20">
                      <td className="p-2.5 font-bold text-emerald-300">BESS BiDir DC-DC</td>
                      <td className="p-2.5">{currentParams.bess_dis_max_kw.toFixed(1)} kW</td>
                      <td className="p-2.5 font-bold text-cyan-300">
                        {recommendation.bess_bidirectional_dcdc_kw.toFixed(1)} kW
                      </td>
                      <td className="p-2.5 text-slate-400 text-[10px]">
                        Continuous 1.25x peak load protection + rapid transient bus stiffness.
                      </td>
                    </tr>

                    {/* PEM Electrolyzer */}
                    <tr className="hover:bg-slate-800/20">
                      <td className="p-2.5 font-bold text-cyan-400">3. PEM Electrolyzer</td>
                      <td className="p-2.5">{currentParams.elec_rated_kw.toFixed(1)} kW</td>
                      <td className="p-2.5 font-bold text-cyan-300">
                        {recommendation.elec_rated_kw.toFixed(1)} kW
                      </td>
                      <td className="p-2.5 text-slate-400 text-[10px]">
                        {recommendation.explanation.elec}
                      </td>
                    </tr>

                    {/* PEM Fuel Cell */}
                    <tr className="hover:bg-slate-800/20">
                      <td className="p-2.5 font-bold text-purple-400">4. PEM Fuel Cell</td>
                      <td className="p-2.5">{currentParams.fc_rated_kw.toFixed(1)} kW</td>
                      <td className="p-2.5 font-bold text-cyan-300">
                        {recommendation.fc_rated_kw.toFixed(1)} kW
                      </td>
                      <td className="p-2.5 text-slate-400 text-[10px]">
                        {recommendation.explanation.fc}
                      </td>
                    </tr>

                    {/* H2 Tank */}
                    <tr className="hover:bg-slate-800/20">
                      <td className="p-2.5 font-bold text-sky-400">5. H₂ Storage Vessel</td>
                      <td className="p-2.5">{Math.round(currentParams.tank_volume_m3 * 1000)} L</td>
                      <td className="p-2.5 font-bold text-cyan-300">
                        {recommendation.tank_volume_l} L @ {recommendation.tank_pressure_bar} bar
                      </td>
                      <td className="p-2.5 text-slate-400 text-[10px]">
                        {recommendation.explanation.tank}
                      </td>
                    </tr>

                    {/* DI Water */}
                    <tr className="hover:bg-slate-800/20">
                      <td className="p-2.5 font-bold text-sky-300">DI Water Buffer</td>
                      <td className="p-2.5">Standard Reservoir</td>
                      <td className="p-2.5 font-bold text-cyan-300">
                        {recommendation.di_water_tank_l} Liters
                      </td>
                      <td className="p-2.5 text-slate-400 text-[10px]">
                        {recommendation.explanation.water}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-[#0a0f1b] border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-400 text-[11px]">
            <Info className="w-3.5 h-3.5 text-cyan-400" />
            <span>Clicking apply will update system parameters and instantly re-run the simulation</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-[#141d2e] hover:bg-[#1a263d] text-slate-300 rounded border border-slate-700 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded shadow transition"
            >
              <Check className="w-4 h-4" />
              <span>Apply Sizing to Active Model</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
