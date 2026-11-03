/**
 * Modular Deterministic Physics & Numerical Simulation Engine
 * 48V DC Microgrid & Power-to-Hydrogen-to-Power (P2H2P)
 * Discrete Time-Step dt = 0.25 h (15 minutes)
 */

import {
  SystemParameters,
  TimeSeriesInputStep,
  TimeSeriesOutputStep,
  SimulationSummary,
  DispatchState,
} from '../types/microgrid';

/**
 * 16S LiFePO4 Open Circuit Voltage curve lookup & smooth Hermite interpolation
 * Maps SoC (0.0 to 1.0) to pack OCV (48.0 V at 0% to 56.8 V at 100%)
 */
export function getLiFePO4_16S_OCV(soc: number): number {
  const clampedSoC = Math.max(0.0, Math.min(1.0, soc));
  
  // Empirical 16S LiFePO4 benchmark knots (Cell voltage * 16)
  // 0.00: 3.000V -> 48.00V
  // 0.05: 3.150V -> 50.40V
  // 0.10: 3.200V -> 51.20V
  // 0.20: 3.238V -> 51.80V
  // 0.50: 3.288V -> 52.60V (central plateau)
  // 0.80: 3.325V -> 53.20V
  // 0.90: 3.363V -> 53.80V
  // 0.95: 3.413V -> 54.60V
  // 1.00: 3.550V -> 56.80V
  const knots = [
    { s: 0.00, v: 48.00 },
    { s: 0.05, v: 50.40 },
    { s: 0.10, v: 51.20 },
    { s: 0.20, v: 51.80 },
    { s: 0.50, v: 52.60 },
    { s: 0.80, v: 53.20 },
    { s: 0.90, v: 53.80 },
    { s: 0.95, v: 54.60 },
    { s: 1.00, v: 56.80 },
  ];

  for (let i = 0; i < knots.length - 1; i++) {
    const k1 = knots[i];
    const k2 = knots[i + 1];
    if (clampedSoC >= k1.s && clampedSoC <= k2.s) {
      const u = (clampedSoC - k1.s) / (k2.s - k1.s);
      // Smooth cubic ease (Hermite s-curve)
      const smoothU = u * u * (3 - 2 * u);
      return k1.v + smoothU * (k2.v - k1.v);
    }
  }

  return 56.80;
}

/**
 * Closed-form analytical solution for loaded DC bus terminal voltage
 * V_bus = V_oc - I_bess * R_internal, where I_bess = P_bess_net * 1000 / V_bus
 * Quadratic: V_bus^2 - V_oc * V_bus + P_bess_net_W * R_int = 0
 */
export function calculateLoadedBusVoltage(
  v_oc: number,
  p_bess_dis_kw: number,
  p_bess_chg_kw: number,
  r_internal_ohm: number
): number {
  // P_bess_net > 0 when discharging (supplying current to bus) -> V_bus < V_oc
  // P_bess_net < 0 when charging (drawing current from bus) -> V_bus > V_oc
  const p_bess_net_kw = p_bess_dis_kw - p_bess_chg_kw;
  const p_bess_net_w = p_bess_net_kw * 1000.0;

  // Discriminant: b^2 - 4ac = V_oc^2 - 4 * (p_bess_net_w * r_internal_ohm)
  const disc = v_oc * v_oc - 4.0 * (p_bess_net_w * r_internal_ohm);
  if (disc >= 0) {
    const v_bus = (v_oc + Math.sqrt(disc)) / 2.0;
    // Physical safeguard clamp (40V to 62V for 48V nominal systems)
    return Math.max(40.0, Math.min(62.0, v_bus));
  }
  return v_oc; // fallback
}

/**
 * Hydrogen Gas Pressure Calculation via Compressibility-Corrected Real Gas Law
 * P_tank_bar = Z(P, T) * (n * R * T) / V_tank
 */
export function calculateH2TankPressure(
  m_h2_kg: number,
  tank_volume_m3: number,
  t_amb_c: number
): number {
  if (m_h2_kg <= 0 || tank_volume_m3 <= 0) return 0.0;

  const R = 8.3144626; // J / (mol * K)
  const T_kelvin = t_amb_c + 273.15;
  const moles = (m_h2_kg * 1000.0) / 2.016; // 2.016 g/mol H2

  // Ideal gas pressure in Pa
  const p_ideal_pa = (moles * R * T_kelvin) / tank_volume_m3;
  const p_ideal_bar = p_ideal_pa * 1e-5;

  // Hydrogen compressibility factor Z(P) approximation
  // Z ≈ 1 + 0.0006 * P_bar (at 298K, Z=1.018 at 30 bar, Z=1.12 at 200 bar, Z=1.21 at 350 bar)
  const Z = 1.0 + 0.0006 * p_ideal_bar;
  const p_real_bar = p_ideal_bar * Z;

  return Math.max(0.0, p_real_bar);
}

/**
 * Main Deterministic Discrete Simulation Engine
 * Executes 15-minute time-step simulation over provided profile
 */
export function runSimulation(
  inputs: TimeSeriesInputStep[],
  params: SystemParameters,
  dt_hours: number = 0.25
): { steps: TimeSeriesOutputStep[]; summary: SimulationSummary } {
  if (!inputs || inputs.length === 0) {
    throw new Error('Simulation inputs cannot be empty.');
  }

  const steps: TimeSeriesOutputStep[] = [];
  const r_internal_ohm = params.bess_r_internal_mohm / 1000.0;

  // State variables initialization
  let e_bess_kwh = params.soc_init * params.bess_cap_kwh;
  let soc = params.soc_init;
  let m_h2_tank_kg = params.tank_m_h2_init_kg;
  let fc_active = false;

  // Cumulative energy tracking for first-law conservation verification
  let cum_pv_kwh = 0.0;
  let cum_load_kwh = 0.0;
  let cum_unserved_kwh = 0.0;
  let cum_curtailed_kwh = 0.0;
  let cum_h2_prod_kg = 0.0;
  let cum_h2_cons_kg = 0.0;
  let cum_di_water_l = 0.0;

  let total_bess_charged_kwh = 0.0;
  let total_bess_discharged_kwh = 0.0;
  let total_elec_input_kwh = 0.0;
  let total_fc_output_kwh = 0.0;
  let total_o2_nm3 = 0.0;

  let state1_hours = 0.0;
  let state2_hours = 0.0;
  let state3_hours = 0.0;
  let state4_hours = 0.0;
  let fc_cycles = 0;
  let prev_fc_active = false;

  let min_soc = soc;
  let max_soc = soc;
  let peak_tank_p = calculateH2TankPressure(m_h2_tank_kg, params.tank_volume_m3, inputs[0].t_amb_c);
  let min_tank_p = peak_tank_p;

  let v_bus_min = 60.0;
  let v_bus_max = 40.0;
  let v_bus_sum = 0.0;
  let i_pv_peak = 0.0;
  let i_load_peak = 0.0;
  let i_bess_chg_peak = 0.0;
  let i_bess_dis_peak = 0.0;
  let i_elec_peak = 0.0;
  let i_fc_peak = 0.0;

  const initial_bess_chem_kwh = e_bess_kwh;
  const initial_h2_tank_kg = m_h2_tank_kg;

  for (let t = 0; t < inputs.length; t++) {
    const inp = inputs[t];
    const G = Math.max(0.0, inp.g_irr_wm2);
    const T_amb = inp.t_amb_c;
    const v_wind = inp.v_wind_ms;
    const P_load = Math.max(0.0, inp.p_load_kw);

    // 1. Solar PV & Thermal Derating Model
    const T_cell = T_amb + ((params.noct_c - 20.0) / 800.0) * G - 1.5 * v_wind;
    let P_pv_raw = 0.0;
    if (G > 0) {
      P_pv_raw =
        params.pv_peak_kw *
        (G / 1000.0) *
        (1.0 + params.gamma_t * (T_cell - 25.0)) *
        params.eta_mppt *
        params.eta_wiring;
      P_pv_raw = Math.max(0.0, P_pv_raw);
    }
    const P_pv_bus = Math.min(params.mppt_max_kw, P_pv_raw);

    // Power differential
    const P_net = P_pv_bus - P_load;

    // Dispatch variables for this step
    let state: DispatchState = 3;
    let P_bess_chg = 0.0;
    let P_bess_dis = 0.0;
    let P_elec_bus = 0.0;
    let P_fc_bus = 0.0;
    let P_curtailed = 0.0;
    let P_unserved = 0.0;
    let m_h2_prod = 0.0;
    let v_di_water = 0.0;
    let v_o2 = 0.0;
    let m_h2_cons = 0.0;

    // Check current tank pressure before decision
    const p_tank_current = calculateH2TankPressure(m_h2_tank_kg, params.tank_volume_m3, T_amb);

    // 2. 4-State Hysteresis Dispatch Controller (Strict Priority Rules)
    if (P_net > 0) {
      // Surplus solar generation available!
      // Fuel Cell cannot be active when solar surplus exists
      fc_active = false;

      // Absorption taper limit calculation:
      // If SoC > 0.90, linearly taper max charge power from P_bess_chg_max down to 0.05 * E_bess_cap at SoC = 1.0
      let P_chg_limit = params.bess_chg_max_kw;
      if (soc > params.soc_absorption_taper) {
        const taper_fraction = Math.min(1.0, (soc - params.soc_absorption_taper) / (params.soc_max - params.soc_absorption_taper));
        const P_taper_floor = 0.05 * params.bess_cap_kwh;
        P_chg_limit = params.bess_chg_max_kw - taper_fraction * (params.bess_chg_max_kw - P_taper_floor);
      }

      // Max power BESS can absorb before reaching SoC_max
      const max_bess_absorb_energy_power = ((params.soc_max - soc) * params.bess_cap_kwh) / (dt_hours * params.eta_bess_chg);
      const P_bess_capacity_accept = Math.max(0.0, Math.min(P_chg_limit, max_bess_absorb_energy_power));

      // STATE 1: BESS Priority Charging
      if (soc < 0.999) {
        state = 1;
        P_bess_chg = Math.min(P_net, P_bess_capacity_accept);
        const P_surplus = P_net - P_bess_chg;

        // If battery didn't take all surplus (due to taper or charge rate ceiling)
        // If battery reaches >= 0.999 in this step, can remainder go to electrolyzer?
        // Let's compute post-step SoC estimate
        const dE_bess_chem = P_bess_chg * params.eta_bess_chg * dt_hours;
        const post_soc = Math.min(params.soc_max, (e_bess_kwh + dE_bess_chem) / params.bess_cap_kwh);

        if (post_soc >= 0.999 && P_surplus > 0 && p_tank_current < params.tank_p_max_bar) {
          // Can produce H2 from leftover surplus!
          const P_elec_min = params.elec_k_turndown * params.elec_rated_kw;
          if (P_surplus * params.eta_elec_dcdc >= P_elec_min) {
            P_elec_bus = Math.min(P_surplus, params.elec_rated_kw / params.eta_elec_dcdc);
            m_h2_prod = (P_elec_bus * params.eta_elec_dcdc * dt_hours) / params.sec_elec_kwh_per_kg;
            v_di_water = m_h2_prod * params.di_water_l_per_kg_h2;
            v_o2 = (m_h2_prod * 11.12) * 0.5;
            P_curtailed = P_surplus - P_elec_bus;
            state = 2; // Electrolyzer engaged
          } else {
            P_curtailed = P_surplus;
          }
        } else {
          P_curtailed = P_surplus;
        }
      } else {
        // STATE 2: Excess Solar to PEM Electrolyzer (Battery is fully charged at SoC >= 0.999)
        state = 2;
        // Float trickle charge if needed
        P_bess_chg = Math.min(P_net, Math.max(0.0, max_bess_absorb_energy_power));
        const P_surplus = Math.max(0.0, P_net - P_bess_chg);

        if (p_tank_current < params.tank_p_max_bar) {
          const P_elec_min = params.elec_k_turndown * params.elec_rated_kw;
          if (P_surplus * params.eta_elec_dcdc >= P_elec_min) {
            P_elec_bus = Math.min(P_surplus, params.elec_rated_kw / params.eta_elec_dcdc);
            m_h2_prod = (P_elec_bus * params.eta_elec_dcdc * dt_hours) / params.sec_elec_kwh_per_kg;
            v_di_water = m_h2_prod * params.di_water_l_per_kg_h2;
            v_o2 = (m_h2_prod * 11.12) * 0.5;
            P_curtailed = Math.max(0.0, P_surplus - P_elec_bus);
          } else {
            // Surplus below electrolyzer turndown safety guard
            P_elec_bus = 0.0;
            P_curtailed = P_surplus;
          }
        } else {
          // Tank reached maximum allowable pressure
          P_elec_bus = 0.0;
          P_curtailed = P_surplus;
        }
      }
    } else {
      // Deficit condition: P_net <= 0
      const P_def = -P_net; // Positive demand deficit

      // Max power BESS can supply while staying above soc_min
      const max_bess_dis_energy_power = Math.max(
        0.0,
        ((soc - params.soc_min) * params.bess_cap_kwh * params.eta_bess_dis) / dt_hours
      );
      const P_bess_dis_limit = Math.min(params.bess_dis_max_kw, max_bess_dis_energy_power);

      // Check if Fuel Cell latch should turn ON
      if (soc <= params.soc_fc_trigger_on && m_h2_tank_kg > params.tank_m_h2_min_kg) {
        fc_active = true;
      }

      if (fc_active && m_h2_tank_kg > params.tank_m_h2_min_kg) {
        // STATE 4: PEM Fuel Cell Range-Extender Mode
        state = 4;

        // Target FC power: cover load deficit plus charge BESS toward optimal setpoint
        const P_fc_target = Math.min(
          params.fc_rated_kw,
          Math.max(P_def, params.fc_opt_setpoint_kw)
        );

        // Limit FC output to available stored H2
        const available_h2_kg = Math.max(0.0, m_h2_tank_kg - params.tank_m_h2_min_kg);
        const P_fc_max_from_h2 =
          (available_h2_kg *
            params.lhv_h2_kwh_per_kg *
            params.eta_fc_stack *
            params.eta_fc_dcdc) /
          dt_hours;

        let P_fc_possible = Math.min(P_fc_target, P_fc_max_from_h2);

        if (P_fc_possible >= P_def) {
          // FC covers entire deficit!
          const P_fc_surplus = P_fc_possible - P_def;
          // Charge BESS with FC surplus
          const max_bess_absorb = ((params.soc_max - soc) * params.bess_cap_kwh) / (dt_hours * params.eta_bess_chg);
          P_bess_chg = Math.min(P_fc_surplus, Math.min(params.bess_chg_max_kw, max_bess_absorb));
          
          // Modulate FC power down to exact needed (P_def + P_bess_chg) to avoid wasteful fuel venting
          P_fc_bus = P_def + P_bess_chg;
          P_bess_dis = 0.0;
          P_unserved = 0.0;
        } else {
          // FC covers part of deficit; BESS covers remainder
          P_fc_bus = P_fc_possible;
          const P_def_rem = P_def - P_fc_bus;
          P_bess_dis = Math.min(P_def_rem, P_bess_dis_limit);
          P_unserved = Math.max(0.0, P_def_rem - P_bess_dis);
          P_bess_chg = 0.0;
        }

        // Calculate H2 mass consumed
        m_h2_cons =
          (P_fc_bus * dt_hours) /
          (params.lhv_h2_kwh_per_kg * params.eta_fc_stack * params.eta_fc_dcdc);
      } else {
        // STATE 3: Normal BESS Discharge
        state = 3;
        fc_active = false;
        P_bess_dis = Math.min(P_def, P_bess_dis_limit);
        P_unserved = Math.max(0.0, P_def - P_bess_dis);
        P_bess_chg = 0.0;
        P_fc_bus = 0.0;
      }
    }

    // 3. State Integrations
    // Update BESS chemical energy
    if (P_bess_chg > 0) {
      e_bess_kwh += P_bess_chg * params.eta_bess_chg * dt_hours;
    } else if (P_bess_dis > 0) {
      e_bess_kwh -= (P_bess_dis / params.eta_bess_dis) * dt_hours;
    }
    e_bess_kwh = Math.max(params.soc_min * params.bess_cap_kwh, Math.min(params.bess_cap_kwh, e_bess_kwh));
    soc = e_bess_kwh / params.bess_cap_kwh;

    // Check State 4 latch reset conditions for next step
    if (fc_active) {
      if (soc >= params.soc_fc_trigger_off || m_h2_tank_kg <= params.tank_m_h2_min_kg) {
        fc_active = false;
      }
    }

    // Update H2 Storage Tank Mass
    m_h2_tank_kg = Math.max(0.0, m_h2_tank_kg + m_h2_prod - m_h2_cons);
    const p_tank_bar = calculateH2TankPressure(m_h2_tank_kg, params.tank_volume_m3, T_amb);

    // 4. Electrical Bus & Branch Currents Approximation
    const v_oc_bess = getLiFePO4_16S_OCV(soc);
    const v_bus = calculateLoadedBusVoltage(v_oc_bess, P_bess_dis, P_bess_chg, r_internal_ohm);

    // Branch currents in Amperes: I = P [W] / V_bus [V]
    const i_pv = (P_pv_bus * 1000.0) / v_bus;
    const i_load = (P_load * 1000.0) / v_bus;
    const i_bess = ((P_bess_dis - P_bess_chg) * 1000.0) / v_bus;
    const i_elec = (P_elec_bus * 1000.0) / v_bus;
    const i_fc = (P_fc_bus * 1000.0) / v_bus;
    const i_curtailed = (P_curtailed * 1000.0) / v_bus;
    const i_unserved = (P_unserved * 1000.0) / v_bus;

    // Kirchhoff's Current Law check:
    // Sources into DC Bus: PV, FC, BESS (discharging)
    // Sinks from DC Bus: Load, Electrolyzer, BESS (charging), Curtailed
    // Residual: (I_pv + I_fc + I_bess_net) - (I_load_served + I_elec + I_curtailed)
    const kcl_residual = (i_pv + i_fc + i_bess) - (i_load - i_unserved + i_elec + i_curtailed);

    // Track cycle starts
    if (fc_active && !prev_fc_active) {
      fc_cycles++;
    }
    prev_fc_active = fc_active;

    // Track cumulative step metrics
    cum_pv_kwh += P_pv_bus * dt_hours;
    cum_load_kwh += P_load * dt_hours;
    cum_unserved_kwh += P_unserved * dt_hours;
    cum_curtailed_kwh += P_curtailed * dt_hours;
    cum_h2_prod_kg += m_h2_prod;
    cum_h2_cons_kg += m_h2_cons;
    cum_di_water_l += v_di_water;

    total_bess_charged_kwh += P_bess_chg * dt_hours;
    total_bess_discharged_kwh += P_bess_dis * dt_hours;
    total_elec_input_kwh += P_elec_bus * dt_hours;
    total_fc_output_kwh += P_fc_bus * dt_hours;
    total_o2_nm3 += v_o2;

    if (state === 1) state1_hours += dt_hours;
    else if (state === 2) state2_hours += dt_hours;
    else if (state === 3) state3_hours += dt_hours;
    else if (state === 4) state4_hours += dt_hours;

    min_soc = Math.min(min_soc, soc);
    max_soc = Math.max(max_soc, soc);
    peak_tank_p = Math.max(peak_tank_p, p_tank_bar);
    min_tank_p = Math.min(min_tank_p, p_tank_bar);

    v_bus_min = Math.min(v_bus_min, v_bus);
    v_bus_max = Math.max(v_bus_max, v_bus);
    v_bus_sum += v_bus;

    i_pv_peak = Math.max(i_pv_peak, i_pv);
    i_load_peak = Math.max(i_load_peak, i_load);
    if (P_bess_chg > 0) i_bess_chg_peak = Math.max(i_bess_chg_peak, Math.abs(i_bess));
    if (P_bess_dis > 0) i_bess_dis_peak = Math.max(i_bess_dis_peak, Math.abs(i_bess));
    i_elec_peak = Math.max(i_elec_peak, i_elec);
    i_fc_peak = Math.max(i_fc_peak, i_fc);

    steps.push({
      step: inp.step,
      timestamp: inp.timestamp,
      day: inp.day,
      hour: inp.hour,
      g_irr_wm2: inp.g_irr_wm2,
      t_amb_c: inp.t_amb_c,
      v_wind_ms: inp.v_wind_ms,
      p_load_kw: inp.p_load_kw,
      t_cell_c: T_cell,
      p_pv_raw_kw: P_pv_raw,
      p_pv_bus_kw: P_pv_bus,
      p_net_kw: P_net,
      state,
      fc_active,
      p_bess_chg_kw: P_bess_chg,
      p_bess_dis_kw: P_bess_dis,
      soc,
      e_bess_kwh,
      p_elec_bus_kw: P_elec_bus,
      m_h2_prod_kg: m_h2_prod,
      v_di_water_l: v_di_water,
      v_o2_nm3: v_o2,
      p_fc_bus_kw: P_fc_bus,
      m_h2_cons_kg: m_h2_cons,
      m_h2_tank_kg,
      p_tank_bar,
      p_curtailed_kw: P_curtailed,
      p_unserved_kw: P_unserved,
      v_oc_bess_v: v_oc_bess,
      v_bus_v: v_bus,
      i_pv_a: i_pv,
      i_load_a: i_load,
      i_bess_a: i_bess,
      i_elec_a: i_elec,
      i_fc_a: i_fc,
      i_curtailed_a: i_curtailed,
      kcl_residual_a: kcl_residual,
      cum_pv_kwh,
      cum_load_kwh,
      cum_unserved_kwh,
      cum_curtailed_kwh,
      cum_h2_prod_kg,
      cum_h2_cons_kg,
      cum_di_water_l,
    });
  }

  // 5. Rigorous First-Law Energy Conservation Audit
  // Total Energy In: PV Generation
  const e_in_kwh = cum_pv_kwh;

  // Total Energy Out: Load Served + Curtailed
  const total_load_served_kwh = cum_load_kwh - cum_unserved_kwh;

  // BESS conversion losses
  // Chemical energy stored in battery = E_bess
  // Energy lost in charging = P_chg * (1 - eta_chg)
  // Energy lost in discharging = P_dis * (1/eta_dis - 1)
  const bess_losses_kwh =
    total_bess_charged_kwh * (1.0 - params.eta_bess_chg) +
    total_bess_discharged_kwh * (1.0 / params.eta_bess_dis - 1.0);

  // Storage chemical change
  const final_bess_chem_kwh = e_bess_kwh;
  const delta_bess_chem_kwh = final_bess_chem_kwh - initial_bess_chem_kwh;

  // Hydrogen P2H2P conversions & losses:
  // Electrolyzer electrical in = total_elec_input_kwh
  // Chemical energy generated in H2 = cum_h2_prod_kg * LHV_h2
  const h2_chem_energy_produced_kwh = cum_h2_prod_kg * params.lhv_h2_kwh_per_kg;
  const elec_losses_kwh = Math.max(0.0, total_elec_input_kwh - h2_chem_energy_produced_kwh);

  // Fuel cell chemical in = cum_h2_cons_kg * LHV_h2
  // Fuel cell electrical out = total_fc_output_kwh
  const h2_chem_energy_consumed_kwh = cum_h2_cons_kg * params.lhv_h2_kwh_per_kg;
  const fc_losses_kwh = Math.max(0.0, h2_chem_energy_consumed_kwh - total_fc_output_kwh);

  // Net storage change in H2 tank
  const delta_h2_tank_chem_kwh = (m_h2_tank_kg - initial_h2_tank_kg) * params.lhv_h2_kwh_per_kg;

  // Total storage change
  const delta_storage_kwh = delta_bess_chem_kwh + delta_h2_tank_chem_kwh;

  // Total accounted outputs and irreversibilities
  const e_out_kwh =
    total_load_served_kwh +
    cum_curtailed_kwh +
    bess_losses_kwh +
    elec_losses_kwh +
    fc_losses_kwh;

  // First Law Balance: E_in = E_out + delta_storage
  const energy_residual_kwh = Math.abs(e_in_kwh - (e_out_kwh + delta_storage_kwh));
  const energy_conservation_pass = energy_residual_kwh < 1e-4;

  const total_steps = inputs.length;
  const duration_days = (total_steps * dt_hours) / 24.0;
  const lpsp_percent = cum_load_kwh > 0 ? (cum_unserved_kwh / cum_load_kwh) * 100.0 : 0.0;
  const curtailment_percent = cum_pv_kwh > 0 ? (cum_curtailed_kwh / cum_pv_kwh) * 100.0 : 0.0;

  const bess_rt_eff =
    total_bess_charged_kwh > 0
      ? (total_bess_discharged_kwh / total_bess_charged_kwh) * 100.0
      : 100.0 * params.eta_bess_chg * params.eta_bess_dis;

  const p2h2p_rt_eff =
    total_elec_input_kwh > 0 ? (total_fc_output_kwh / total_elec_input_kwh) * 100.0 : 0.0;

  const summary: SimulationSummary = {
    total_steps,
    duration_days,
    dt_hours,
    total_pv_gen_kwh: cum_pv_kwh,
    total_load_demand_kwh: cum_load_kwh,
    total_load_served_kwh,
    total_unserved_kwh: cum_unserved_kwh,
    lpsp_percent,
    total_curtailed_kwh: cum_curtailed_kwh,
    curtailment_percent,
    bess_total_charged_kwh: total_bess_charged_kwh,
    bess_total_discharged_kwh: total_bess_discharged_kwh,
    bess_round_trip_eff_percent: bess_rt_eff,
    bess_net_chem_energy_change_kwh: delta_bess_chem_kwh,
    bess_dissipated_losses_kwh: bess_losses_kwh,
    min_soc,
    max_soc,
    final_soc: soc,
    total_h2_prod_kg: cum_h2_prod_kg,
    total_h2_prod_nm3: cum_h2_prod_kg * 11.12, // 1 kg H2 ≈ 11.12 Nm³ at STP
    total_h2_cons_kg: cum_h2_cons_kg,
    net_h2_balance_kg: m_h2_tank_kg - initial_h2_tank_kg,
    final_h2_tank_kg: m_h2_tank_kg,
    peak_tank_pressure_bar: peak_tank_p,
    min_tank_pressure_bar: min_tank_p,
    final_tank_pressure_bar: calculateH2TankPressure(m_h2_tank_kg, params.tank_volume_m3, inputs[inputs.length - 1].t_amb_c),
    total_di_water_consumed_l: cum_di_water_l,
    total_o2_produced_nm3: total_o2_nm3,
    elec_total_input_kwh: total_elec_input_kwh,
    fc_total_output_kwh: total_fc_output_kwh,
    p2h2p_round_trip_eff_percent: p2h2p_rt_eff,
    time_in_state_1_hours: state1_hours,
    time_in_state_2_hours: state2_hours,
    time_in_state_3_hours: state3_hours,
    time_in_state_4_hours: state4_hours,
    fc_start_cycles: fc_cycles,
    v_bus_min_v: v_bus_min,
    v_bus_max_v: v_bus_max,
    v_bus_avg_v: v_bus_sum / total_steps,
    i_pv_peak_a: i_pv_peak,
    i_load_peak_a: i_load_peak,
    i_bess_chg_peak_a: i_bess_chg_peak,
    i_bess_dis_peak_a: i_bess_dis_peak,
    i_elec_peak_a: i_elec_peak,
    i_fc_peak_a: i_fc_peak,
    e_in_kwh,
    e_out_kwh,
    delta_storage_kwh,
    energy_conservation_residual_kwh: energy_residual_kwh,
    energy_conservation_pass,
  };

  return { steps, summary };
}
