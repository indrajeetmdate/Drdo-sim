import React from 'react';
import { SimulationSummary } from '../types/microgrid';
import {
  Activity,
  BatteryCharging,
  CheckCircle2,
  Droplets,
  Flame,
  Gauge,
  Layers,
  Sun,
  XCircle,
  Zap,
} from 'lucide-react';

interface Props {
  summary: SimulationSummary | null;
  isRunning?: boolean;
}

export const KpiAuditRibbon: React.FC<Props> = ({ summary, isRunning }) => {
  if (!summary) return null;

  return (
    <div className="w-full bg-[#0c121e] border-b border-slate-800 px-4 py-2 text-xs">
      {/* Upper Grid: Major Key Performance Indicators */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        {/* Total PV Generated */}
        <div className="bg-[#131b2c] border border-amber-500/20 rounded p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 font-mono text-[10px] uppercase tracking-wider">
            <span>PV Generation</span>
            <Sun className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-base font-bold text-amber-400 font-mono">
              {summary.total_pv_gen_kwh.toFixed(1)}
            </span>
            <span className="text-[10px] text-slate-400">kWh</span>
          </div>
          <div className="text-[10px] text-slate-500 truncate">
            Peak: {summary.i_pv_peak_a.toFixed(1)} A @ 48V
          </div>
        </div>

        {/* Total Load Demand */}
        <div className="bg-[#131b2c] border border-red-500/20 rounded p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 font-mono text-[10px] uppercase tracking-wider">
            <span>DC Load Demand</span>
            <Zap className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-base font-bold text-rose-400 font-mono">
              {summary.total_load_demand_kwh.toFixed(1)}
            </span>
            <span className="text-[10px] text-slate-400">kWh</span>
          </div>
          <div className="text-[10px] text-slate-500 truncate">
            Peak: {summary.i_load_peak_a.toFixed(1)} A
          </div>
        </div>

        {/* BESS Round-Trip & Extremes */}
        <div className="bg-[#131b2c] border border-emerald-500/20 rounded p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 font-mono text-[10px] uppercase tracking-wider">
            <span>BESS RT Eff / Range</span>
            <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-base font-bold text-emerald-400 font-mono">
              {summary.bess_round_trip_eff_percent.toFixed(1)}%
            </span>
            <span className="text-[10px] text-slate-400">RT</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono truncate">
            SoC: {(summary.min_soc * 100).toFixed(0)}% → {(summary.max_soc * 100).toFixed(0)}%
          </div>
        </div>

        {/* Hydrogen Produced */}
        <div className="bg-[#131b2c] border border-cyan-500/20 rounded p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 font-mono text-[10px] uppercase tracking-wider">
            <span>H₂ Produced</span>
            <Flame className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-base font-bold text-cyan-400 font-mono">
              {summary.total_h2_prod_kg.toFixed(3)}
            </span>
            <span className="text-[10px] text-slate-400">kg</span>
          </div>
          <div className="text-[10px] text-cyan-300/80 font-mono truncate">
            {summary.total_h2_prod_nm3.toFixed(2)} Nm³ | {summary.elec_total_input_kwh.toFixed(1)} kWh in
          </div>
        </div>

        {/* Hydrogen Consumed & Net Balance */}
        <div className="bg-[#131b2c] border border-purple-500/20 rounded p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 font-mono text-[10px] uppercase tracking-wider">
            <span>H₂ Net / FC Output</span>
            <Activity className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className={`text-base font-bold font-mono ${summary.net_h2_balance_kg >= 0 ? 'text-purple-300' : 'text-rose-400'}`}>
              {summary.net_h2_balance_kg >= 0 ? '+' : ''}{summary.net_h2_balance_kg.toFixed(3)}
            </span>
            <span className="text-[10px] text-slate-400">kg net</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono truncate">
            FC: {summary.fc_total_output_kwh.toFixed(1)} kWh ({summary.fc_start_cycles} cyc)
          </div>
        </div>

        {/* Peak Tank Pressure & DI Water */}
        <div className="bg-[#131b2c] border border-sky-500/20 rounded p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 font-mono text-[10px] uppercase tracking-wider">
            <span>Peak Pressure & Water</span>
            <Gauge className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-base font-bold text-sky-400 font-mono">
              {summary.peak_tank_pressure_bar.toFixed(1)}
            </span>
            <span className="text-[10px] text-slate-400">bar</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono truncate flex items-center gap-1">
            <Droplets className="w-3 h-3 text-sky-400 inline" />
            <span>{summary.total_di_water_consumed_l.toFixed(1)} L DI H₂O</span>
          </div>
        </div>

        {/* Curtailed & Unserved LPSP */}
        <div className="bg-[#131b2c] border border-slate-700 rounded p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 font-mono text-[10px] uppercase tracking-wider">
            <span>Curtailment / LPSP</span>
            <Layers className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <div>
              <span className="text-base font-bold text-amber-300/90 font-mono">
                {summary.curtailment_percent.toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-400 ml-0.5">curt</span>
            </div>
            <div>
              <span className={`text-base font-bold font-mono ${summary.lpsp_percent > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {summary.lpsp_percent.toFixed(2)}%
              </span>
              <span className="text-[10px] text-slate-400 ml-0.5">LPSP</span>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 font-mono truncate">
            {summary.total_curtailed_kwh.toFixed(1)} kWh unabsorbed
          </div>
        </div>

        {/* Thermodynamic Energy Balance Verification */}
        <div
          className={`rounded p-2 flex flex-col justify-between border ${
            summary.energy_conservation_pass
              ? 'bg-emerald-950/20 border-emerald-500/40'
              : 'bg-rose-950/20 border-rose-500/40'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 font-mono text-[10px] uppercase tracking-wider">
            <span>Energy Audit</span>
            {summary.energy_conservation_pass ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-400" />
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`px-1.5 py-0.5 rounded text-[11px] font-bold font-mono ${
                summary.energy_conservation_pass
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/20 text-rose-300'
              }`}
            >
              {summary.energy_conservation_pass ? 'PASSED' : 'RESIDUAL ERROR'}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono truncate">
            ΔE: {summary.energy_conservation_residual_kwh.toExponential(2)} kWh
          </div>
        </div>
      </div>

      {/* State Machine Duty Cycle Bar */}
      <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-400 gap-2">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-sans font-semibold text-[10px] uppercase tracking-wider">
            Dispatch Duty Cycles:
          </span>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"></span>
            <span>State 1 (BESS Chg): {summary.time_in_state_1_hours.toFixed(1)} h ({(summary.time_in_state_1_hours / (summary.total_steps * summary.dt_hours) * 100).toFixed(0)}%)</span>
          </div>
          <span className="text-slate-700">•</span>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400 inline-block"></span>
            <span>State 2 (H₂ Prod): {summary.time_in_state_2_hours.toFixed(1)} h ({(summary.time_in_state_2_hours / (summary.total_steps * summary.dt_hours) * 100).toFixed(0)}%)</span>
          </div>
          <span className="text-slate-700">•</span>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block"></span>
            <span>State 3 (BESS Dis): {summary.time_in_state_3_hours.toFixed(1)} h ({(summary.time_in_state_3_hours / (summary.total_steps * summary.dt_hours) * 100).toFixed(0)}%)</span>
          </div>
          <span className="text-slate-700">•</span>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-purple-500 inline-block"></span>
            <span>State 4 (FC Extender): {summary.time_in_state_4_hours.toFixed(1)} h ({(summary.time_in_state_4_hours / (summary.total_steps * summary.dt_hours) * 100).toFixed(0)}%)</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-slate-500">
          <span>
            Bus Voltage: <strong className="text-slate-300">{summary.v_bus_min_v.toFixed(1)} V</strong> to <strong className="text-slate-300">{summary.v_bus_max_v.toFixed(1)} V</strong> (Avg {summary.v_bus_avg_v.toFixed(1)} V)
          </span>
          <span>
            Steps: <strong className="text-slate-300">{summary.total_steps}</strong> ({summary.duration_days.toFixed(1)} days @ dt={summary.dt_hours}h)
          </span>
        </div>
      </div>
    </div>
  );
};
