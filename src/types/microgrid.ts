/**
 * Microgrid & P2H2P System Simulation Types & Interfaces
 * 48V DC Bus Architecture with Solar PV, BESS, PEM Electrolyzer, PEM Fuel Cell, and Programmable DC Load
 */

export interface SystemParameters {
  // Scaling
  scale: '1:1' | '1:10'; // 1:1 Community/Microgrid vs 1:10 Lab Benchtop scale

  // 1. Weather & Solar PV Branch
  pv_peak_kw: number;         // Peak STC rating (e.g. 12.0 kW in 1:1, 1.2 kW in 1:10)
  mppt_max_kw: number;        // MPPT converter power ceiling (e.g. 12.5 kW in 1:1, 1.25 kW in 1:10)
  noct_c: number;             // Nominal Operating Cell Temp (default 45°C)
  gamma_t: number;            // Temperature coefficient of power (%/°C, default -0.38% / °C = -0.0038)
  eta_mppt: number;           // MPPT DC-DC conversion efficiency (default 0.98)
  eta_wiring: number;         // Wiring and mismatch efficiency (default 0.98)

  // 2. Battery Energy Storage System (BESS) Branch
  bess_cap_kwh: number;       // Nominal capacity (e.g. 30.72 kWh / 600Ah at 51.2V in 1:1; 3.07 kWh in 1:10)
  bess_chg_max_kw: number;    // Max continuous charge power (e.g. 6.0 kW in 1:1, 0.6 kW in 1:10)
  bess_dis_max_kw: number;    // Max continuous discharge power (e.g. 8.0 kW in 1:1, 0.8 kW in 1:10)
  soc_init: number;           // Initial State of Charge (0.0 to 1.0, e.g. 0.50)
  soc_min: number;            // Minimum allowable SoC cutoff (default 0.15)
  soc_max: number;            // Maximum allowable SoC cutoff (default 1.00)
  eta_bess_chg: number;       // Battery charge Coulombic/round-trip one-way efficiency (default 0.95)
  eta_bess_dis: number;       // Battery discharge one-way efficiency (default 0.95)
  bess_r_internal_mohm: number; // Internal resistance of 16S pack (e.g. 15 mOhm = 0.015 Ohm)

  // 3. Hydrogen Production Branch (PEM Electrolyzer)
  elec_rated_kw: number;      // Electrolyzer rated stack power (e.g. 5.0 kW in 1:1, 0.5 kW in 1:10)
  elec_k_turndown: number;    // Minimum turndown ratio for safe operation (default 0.07 = 7%)
  sec_elec_kwh_per_kg: number;// Specific Energy Consumption (default 52.0 kWh/kg H2)
  eta_elec_dcdc: number;      // Step-down CC/CV DC-DC converter efficiency (default 0.94)
  di_water_l_per_kg_h2: number; // DI water stoichiometric + purge ratio (default 11.0 L/kg H2)

  // 4. Hydrogen Storage & DI Water Tank
  tank_volume_m3: number;     // Physical geometric volume of H2 cylinder (e.g. 0.50 m³ = 500 L)
  tank_p_max_bar: number;     // Maximum working pressure rating (e.g. 1, 10, 30, 200, 350, 700 bar)
  tank_m_h2_init_kg: number;  // Initial stored H2 mass (e.g. 0.5 kg)
  tank_m_h2_min_kg: number;   // Minimum residual H2 mass (e.g. 0.05 kg)

  // 5. Hydrogen Re-Electrification Branch (PEM Fuel Cell) - OPTIONAL
  fc_enabled: boolean;        // Whether PEM Fuel Cell subsystem is installed and enabled (optional)
  fc_rated_kw: number;        // Fuel cell rated continuous power (e.g. 3.0 kW in 1:1, 0.3 kW in 1:10)
  fc_opt_setpoint_kw: number; // Preferred optimal operating setpoint (e.g. 2.0 kW in 1:1, 0.2 kW in 1:10)
  lhv_h2_kwh_per_kg: number;  // Lower Heating Value of H2 (33.33 kWh/kg)
  eta_fc_stack: number;       // PEM Fuel cell stack efficiency (default 0.52)
  eta_fc_dcdc: number;        // Unidirectional Step-Up Boost DC-DC converter efficiency (default 0.95)

  // 6. Control State-Machine Thresholds
  soc_fc_trigger_on: number;  // SoC threshold to latch Fuel Cell ON (default 0.25)
  soc_fc_trigger_off: number; // SoC threshold to unlatch Fuel Cell OFF (default 0.35)
  soc_absorption_taper: number; // SoC above which BESS charge power linearly tapers (default 0.90)
}

export type DispatchState = 1 | 2 | 3 | 4;
// 1 = BESS Priority Charging
// 2 = Excess Solar to PEM Electrolyzer
// 3 = Normal BESS Discharge
// 4 = PEM Fuel Cell Range-Extender Mode

export interface TimeSeriesInputStep {
  step: number;
  timestamp: string;      // e.g. "2017-01-01 12:15"
  day: number;            // 1 to 31
  hour: number;           // 0.0 to 23.75
  g_irr_wm2: number;      // Pyranometer solar irradiance [W/m²]
  t_amb_c: number;        // Ambient temperature [°C]
  v_wind_ms: number;      // Wind speed [m/s]
  p_load_kw: number;      // DC Load profile demand [kW]
}

export interface TimeSeriesOutputStep extends TimeSeriesInputStep {
  // Solar PV Branch
  t_cell_c: number;
  p_pv_raw_kw: number;
  p_pv_bus_kw: number;    // After MPPT and derating

  // Power balance
  p_net_kw: number;       // P_pv_bus - P_load
  state: DispatchState;
  fc_active: boolean;

  // BESS Branch
  p_bess_chg_kw: number;  // Power absorbed from 48V bus
  p_bess_dis_kw: number;  // Power delivered to 48V bus
  soc: number;            // State of Charge (0.0 to 1.0)
  e_bess_kwh: number;     // Stored electrical energy

  // PEM Electrolyzer Branch
  p_elec_bus_kw: number;  // Power drawn from 48V bus
  m_h2_prod_kg: number;   // H2 mass produced in this dt
  v_di_water_l: number;   // DI water consumed in this dt
  v_o2_nm3: number;       // O2 gas produced in this dt

  // PEM Fuel Cell Branch
  p_fc_bus_kw: number;    // Power injected into 48V bus
  m_h2_cons_kg: number;   // H2 mass consumed in this dt

  // Hydrogen Storage Tank
  m_h2_tank_kg: number;   // Cumulative stored H2 mass in pressurized cylinder
  p_tank_bar: number;     // Internal pressure [bar]

  // Curtailment & Deficit
  p_curtailed_kw: number; // Curtailed solar power
  p_unserved_kw: number;  // Loss of power supply / unserved load

  // Electrical 48V Bus
  v_oc_bess_v: number;    // 16S LiFePO4 open circuit voltage
  v_bus_v: number;        // Loaded 48V DC bus terminal voltage
  i_pv_a: number;         // PV branch current into bus [A]
  i_load_a: number;       // Load branch current from bus [A]
  i_bess_a: number;       // BESS net current (+ = discharge to bus, - = charge from bus) [A]
  i_elec_a: number;       // Electrolyzer current from bus [A]
  i_fc_a: number;         // Fuel cell current into bus [A]
  i_curtailed_a: number;  // Equivalent curtailed current [A]
  kcl_residual_a: number; // Sum of nodal currents (should be ~0.0)

  // Cumulative metrics at this step
  cum_pv_kwh: number;
  cum_load_kwh: number;
  cum_unserved_kwh: number;
  cum_curtailed_kwh: number;
  cum_h2_prod_kg: number;
  cum_h2_cons_kg: number;
  cum_di_water_l: number;
}

export interface SimulationSummary {
  total_steps: number;
  duration_days: number;
  dt_hours: number;

  // Energy totals (kWh)
  total_pv_gen_kwh: number;
  total_load_demand_kwh: number;
  total_load_served_kwh: number;
  total_unserved_kwh: number;
  lpsp_percent: number;   // Loss of Power Supply Probability (%)
  total_curtailed_kwh: number;
  curtailment_percent: number;

  // BESS Audit
  bess_total_charged_kwh: number;
  bess_total_discharged_kwh: number;
  bess_round_trip_eff_percent: number;
  bess_net_chem_energy_change_kwh: number;
  bess_dissipated_losses_kwh: number;
  min_soc: number;
  max_soc: number;
  final_soc: number;

  // Hydrogen & Water Audit
  total_h2_prod_kg: number;
  total_h2_prod_nm3: number;
  total_h2_cons_kg: number;
  net_h2_balance_kg: number;
  final_h2_tank_kg: number;
  peak_tank_pressure_bar: number;
  min_tank_pressure_bar: number;
  final_tank_pressure_bar: number;

  // Pressure-Adjustable Hydrogen Storage Vessel Audit
  tank_volume_liters: number;
  tank_storage_capacity_kg: number;
  tank_pressure_class_bar: number;

  // Fuel Cell System Status
  fc_enabled: boolean;

  total_di_water_consumed_l: number;
  total_o2_produced_nm3: number;
  elec_total_input_kwh: number;
  fc_total_output_kwh: number;
  p2h2p_round_trip_eff_percent: number;

  // State Machine Statistics
  time_in_state_1_hours: number; // State 1: BESS Charging
  time_in_state_2_hours: number; // State 2: Electrolyzer Active
  time_in_state_3_hours: number; // State 3: BESS Discharging
  time_in_state_4_hours: number; // State 4: Fuel Cell Range Extender
  fc_start_cycles: number;

  // Electrical Bus Extremes
  v_bus_min_v: number;
  v_bus_max_v: number;
  v_bus_avg_v: number;
  i_pv_peak_a: number;
  i_load_peak_a: number;
  i_bess_chg_peak_a: number;
  i_bess_dis_peak_a: number;
  i_elec_peak_a: number;
  i_fc_peak_a: number;

  // First Law of Thermodynamics / Energy Conservation Audit
  e_in_kwh: number;
  e_out_kwh: number;
  delta_storage_kwh: number;
  energy_conservation_residual_kwh: number;
  energy_conservation_pass: boolean; // Residual < 1e-4 kWh
}

export interface PresetScenario {
  id: string;
  name: string;
  description: string;
  days: number;
  stepCount: number;
  dt_hours: number;
  isScaledBenchtop?: boolean;
  generator: () => TimeSeriesInputStep[];
}

export interface AutoSizingTargets {
  target_full_charge_hour: number;  // e.g. 12.5 (12:30 PM)
  max_allowable_dod_percent: number; // e.g. 80% (SoC min = 20%)
  target_autonomy_nights: number;    // e.g. 1 night without fuel cell
  target_daily_h2_kg: number;        // e.g. 0.8 kg/day
  minimize_curtailment: boolean;
  tank_pressure_class_bar: number;   // 30, 200, or 350 bar
}

export interface SizingRecommendation {
  pv_peak_kw: number;
  mppt_rating_a: number;
  mppt_power_kw: number;
  bess_capacity_kwh: number;
  bess_capacity_ah: number;
  bess_bidirectional_dcdc_kw: number;
  elec_rated_kw: number;
  fc_rated_kw: number;
  tank_volume_l: number;
  tank_volume_m3: number;
  tank_pressure_bar: number;
  di_water_tank_l: number;
  explanation: {
    pv: string;
    bess: string;
    elec: string;
    fc: string;
    tank: string;
    water: string;
  };
}

export interface SwitchgearItem {
  branchName: string;
  role: string;
  peakCurrentSim_A: number;
  continuousDesignCurrent_A: number; // 1.25x
  recommendedMcbRating_A: number;     // Next standard DIN MCB size
  recommendedFuseType: string;       // e.g. "10x38 gPV" or "DIN 2P DC MCB"
  recommendedCableSize_mm2: number;  // IEC Copper mm²
  recommendedAwg: string;            // AWG equivalent
  maxOneWayLength_m: number;
  voltageDrop_percent: number;
  estimatedCostUsd: number;
}
