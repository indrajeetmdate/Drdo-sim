import React from 'react';
import { SystemParameters, TimeSeriesOutputStep } from '../types/microgrid';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Battery,
  Check,
  Cpu,
  Droplets,
  Flame,
  Gauge,
  Sliders,
  Sun,
  X,
  Zap,
} from 'lucide-react';
import {
  adjustTankForPressure,
  calculateH2TankMaxCapacity,
  calculateH2TankPressure,
  calculateH2TankVolumeForMass,
  TANK_PRESSURE_PRESETS,
} from '../simulation/simulationEngine';

export type SubsystemId =
  | 'pv'
  | 'mppt'
  | 'busbar'
  | 'bess'
  | 'elec'
  | 'tank'
  | 'fc'
  | 'load'
  | 'daq';

interface Props {
  subsystem: SubsystemId | null;
  onClose: () => void;
  params: SystemParameters;
  onChangeParams: (params: SystemParameters) => void;
  currentStep: TimeSeriesOutputStep | null;
  onScaleLoad?: (multiplier: number) => void;
}

export const SubsystemEditorDrawer: React.FC<Props> = ({
  subsystem,
  onClose,
  params,
  onChangeParams,
  currentStep,
  onScaleLoad,
}) => {
  if (!subsystem) return null;

  const updateNumeric = (key: keyof SystemParameters, value: number) => {
    onChangeParams({
      ...params,
      [key]: value,
    });
  };

  const updateBoolean = (key: keyof SystemParameters, value: boolean) => {
    onChangeParams({
      ...params,
      [key]: value,
    });
  };

  // Helper for tank metrics
  const tankVolL = Math.round(params.tank_volume_m3 * 1000);
  const maxStorageKg = calculateH2TankMaxCapacity(
    params.tank_p_max_bar,
    params.tank_volume_m3,
    currentStep?.t_amb_c || 20.0
  );
  const currentTankP = currentStep
    ? currentStep.p_tank_bar
    : calculateH2TankPressure(params.tank_m_h2_init_kg, params.tank_volume_m3, 20.0);
  const currentTankM = currentStep ? currentStep.m_h2_tank_kg : params.tank_m_h2_init_kg;
  const currentZ = 1.0 + 0.0006 * params.tank_p_max_bar;

  return (
    <div className="absolute inset-y-0 right-0 z-40 w-full sm:w-96 max-w-[95vw] bg-[#0c1424]/95 backdrop-blur-md border-l border-cyan-500/40 shadow-2xl flex flex-col font-mono text-xs text-slate-200 transition-all duration-200 ease-in-out">
      {/* Drawer Header */}
      <div className="px-4 py-3 bg-[#080e1a] border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {subsystem === 'pv' && <Sun className="w-4 h-4 text-amber-400" />}
          {subsystem === 'mppt' && <Cpu className="w-4 h-4 text-amber-300" />}
          {subsystem === 'busbar' && <Zap className="w-4 h-4 text-yellow-400" />}
          {subsystem === 'bess' && <Battery className="w-4 h-4 text-emerald-400" />}
          {subsystem === 'elec' && <Droplets className="w-4 h-4 text-cyan-400" />}
          {subsystem === 'tank' && <Gauge className="w-4 h-4 text-sky-400" />}
          {subsystem === 'fc' && <Flame className="w-4 h-4 text-purple-400" />}
          {subsystem === 'load' && <Activity className="w-4 h-4 text-rose-400" />}
          {subsystem === 'daq' && <Sliders className="w-4 h-4 text-cyan-300" />}
          <div>
            <h3 className="font-bold uppercase tracking-wider text-slate-100 text-[11px]">
              {subsystem === 'pv' && 'Solar PV Array'}
              {subsystem === 'mppt' && 'MPPT DC-DC Converter'}
              {subsystem === 'busbar' && '48V DC Common Busbar'}
              {subsystem === 'bess' && 'BESS 16S LiFePO4 & BiDir'}
              {subsystem === 'elec' && 'PEM Electrolyzer Subsystem'}
              {subsystem === 'tank' && 'H₂ Storage Vessel (Pressure Adjust)'}
              {subsystem === 'fc' && 'PEM Fuel Cell Subsystem'}
              {subsystem === 'load' && 'Programmable DC Load'}
              {subsystem === 'daq' && 'Supervisory DAQ Controller'}
            </h3>
            <span className="text-[10px] text-cyan-400/90 font-sans">
              Interactive Subsystem Block Editor
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-100 transition"
          title="Close Subsystem Inspector"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Drawer Body: Live Metrics Strip + Editable Parameters Form */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ========================================================= */}
        {/* SUBSYSTEM 1: SOLAR PV ARRAY */}
        {/* ========================================================= */}
        {subsystem === 'pv' && (
          <div className="space-y-3.5">
            {/* Live Readout */}
            <div className="bg-[#121c2e] p-2.5 rounded border border-amber-500/30 space-y-1">
              <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">
                Live Operating Status
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 text-[10px] block">Array Output:</span>
                  <span className="font-bold text-amber-300">
                    {currentStep ? Math.round(currentStep.p_pv_bus_kw * 1000) : 0} W DC
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Branch Current:</span>
                  <span className="font-bold text-amber-300">
                    {currentStep ? currentStep.i_pv_a.toFixed(1) : '0.0'} A DC
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Solar Irradiance:</span>
                  <span className="text-slate-200">
                    {currentStep ? Math.round(currentStep.g_irr_wm2) : 0} W/m²
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Cell Temp T_cell:</span>
                  <span className="text-slate-200">
                    {currentStep ? currentStep.t_cell_c.toFixed(1) : 25.0} °C
                  </span>
                </div>
              </div>
            </div>

            {/* Editable PV Parameters */}
            <div className="space-y-3 bg-[#0e1626] p-3 rounded border border-slate-800">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Dimensioning & Model Parameters
              </span>

              {/* Peak Power Rating */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Peak STC Rating:</span>
                  <span className="text-amber-400 font-bold text-sm">
                    {params.pv_peak_kw.toFixed(1)} kWp
                  </span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="30.0"
                  step="0.1"
                  value={params.pv_peak_kw}
                  onChange={(e) => updateNumeric('pv_peak_kw', parseFloat(e.target.value) || 1.2)}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                {/* Quick Scalers */}
                <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                  <span className="text-[10px] text-slate-500">Quick Scale:</span>
                  {[0.5, 1.0, 1.5, 2.0, 5.0, 10.0].map((val) => (
                    <button
                      key={val}
                      onClick={() => {
                        updateNumeric('pv_peak_kw', val);
                      }}
                      className={`px-1.5 py-0.5 rounded text-[10px] border transition ${
                        Math.abs(params.pv_peak_kw - val) < 0.05
                          ? 'bg-amber-600 text-white font-bold border-amber-400'
                          : 'bg-[#162136] hover:bg-amber-950 text-amber-300 border-slate-700'
                      }`}
                    >
                      {val} kW
                    </button>
                  ))}
                </div>

                {params.pv_peak_kw > params.elec_rated_kw * 2 && (
                  <div className="mt-2 p-2 bg-amber-950/60 border border-amber-500/40 rounded space-y-1 text-[10px]">
                    <div className="flex items-center gap-1 text-amber-300 font-bold">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Electrolyzer Sizing Bottleneck</span>
                    </div>
                    <p className="text-amber-200/90 leading-tight">
                      Solar array ({params.pv_peak_kw.toFixed(1)} kW) produces up to ~{(params.pv_peak_kw * 0.8).toFixed(1)} kW surplus, which exceeds the current {params.elec_rated_kw.toFixed(1)} kW electrolyzer. Excess power will be curtailed.
                    </p>
                    <button
                      onClick={() => {
                        const targetElecKw = Math.max(0.5, Math.round((params.pv_peak_kw * 0.8) * 10) / 10);
                        const h2PerHourKg = (targetElecKw * 0.94) / params.sec_elec_kwh_per_kg;
                        const targetVolL = Math.max(20, Math.ceil(calculateH2TankVolumeForMass(h2PerHourKg * 5, params.tank_p_max_bar, 20.0) / 5) * 5);
                        onChangeParams({
                          ...params,
                          elec_rated_kw: targetElecKw,
                          tank_volume_m3: targetVolL / 1000.0,
                        });
                      }}
                      className="mt-1 w-full py-1 rounded bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-black font-bold text-[10px] transition shadow"
                    >
                      ⚡ Auto-Scale Electrolyzer & Tank to Match Solar
                    </button>
                  </div>
                )}
              </div>

              {/* Temperature Derating Coefficient */}
              <div className="space-y-1 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Temp Coeff γ_P:</span>
                  <span className="text-slate-400 font-bold">
                    {(params.gamma_t * 100).toFixed(2)} %/°C
                  </span>
                </div>
                <input
                  type="range"
                  min="-0.0055"
                  max="-0.0025"
                  step="0.0001"
                  value={params.gamma_t}
                  onChange={(e) => updateNumeric('gamma_t', parseFloat(e.target.value) || -0.0038)}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              {/* NOCT */}
              <div className="space-y-1 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">NOCT Rating:</span>
                  <span className="text-slate-400 font-bold">{params.noct_c.toFixed(1)} °C</span>
                </div>
                <input
                  type="range"
                  min="38"
                  max="52"
                  step="1"
                  value={params.noct_c}
                  onChange={(e) => updateNumeric('noct_c', parseFloat(e.target.value) || 45)}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SUBSYSTEM 2: MPPT DC-DC CONVERTER */}
        {/* ========================================================= */}
        {subsystem === 'mppt' && (
          <div className="space-y-3.5">
            <div className="bg-[#121c2e] p-2.5 rounded border border-amber-500/30 space-y-1">
              <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">
                Live MPPT Tracking
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 text-[10px] block">Operating Mode:</span>
                  <span className="font-bold text-amber-400">
                    {currentStep && currentStep.p_pv_bus_kw > 0 ? 'SYNC BUCK' : 'STANDBY'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">DC Bus Voltage:</span>
                  <span className="font-bold text-yellow-400">
                    {currentStep ? currentStep.v_bus_v.toFixed(2) : '48.00'} V DC
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3 bg-[#0e1626] p-3 rounded border border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">MPPT Power Ceiling:</span>
                  <span className="text-amber-400 font-bold">
                    {params.mppt_max_kw.toFixed(1)} kW
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="35.0"
                  step="0.25"
                  value={params.mppt_max_kw}
                  onChange={(e) => updateNumeric('mppt_max_kw', parseFloat(e.target.value) || 1.25)}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Conversion Efficiency:</span>
                  <span className="text-emerald-400 font-bold">
                    {(params.eta_mppt * 100).toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.90"
                  max="0.995"
                  step="0.005"
                  value={params.eta_mppt}
                  onChange={(e) => updateNumeric('eta_mppt', parseFloat(e.target.value) || 0.98)}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SUBSYSTEM 3: COMMON 48V DC BUSBAR */}
        {/* ========================================================= */}
        {subsystem === 'busbar' && (
          <div className="space-y-3.5">
            <div className="bg-[#161a29] p-3 rounded border border-yellow-500/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-yellow-400 font-bold text-[11px]">48V DC BUSBAR METRICS</span>
                <span className="px-1.5 py-0.5 rounded bg-yellow-950/80 text-yellow-300 text-[10px] border border-yellow-700/60 font-bold">
                  KCL BALANCED
                </span>
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Loaded Bus Voltage:</span>
                  <span className="text-yellow-400 font-bold text-sm">
                    {currentStep ? currentStep.v_bus_v.toFixed(2) : '48.00'} V DC
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">LiFePO4 Open Circuit:</span>
                  <span className="text-emerald-400 font-bold">
                    {currentStep ? currentStep.v_oc_bess_v.toFixed(2) : '51.20'} V DC
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Kirchhoff's Residual:</span>
                  <span className="text-emerald-400 font-bold">
                    {currentStep ? currentStep.kcl_residual_a.toFixed(4) : '0.0000'} A DC
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-[#0e1626] p-3 rounded border border-slate-800 space-y-2 text-[11px]">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Active Branch Current Injections (t)
              </span>
              <div className="space-y-1 font-mono">
                <div className="flex justify-between text-amber-300">
                  <span>Branch 1 (PV Infeed):</span>
                  <span>+{currentStep ? currentStep.i_pv_a.toFixed(1) : '0.0'} A</span>
                </div>
                <div className="flex justify-between text-rose-300">
                  <span>Branch 2 (DC Load):</span>
                  <span>-{currentStep ? currentStep.i_load_a.toFixed(1) : '0.0'} A</span>
                </div>
                <div className="flex justify-between text-emerald-300">
                  <span>Branch 3 (BESS Net):</span>
                  <span>
                    {currentStep && currentStep.i_bess_a >= 0 ? '+' : ''}
                    {currentStep ? currentStep.i_bess_a.toFixed(1) : '0.0'} A
                  </span>
                </div>
                <div className="flex justify-between text-cyan-300">
                  <span>Branch 4 (Electrolyzer):</span>
                  <span>-{currentStep ? currentStep.i_elec_a.toFixed(1) : '0.0'} A</span>
                </div>
                <div className="flex justify-between text-purple-300">
                  <span>Branch 5 (Fuel Cell):</span>
                  <span>+{currentStep ? currentStep.i_fc_a.toFixed(1) : '0.0'} A</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SUBSYSTEM 4: BESS 16S LIFEPO4 & BIDIR DC-DC */}
        {/* ========================================================= */}
        {subsystem === 'bess' && (
          <div className="space-y-3.5">
            <div className="bg-[#0b1c1c] p-2.5 rounded border border-emerald-500/30 space-y-1">
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block">
                Live Battery Status
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 text-[10px] block">State of Charge (SoC):</span>
                  <span className="font-bold text-emerald-300 text-sm">
                    {currentStep ? (currentStep.soc * 100).toFixed(1) : '50.0'}%
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Stored Energy:</span>
                  <span className="font-bold text-emerald-300">
                    {currentStep ? currentStep.e_bess_kwh.toFixed(2) : '1.54'} kWh
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Net Power:</span>
                  <span className="font-bold text-slate-200">
                    {currentStep && currentStep.p_bess_chg_kw > 0
                      ? `+${Math.round(currentStep.p_bess_chg_kw * 1000)} W (Chg)`
                      : currentStep && currentStep.p_bess_dis_kw > 0
                      ? `-${Math.round(currentStep.p_bess_dis_kw * 1000)} W (Dis)`
                      : '0 W (Idle)'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Operating Current:</span>
                  <span className="font-bold text-slate-200">
                    {currentStep ? Math.abs(currentStep.i_bess_a).toFixed(1) : '0.0'} A DC
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3 bg-[#0e1626] p-3 rounded border border-slate-800">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                BESS Pack Dimensions
              </span>

              {/* Nominal Capacity */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Capacity (kWh / Ah):</span>
                  <span className="text-emerald-400 font-bold text-sm">
                    {params.bess_cap_kwh.toFixed(2)} kWh ({Math.round((params.bess_cap_kwh * 1000) / 51.2)} Ah)
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="80.0"
                  step="0.5"
                  value={params.bess_cap_kwh}
                  onChange={(e) => updateNumeric('bess_cap_kwh', parseFloat(e.target.value) || 3.072)}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                {/* Quick Scalers */}
                <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                  <span className="text-[10px] text-slate-500">Quick Scale:</span>
                  {[1.0, 2.0, 3.0, 5.0, 10.0, 30.0].map((val) => (
                    <button
                      key={val}
                      onClick={() => updateNumeric('bess_cap_kwh', val)}
                      className={`px-1.5 py-0.5 rounded text-[10px] border transition ${
                        Math.abs(params.bess_cap_kwh - val) < 0.1
                          ? 'bg-emerald-600 text-white font-bold border-emerald-400'
                          : 'bg-[#162136] hover:bg-emerald-950 text-emerald-300 border-slate-700'
                      }`}
                    >
                      {val} kWh
                    </button>
                  ))}
                </div>
              </div>

              {/* Max Charge Power */}
              <div className="space-y-1 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Max Charge Power:</span>
                  <span className="text-emerald-300 font-bold">
                    {params.bess_chg_max_kw.toFixed(2)} kW
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="20.0"
                  step="0.1"
                  value={params.bess_chg_max_kw}
                  onChange={(e) => updateNumeric('bess_chg_max_kw', parseFloat(e.target.value) || 0.6)}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>

              {/* Max Discharge Power */}
              <div className="space-y-1 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Max Discharge Power:</span>
                  <span className="text-blue-300 font-bold">
                    {params.bess_dis_max_kw.toFixed(2)} kW
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="25.0"
                  step="0.1"
                  value={params.bess_dis_max_kw}
                  onChange={(e) => updateNumeric('bess_dis_max_kw', parseFloat(e.target.value) || 0.8)}
                  className="w-full accent-blue-500 cursor-pointer"
                />
              </div>

              {/* Initial SoC */}
              <div className="space-y-1 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Initial State of Charge:</span>
                  <span className="text-emerald-400 font-bold">
                    {(params.soc_init * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="1.00"
                  step="0.05"
                  value={params.soc_init}
                  onChange={(e) => updateNumeric('soc_init', parseFloat(e.target.value) || 0.5)}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SUBSYSTEM 5: PEM ELECTROLYZER */}
        {/* ========================================================= */}
        {subsystem === 'elec' && (
          <div className="space-y-3.5">
            <div className="bg-[#0b1c28] p-2.5 rounded border border-cyan-500/30 space-y-1">
              <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider block">
                Live Hydrogen Generation
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 text-[10px] block">Input Electrical Power:</span>
                  <span className="font-bold text-cyan-300 text-sm">
                    {currentStep ? Math.round(currentStep.p_elec_bus_kw * 1000) : 0} W DC
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">H₂ Production Rate:</span>
                  <span className="font-bold text-cyan-300">
                    {currentStep ? ((currentStep.m_h2_prod_kg * 1000) / 0.25).toFixed(1) : '0.0'} g/h
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">DI Water Feed:</span>
                  <span className="text-slate-200">
                    {currentStep ? (currentStep.v_di_water_l / 0.25).toFixed(2) : '0.00'} L/h
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Operating Status:</span>
                  <span className={`font-bold ${
                    currentStep && currentStep.p_elec_bus_kw > 0
                      ? 'text-cyan-400'
                      : currentTankP >= params.tank_p_max_bar
                      ? 'text-amber-400'
                      : 'text-slate-400'
                  }`}>
                    {currentStep && currentStep.p_elec_bus_kw > 0
                      ? 'ACTIVE H₂ PROD'
                      : currentTankP >= params.tank_p_max_bar
                      ? 'TANK FULL (OVERPRESSURE)'
                      : currentStep && currentStep.p_pv_bus_kw === 0
                      ? 'STANDBY (NIGHT)'
                      : 'TURNDOWN OFF / STANDBY'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3 bg-[#0e1626] p-3 rounded border border-slate-800">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Electrolyzer Specifications
              </span>

              {/* Rated Stack Power */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Rated Stack Power:</span>
                  <span className="text-cyan-400 font-bold text-sm">
                    {params.elec_rated_kw.toFixed(2)} kW ({Math.round(params.elec_rated_kw * 1000)} W)
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="20.0"
                  step="0.1"
                  value={params.elec_rated_kw}
                  onChange={(e) => updateNumeric('elec_rated_kw', parseFloat(e.target.value) || 0.5)}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
                {/* Quick Scalers */}
                <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                  <span className="text-[10px] text-slate-500">Quick Scale:</span>
                  {[0.5, 1.0, 2.0, 5.0, 8.0, 10.0].map((val) => (
                    <button
                      key={val}
                      onClick={() => updateNumeric('elec_rated_kw', val)}
                      className={`px-1.5 py-0.5 rounded text-[10px] border transition ${
                        Math.abs(params.elec_rated_kw - val) < 0.05
                          ? 'bg-cyan-600 text-white font-bold border-cyan-400'
                          : 'bg-[#162136] hover:bg-cyan-950 text-cyan-300 border-slate-700'
                      }`}
                    >
                      {val} kW
                    </button>
                  ))}
                </div>

                {/* Auto-Match Electrolyzer Button */}
                <div className="pt-2">
                  <button
                    onClick={() => {
                      const peakSurplus = Math.max(0.5, Math.round((params.pv_peak_kw * 0.82) * 10) / 10);
                      const h2PerHourKg = (peakSurplus * 0.94) / params.sec_elec_kwh_per_kg;
                      const targetDailyH2Kg = h2PerHourKg * 5.0;
                      const targetVolL = Math.max(20, Math.ceil(calculateH2TankVolumeForMass(targetDailyH2Kg, params.tank_p_max_bar, 20.0) / 5) * 5);
                      onChangeParams({
                        ...params,
                        elec_rated_kw: peakSurplus,
                        tank_volume_m3: targetVolL / 1000.0,
                      });
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white rounded font-bold text-[11px] shadow transition"
                  >
                    <Zap className="w-3.5 h-3.5 text-yellow-300" />
                    <span>⚡ Auto-Match Electrolyzer & Tank to Solar Surplus</span>
                  </button>
                </div>
              </div>

              {/* Specific Energy Consumption */}
              <div className="space-y-1 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">SEC (kWh / kg H₂):</span>
                  <span className="text-cyan-300 font-bold">
                    {params.sec_elec_kwh_per_kg.toFixed(1)} kWh/kg
                  </span>
                </div>
                <input
                  type="range"
                  min="45.0"
                  max="65.0"
                  step="0.5"
                  value={params.sec_elec_kwh_per_kg}
                  onChange={(e) => updateNumeric('sec_elec_kwh_per_kg', parseFloat(e.target.value) || 52)}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>

              {/* Turndown Guard */}
              <div className="space-y-1 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Turndown Ratio:</span>
                  <span className="text-slate-400 font-bold">
                    {(params.elec_k_turndown * 100).toFixed(0)}% ({Math.round(params.elec_k_turndown * params.elec_rated_kw * 1000)}W min)
                  </span>
                </div>
                <input
                  type="range"
                  min="0.04"
                  max="0.25"
                  step="0.01"
                  value={params.elec_k_turndown}
                  onChange={(e) => updateNumeric('elec_k_turndown', parseFloat(e.target.value) || 0.07)}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SUBSYSTEM 6: HYDROGEN STORAGE VESSEL (PRESSURE ADJUSTABLE) */}
        {/* ========================================================= */}
        {subsystem === 'tank' && (
          <div className="space-y-3.5">
            {/* Live Vessel Status */}
            <div className="bg-[#0b1626] p-2.5 rounded border border-sky-500/40 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-sky-400 font-bold uppercase tracking-wider">
                  Live Vessel Telemetry
                </span>
                <span className="text-[10px] text-cyan-300 font-bold px-1.5 py-0.2 bg-cyan-950 rounded border border-cyan-800">
                  {params.tank_p_max_bar} bar Class
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 text-[10px] block">Current Pressure:</span>
                  <span className="font-bold text-sky-300 text-sm">
                    {currentTankP.toFixed(2)} bar
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Stored H₂ Mass:</span>
                  <span className="font-bold text-cyan-300 text-sm">
                    {currentTankM.toFixed(3)} kg
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Max Mass Capacity:</span>
                  <span className="text-slate-200 font-bold">{maxStorageKg.toFixed(3)} kg</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Compressibility Z(P):</span>
                  <span className="text-slate-200 font-bold">{currentZ.toFixed(3)}</span>
                </div>
              </div>

              {currentTankP >= params.tank_p_max_bar && (
                <div className="mt-2 p-2 bg-rose-950/70 border border-rose-500/50 rounded space-y-1 text-[10px]">
                  <div className="flex items-center gap-1 text-rose-300 font-bold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>H₂ Storage Full ({params.tank_p_max_bar} bar Max Reached)</span>
                  </div>
                  <p className="text-rose-200/90 leading-tight">
                    Electrolyzer has throttled to 0 W to prevent overpressure. Increase tank volume (L) or choose a higher pressure class (200 / 350 / 700 bar) to store more H₂.
                  </p>
                </div>
              )}
            </div>

            {/* Pressure Class Selector */}
            <div className="space-y-3 bg-[#0e1626] p-3 rounded border border-slate-800">
              <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider block">
                Pressure Tier & Storage Class
              </span>

              <div className="grid grid-cols-2 gap-1.5">
                {TANK_PRESSURE_PRESETS.map((preset) => {
                  const isSelected = params.tank_p_max_bar === preset.value;
                  return (
                    <button
                      key={preset.value}
                      onClick={() => {
                        const updates = adjustTankForPressure(preset.value, params);
                        onChangeParams({
                          ...params,
                          ...updates,
                        });
                      }}
                      className={`p-1.5 rounded text-left transition border ${
                        isSelected
                          ? 'bg-sky-950/80 border-sky-400 text-sky-200 shadow font-bold'
                          : 'bg-[#141e30] border-slate-700/80 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="text-[11px] flex items-center justify-between">
                        <span>{preset.value} bar</span>
                        {isSelected && <Check className="w-3 h-3 text-sky-400" />}
                      </div>
                      <span className="text-[9px] text-slate-500 block truncate">
                        {preset.value === 1 && 'Atmospheric Gas'}
                        {preset.value === 10 && 'Buffer Vessel'}
                        {preset.value === 30 && 'Metal Hydride'}
                        {preset.value === 200 && 'Quad Cylinder'}
                        {preset.value === 350 && 'Stationary IV'}
                        {preset.value === 700 && 'Mobility IV'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Pressure Input */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                <span className="text-slate-400 text-[11px]">Custom Pressure [bar]:</span>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  step="1"
                  value={params.tank_p_max_bar}
                  onChange={(e) => {
                    const newP = parseFloat(e.target.value) || 30;
                    const updates = adjustTankForPressure(newP, params);
                    onChangeParams({
                      ...params,
                      ...updates,
                    });
                  }}
                  className="w-24 bg-[#162136] border border-slate-700 rounded px-2 py-0.5 text-right font-mono text-sky-300 font-bold focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* Geometric Tank Volume (Adjustable) */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-semibold">Geometric Volume:</span>
                  <span className="text-cyan-300 font-bold text-sm">
                    {tankVolL} Liters ({params.tank_volume_m3.toFixed(3)} m³)
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max={params.scale === '1:10' ? '250' : '2500'}
                  step="5"
                  value={tankVolL}
                  onChange={(e) =>
                    updateNumeric('tank_volume_m3', (parseFloat(e.target.value) || 50) / 1000.0)
                  }
                  className="w-full accent-cyan-500 cursor-pointer"
                />
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>Direct Liters:</span>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    step="5"
                    value={tankVolL}
                    onChange={(e) =>
                      updateNumeric('tank_volume_m3', (parseFloat(e.target.value) || 50) / 1000.0)
                    }
                    className="w-20 bg-[#162136] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-cyan-300"
                  />
                </div>
              </div>

              {/* Auto-calculate Volume Shortcut */}
              <div className="pt-1 flex justify-end">
                <button
                  onClick={() => {
                    // Size volume for target 4-day autonomy buffer
                    const targetKg = params.scale === '1:10' ? 0.32 : 3.2;
                    const vL = calculateH2TankVolumeForMass(targetKg, params.tank_p_max_bar, 20.0);
                    updateNumeric('tank_volume_m3', Math.ceil(vL) / 1000.0);
                  }}
                  className="px-2 py-1 rounded bg-[#16253d] hover:bg-[#1d3050] text-sky-300 text-[10px] font-semibold border border-sky-800/60 transition"
                >
                  ⚡ Auto-Scale Volume for {params.scale === '1:10' ? '0.32' : '3.2'} kg H₂
                </button>
              </div>

              {/* Initial Stored Mass */}
              <div className="space-y-1 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Initial Stored Mass:</span>
                  <span className="text-slate-200 font-bold">
                    {params.tank_m_h2_init_kg.toFixed(3)} kg
                  </span>
                </div>
                <input
                  type="range"
                  min="0.00"
                  max={Math.max(0.05, maxStorageKg).toFixed(3)}
                  step="0.005"
                  value={params.tank_m_h2_init_kg}
                  onChange={(e) =>
                    updateNumeric('tank_m_h2_init_kg', parseFloat(e.target.value) || 0)
                  }
                  className="w-full accent-sky-500 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SUBSYSTEM 7: PEM FUEL CELL (OPTIONAL) */}
        {/* ========================================================= */}
        {subsystem === 'fc' && (
          <div className="space-y-3.5">
            {/* Live FC Status */}
            <div className="bg-[#190f26] p-2.5 rounded border border-purple-500/40 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-purple-300 font-bold uppercase tracking-wider">
                  Live Fuel Cell Status
                </span>
                <span
                  className={`text-[9.5px] font-bold px-1.5 py-0.2 rounded ${
                    params.fc_enabled !== false
                      ? currentStep?.fc_active
                        ? 'bg-purple-950 text-purple-200 border border-purple-500'
                        : 'bg-slate-800 text-slate-400'
                      : 'bg-amber-950 text-amber-300 border border-amber-600'
                  }`}
                >
                  {params.fc_enabled !== false
                    ? currentStep?.fc_active
                      ? 'ACTIVE BACKUP'
                      : 'STANDBY'
                    : 'P2G STANDALONE'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 text-[10px] block">Injected Power:</span>
                  <span className="font-bold text-purple-300 text-sm">
                    {currentStep ? Math.round(currentStep.p_fc_bus_kw * 1000) : 0} W DC
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Fuel Burn Rate:</span>
                  <span className="font-bold text-purple-300">
                    {currentStep ? ((currentStep.m_h2_cons_kg * 1000) / 0.25).toFixed(1) : '0.0'} g/h
                  </span>
                </div>
              </div>
            </div>

            {/* FC Controls */}
            <div className="space-y-3 bg-[#0e1626] p-3 rounded border border-slate-800">
              {/* Enable / Disable Toggle */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div>
                  <span className="text-slate-200 font-semibold block text-[11px]">
                    Subsystem Installed & Active
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Disable to run microgrid in pure P2G mode
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={params.fc_enabled !== false}
                  onChange={(e) => updateBoolean('fc_enabled', e.target.checked)}
                  className="w-4 h-4 accent-purple-500 cursor-pointer"
                />
              </div>

              {/* Rated Power */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Continuous Rating:</span>
                  <span className="text-purple-300 font-bold text-sm">
                    {params.fc_rated_kw.toFixed(2)} kW
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="10.0"
                  step="0.1"
                  value={params.fc_rated_kw}
                  onChange={(e) => updateNumeric('fc_rated_kw', parseFloat(e.target.value) || 0.3)}
                  className="w-full accent-purple-500 cursor-pointer"
                />
              </div>

              {/* Optimal Setpoint */}
              <div className="space-y-1 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Optimal Setpoint:</span>
                  <span className="text-slate-200 font-bold">
                    {params.fc_opt_setpoint_kw.toFixed(2)} kW
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="8.0"
                  step="0.1"
                  value={params.fc_opt_setpoint_kw}
                  onChange={(e) => updateNumeric('fc_opt_setpoint_kw', parseFloat(e.target.value) || 0.2)}
                  className="w-full accent-purple-500 cursor-pointer"
                />
              </div>

              {/* Latch Thresholds */}
              <div className="space-y-1 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300">Turn-ON Trigger:</span>
                  <span className="text-rose-400 font-bold">
                    {(params.soc_fc_trigger_on * 100).toFixed(0)}% SoC
                  </span>
                </div>
                <input
                  type="range"
                  min="0.15"
                  max="0.40"
                  step="0.01"
                  value={params.soc_fc_trigger_on}
                  onChange={(e) => updateNumeric('soc_fc_trigger_on', parseFloat(e.target.value) || 0.25)}
                  className="w-full accent-rose-500 cursor-pointer"
                />
                <div className="flex items-center justify-between text-[11px] pt-1">
                  <span className="text-slate-300">Turn-OFF Trigger:</span>
                  <span className="text-emerald-400 font-bold">
                    {(params.soc_fc_trigger_off * 100).toFixed(0)}% SoC
                  </span>
                </div>
                <input
                  type="range"
                  min="0.25"
                  max="0.55"
                  step="0.01"
                  value={params.soc_fc_trigger_off}
                  onChange={(e) => updateNumeric('soc_fc_trigger_off', parseFloat(e.target.value) || 0.35)}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SUBSYSTEM 8: PROGRAMMABLE DC LOAD */}
        {/* ========================================================= */}
        {subsystem === 'load' && (
          <div className="space-y-3.5">
            <div className="bg-[#1c0f16] p-2.5 rounded border border-rose-500/40 space-y-1">
              <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider block">
                Live Load Demand
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 text-[10px] block">Active Draw:</span>
                  <span className="font-bold text-rose-300 text-sm">
                    {currentStep ? Math.round(currentStep.p_load_kw * 1000) : 0} W DC
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Load Current:</span>
                  <span className="font-bold text-rose-300">
                    {currentStep ? currentStep.i_load_a.toFixed(1) : '0.0'} A DC
                  </span>
                </div>
              </div>
            </div>

            {onScaleLoad && (
              <div className="space-y-3 bg-[#0e1626] p-3 rounded border border-slate-800">
                <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider block">
                  Quick Load Multiplier
                </span>
                <p className="text-[10px] text-slate-400 leading-tight">
                  Dynamically scale the current profile load demand to stress-test microgrid reserves:
                </p>
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((mult) => (
                    <button
                      key={mult}
                      onClick={() => onScaleLoad(mult)}
                      className="p-1.5 rounded bg-[#162136] hover:bg-rose-950 text-rose-300 border border-slate-700 text-center font-bold text-xs transition"
                    >
                      {mult}x Scale
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* SUBSYSTEM 9: SUPERVISORY DAQ CONTROLLER */}
        {/* ========================================================= */}
        {subsystem === 'daq' && (
          <div className="space-y-3.5">
            <div className="bg-[#121c2e] p-2.5 rounded border border-cyan-500/40 space-y-1 text-[11px]">
              <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider block">
                Supervisory DAQ Architecture
              </span>
              <p className="text-slate-300 text-[10px] leading-relaxed">
                Central industrial IPC polling sub-tier ECUs at 100 Hz, computing 4-state dispatch hysteresis and safeguarding battery against deep discharge.
              </p>
            </div>
            <div className="bg-[#0e1626] p-3 rounded border border-slate-800 space-y-2 text-[10px] font-mono">
              <span className="text-slate-400 uppercase font-bold block">Telemetry Busses</span>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-purple-300">Weather & Pyranometer:</span>
                  <span className="text-slate-400">4-20mA Current Loop</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-300">Solar MPPT:</span>
                  <span className="text-slate-400">Modbus-RTU RS485</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-300">16S LiFePO4 BMS:</span>
                  <span className="text-slate-400">CAN 2.0B 500kbps</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-300">PEM Electrolyzer:</span>
                  <span className="text-slate-400">Modbus-RTU RS485</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-300">PEM Fuel Cell ECU:</span>
                  <span className="text-slate-400">CAN 2.0B 250kbps</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Drawer Footer */}
      <div className="px-4 py-2.5 bg-[#080e1a] border-t border-slate-800 flex items-center justify-between text-[11px]">
        <span className="text-slate-400">Live Simulation Updated</span>
        <button
          onClick={onClose}
          className="px-3 py-1 bg-cyan-700 hover:bg-cyan-600 text-white rounded font-bold transition"
        >
          Done
        </button>
      </div>
    </div>
  );
};
