/**
 * Automated Component Sizing Solver
 * Analytical + Iterative algorithm to size PV array, BESS, PEM Electrolyzer, Fuel Cell, and Tanks
 */

import {
  AutoSizingTargets,
  SizingRecommendation,
  SystemParameters,
  TimeSeriesInputStep,
} from '../types/microgrid';

export function solveMicrogridComponentSizes(
  inputs: TimeSeriesInputStep[],
  targets: AutoSizingTargets,
  currentParams: SystemParameters
): SizingRecommendation {
  const dt = 0.25;
  const isScale10 = currentParams.scale === '1:10';
  const scaleMultiplier = isScale10 ? 0.1 : 1.0;

  // 1. Analyze Active Load Profile
  let totalLoadEnergy = 0.0;
  let peakLoadKw = 0.0;
  let nightLoadEnergy = 0.0;
  let morningLoadEnergy = 0.0; // Sunrise (6.25h) to target hour (e.g. 12.5h)

  const days = Math.max(1, Math.round((inputs.length * dt) / 24.0));

  for (const step of inputs) {
    totalLoadEnergy += step.p_load_kw * dt;
    if (step.p_load_kw > peakLoadKw) {
      peakLoadKw = step.p_load_kw;
    }

    // Night hours: 19:00 to 06:15
    if (step.hour < 6.25 || step.hour >= 19.0) {
      nightLoadEnergy += step.p_load_kw * dt;
    }

    // Morning hours: 6.25 to target_full_charge_hour
    if (step.hour >= 6.25 && step.hour <= targets.target_full_charge_hour) {
      morningLoadEnergy += step.p_load_kw * dt;
    }
  }

  const avgDailyLoadKwh = totalLoadEnergy / days;
  const avgNightLoadKwh = nightLoadEnergy / days;
  const avgMorningLoadKwh = morningLoadEnergy / days;

  // 2. BESS Sizing:
  // Target allowable DoD (e.g. 80%) & night autonomy without fuel cell
  const maxDod = Math.max(0.40, Math.min(0.90, targets.max_allowable_dod_percent / 100.0));
  const etaDis = currentParams.eta_bess_dis;
  const etaChg = currentParams.eta_bess_chg;

  // Usable energy required to cover night load with desired autonomy factor
  const requiredUsableKwh = (avgNightLoadKwh * targets.target_autonomy_nights) / etaDis;
  let bessCapacityKwh = requiredUsableKwh / maxDod;

  // Ensure minimum capacity to support peak load C-rate without excessive voltage sag
  const minCapByRate = (peakLoadKw / 0.5); // Max 0.5C discharge
  bessCapacityKwh = Math.max(bessCapacityKwh, minCapByRate);

  // Round to realistic standard 16S battery module increments
  // (e.g. 5.12 kWh 100Ah modules or 15.36 kWh 300Ah packs)
  const moduleStepKwh = isScale10 ? 0.512 : 5.12;
  bessCapacityKwh = Math.ceil(bessCapacityKwh / moduleStepKwh) * moduleStepKwh;
  const bessCapacityAh = (bessCapacityKwh * 1000.0) / 51.2;

  // Bidirectional DC-DC Converter rating: Peak load * 1.25 safety factor
  let bessDcdcKw = Math.ceil((peakLoadKw * 1.25) * 10) / 10;
  bessDcdcKw = Math.max(bessDcdcKw, bessCapacityKwh * 0.25);

  // 3. Solar PV Array Sizing (Target 1: reach 100% SoC by target_full_charge_hour)
  // Battery deficit to replenish in morning: maxDod * Capacity / etaChg
  const morningBatteryDeficitKwh = (maxDod * bessCapacityKwh) / etaChg;
  const totalMorningDemandKwh = avgMorningLoadKwh + morningBatteryDeficitKwh;

  // Clear-day PSH from sunrise (06:15) to target hour (e.g. 12:30)
  // Integral of sin^1.3 from 6.25 to 12.5 with peak 950 W/m² yields approx 2.45 PSH
  const morningHours = Math.max(1.0, targets.target_full_charge_hour - 6.25);
  const morningPsh = 2.45 * (morningHours / 6.25);
  const pvDerate = currentParams.eta_mppt * currentParams.eta_wiring * 0.90; // thermal derate ~10%

  let pvPeakKw = totalMorningDemandKwh / (morningPsh * pvDerate);

  // Check Target 3: Afternoon solar surplus to meet target daily H2 yield
  const secElec = currentParams.sec_elec_kwh_per_kg;
  const targetH2Kg = targets.target_daily_h2_kg * scaleMultiplier;
  const h2EnergyDemandKwh = (targetH2Kg * secElec) / currentParams.eta_elec_dcdc;

  // Afternoon PSH (12:30 to 18:30) is approx 2.6 PSH
  const afternoonPsh = 2.6;
  const afternoonLoadKwh = avgDailyLoadKwh - avgNightLoadKwh - avgMorningLoadKwh;
  const totalAfternoonDemandKwh = afternoonLoadKwh + h2EnergyDemandKwh;
  const pvForAfternoonKw = totalAfternoonDemandKwh / (afternoonPsh * pvDerate);

  pvPeakKw = Math.max(pvPeakKw, pvForAfternoonKw);
  pvPeakKw = Math.ceil(pvPeakKw * 10) / 10;

  // MPPT Sizing
  const mpptPowerKw = Math.ceil(pvPeakKw * 1.05 * 10) / 10;
  const mpptCurrentA = Math.ceil(((mpptPowerKw * 1000.0) / 48.0) * 1.25);

  // 4. PEM Electrolyzer Sizing
  // Rated to absorb the peak afternoon solar surplus without curtailment
  const peakAfternoonSurplusKw = Math.max(0.5, pvPeakKw * 0.85 - (avgDailyLoadKwh / 24.0));
  const elecPowerFromTargetYield = h2EnergyDemandKwh / 4.5; // available 4.5 afternoon hours
  let elecRatedKw = Math.max(peakAfternoonSurplusKw, elecPowerFromTargetYield);
  elecRatedKw = Math.ceil(elecRatedKw * 2) / 2; // round to 0.5 kW

  // 5. PEM Fuel Cell Sizing
  // Sized to support peak load + 10% reserve during zero-solar deficit
  let fcRatedKw = Math.ceil(peakLoadKw * 1.10 * 10) / 10;
  if (isScale10) fcRatedKw = Math.max(0.3, fcRatedKw);
  else fcRatedKw = Math.max(3.0, fcRatedKw);

  // 6. Hydrogen Storage Tank Sizing
  // Sized to store 4 days of target production / buffer reserve
  const bufferH2Days = 4;
  const storageH2Kg = Math.max(0.2, targetH2Kg * bufferH2Days);
  const pRatingBar = targets.tank_pressure_class_bar || 30.0;

  // Physical geometric volume: V = (Z * n * R * T) / P
  const moles = (storageH2Kg * 1000.0) / 2.016;
  const R = 8.3144626;
  const T = 298.15;
  const Z = 1.0 + 0.0006 * pRatingBar;
  const pPa = pRatingBar * 1e5;
  const vM3 = (Z * moles * R * T) / pPa;
  const tankVolumeL = Math.ceil(vM3 * 1000.0);

  // 7. DI Water Tank Sizing
  // Sized for 30 days of continuous H2 generation at target rate
  const diWaterTankL = Math.ceil(targetH2Kg * currentParams.di_water_l_per_kg_h2 * 30);

  return {
    pv_peak_kw: pvPeakKw,
    mppt_rating_a: mpptCurrentA,
    mppt_power_kw: mpptPowerKw,
    bess_capacity_kwh: bessCapacityKwh,
    bess_capacity_ah: Math.round(bessCapacityAh),
    bess_bidirectional_dcdc_kw: bessDcdcKw,
    elec_rated_kw: elecRatedKw,
    fc_rated_kw: fcRatedKw,
    tank_volume_l: tankVolumeL,
    tank_pressure_bar: pRatingBar,
    di_water_tank_l: diWaterTankL,
    explanation: {
      pv: `Sized for ${pvPeakKw} kWp to fully replenish BESS DoD by ${targets.target_full_charge_hour.toFixed(2)}h and yield ${targetH2Kg.toFixed(2)} kg/day H2 in the afternoon.`,
      bess: `Sized for ${bessCapacityKwh} kWh (${Math.round(bessCapacityAh)} Ah @ 51.2V) to guarantee ${targets.target_autonomy_nights} night(s) autonomy at max ${targets.max_allowable_dod_percent}% DoD.`,
      elec: `Sized for ${elecRatedKw} kW to capture peak afternoon solar surplus and synthesize required H2 without thermal throttling.`,
      fc: `Sized for ${fcRatedKw} kW to cover 100% of peak evening demand (${peakLoadKw.toFixed(2)} kW) during extended overcast periods.`,
      tank: `Sized for ${tankVolumeL} L at ${pRatingBar} bar to hold ${storageH2Kg.toFixed(2)} kg H2 (4-day strategic autonomy buffer).`,
      water: `Sized for ${diWaterTankL} L to supply 30 days of DI water without replenishment at ${targetH2Kg.toFixed(2)} kg/day production.`,
    },
  };
}
