/**
 * Master Bill of Materials (BoM) & Switchgear Sizing Engine
 * Applies NEC 690 / IEC 60364-7-712 standard: 1.25x continuous current safety factor
 * Computes DC MCB ratings, conductor cross-sections, voltage drop %, and estimated equipment costs
 */

import { SimulationSummary, SwitchgearItem, SystemParameters } from '../types/microgrid';

const STANDARD_DC_MCB_SIZES = [
  10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400
];

interface ConductorOption {
  mm2: number;
  awg: string;
  ampacity_75c_A: number; // In raceway / conduit at 30°C ambient
}

const STANDARD_CONDUCTORS: ConductorOption[] = [
  { mm2: 2.5, awg: '14 AWG', ampacity_75c_A: 20 },
  { mm2: 4.0, awg: '12 AWG', ampacity_75c_A: 30 },
  { mm2: 6.0, awg: '10 AWG', ampacity_75c_A: 40 },
  { mm2: 10.0, awg: '8 AWG', ampacity_75c_A: 55 },
  { mm2: 16.0, awg: '6 AWG', ampacity_75c_A: 75 },
  { mm2: 25.0, awg: '4 AWG', ampacity_75c_A: 95 },
  { mm2: 35.0, awg: '2 AWG', ampacity_75c_A: 130 },
  { mm2: 50.0, awg: '1/0 AWG', ampacity_75c_A: 170 },
  { mm2: 70.0, awg: '2/0 AWG', ampacity_75c_A: 210 },
  { mm2: 95.0, awg: '3/0 AWG', ampacity_75c_A: 245 },
  { mm2: 120.0, awg: '4/0 AWG', ampacity_75c_A: 285 },
  { mm2: 150.0, awg: '250 kcmil', ampacity_75c_A: 320 },
  { mm2: 185.0, awg: '300 kcmil', ampacity_75c_A: 355 },
  { mm2: 240.0, awg: '400 kcmil', ampacity_75c_A: 405 },
];

function selectNextStandardMcb(designCurrentA: number): number {
  for (const size of STANDARD_DC_MCB_SIZES) {
    if (size >= designCurrentA) return size;
  }
  return STANDARD_DC_MCB_SIZES[STANDARD_DC_MCB_SIZES.length - 1];
}

function selectConductor(designCurrentA: number, lengthM: number = 5.0, vNominal: number = 48.0): {
  conductor: ConductorOption;
  vDropPercent: number;
} {
  const rhoCopper = 0.0178; // ohm * mm² / m at 20°C (approx 0.021 at 75°C)
  const rho75C = 0.0215;

  for (const cond of STANDARD_CONDUCTORS) {
    if (cond.ampacity_75c_A >= designCurrentA) {
      // Check 2-wire loop voltage drop: deltaV = 2 * L * I * rho / A
      const deltaV = (2.0 * lengthM * designCurrentA * rho75C) / cond.mm2;
      const vDropPercent = (deltaV / vNominal) * 100.0;
      // Desired max voltage drop <= 2.0%
      if (vDropPercent <= 2.0) {
        return { conductor: cond, vDropPercent };
      }
    }
  }

  // Fallback to highest conductor
  const highest = STANDARD_CONDUCTORS[STANDARD_CONDUCTORS.length - 1];
  const deltaV = (2.0 * lengthM * designCurrentA * rho75C) / highest.mm2;
  return { conductor: highest, vDropPercent: (deltaV / vNominal) * 100.0 };
}

export function generateSwitchgearAndBom(
  params: SystemParameters,
  summary: SimulationSummary
): {
  switchgear: SwitchgearItem[];
  equipmentBom: Array<{
    item: string;
    subsystem: string;
    specs: string;
    qty: number;
    unit: string;
    unitCostUsd: number;
    totalCostUsd: number;
  }>;
  totalCapExUsd: number;
} {
  const isScale10 = params.scale === '1:10';

  // 1. Calculate Branch Switchgear items based on simulated peak currents
  const branches = [
    {
      branchName: 'Branch 1: Solar PV to MPPT',
      role: 'PV String Input & MPPT Infeed',
      simPeakA: summary.i_pv_peak_a * 0.75, // Array voltage typically 80V-120V from strings into MPPT
      lengthM: 15.0,
      vNom: 100.0,
      fuseType: '10x38mm gPV 1000V DC Fuse + 2P Rotary Isolator',
      costBase: isScale10 ? 45 : 120,
    },
    {
      branchName: 'Branch 1: MPPT to 48V DC Bus',
      role: 'MPPT Output to Busbar Infeed',
      simPeakA: summary.i_pv_peak_a,
      lengthM: 3.0,
      vNom: 48.0,
      fuseType: '2P DIN-Rail Polarized DC MCB (10kA DC)',
      costBase: isScale10 ? 35 : 95,
    },
    {
      branchName: 'Branch 2: DC Load Branch',
      role: 'Community / Programmable Electronic Load',
      simPeakA: summary.i_load_peak_a,
      lengthM: 10.0,
      vNom: 48.0,
      fuseType: '2P DIN-Rail DC MCB (Curve C)',
      costBase: isScale10 ? 30 : 85,
    },
    {
      branchName: 'Branch 3: BESS Bidirectional DC-DC',
      role: '16S LiFePO4 Battery & BMS Interconnect',
      simPeakA: Math.max(summary.i_bess_chg_peak_a, summary.i_bess_dis_peak_a),
      lengthM: 2.5,
      vNom: 48.0,
      fuseType: 'High-Speed Semiconductor DC Fuse (aR / Class T) + Heavy-Duty DC Isolator',
      costBase: isScale10 ? 60 : 180,
    },
    {
      branchName: 'Branch 4: PEM Electrolyzer Branch',
      role: 'Step-Down CC/CV Converter to Low-V Stack',
      simPeakA: summary.i_elec_peak_a,
      lengthM: 3.5,
      vNom: 48.0,
      fuseType: '2P DIN-Rail Fast-Acting DC MCB (Curve B)',
      costBase: isScale10 ? 40 : 110,
    },
    ...(params.fc_enabled !== false
      ? [
          {
            branchName: 'Branch 5: PEM Fuel Cell Branch',
            role: 'Step-Up Boost DC-DC Converter to 48V Bus',
            simPeakA: summary.i_fc_peak_a,
            lengthM: 3.5,
            vNom: 48.0,
            fuseType: '2P Polarized DC MCB + Reverse Polarity Diode Protection',
            costBase: isScale10 ? 35 : 90,
          },
        ]
      : []),
  ];

  const switchgear: SwitchgearItem[] = branches.map((b) => {
    const peakSim = Math.max(1.0, b.simPeakA);
    const designA = Math.ceil(peakSim * 1.25); // NEC continuous safety factor
    const mcbA = selectNextStandardMcb(designA);
    const { conductor, vDropPercent } = selectConductor(designA, b.lengthM, b.vNom);

    return {
      branchName: b.branchName,
      role: b.role,
      peakCurrentSim_A: Math.round(peakSim * 10) / 10,
      continuousDesignCurrent_A: designA,
      recommendedMcbRating_A: mcbA,
      recommendedFuseType: b.fuseType,
      recommendedCableSize_mm2: conductor.mm2,
      recommendedAwg: conductor.awg,
      maxOneWayLength_m: b.lengthM,
      voltageDrop_percent: Math.round(vDropPercent * 100) / 100,
      estimatedCostUsd: b.costBase + Math.round(conductor.mm2 * 1.5 * b.lengthM * 0.1),
    };
  });

  // 2. Subsystem Equipment BoM & Capital Cost Breakdown
  const equipmentBom = [
    {
      item: 'Solar PV Array',
      subsystem: 'Solar Generation',
      specs: `${params.pv_peak_kw.toFixed(1)} kWp Monocrystalline Tier-1 Modules (NOCT ${params.noct_c}°C, Coeff ${params.gamma_t * 100}%/°C)`,
      qty: Math.max(1, Math.round((params.pv_peak_kw * 1000) / (isScale10 ? 400 : 550))),
      unit: 'panels',
      unitCostUsd: isScale10 ? 110 : 140,
      totalCostUsd: Math.round(params.pv_peak_kw * 1000 * 0.28),
    },
    {
      item: 'MPPT Solar Charge Controller',
      subsystem: 'Solar Generation',
      specs: `${params.mppt_max_kw.toFixed(1)} kW, 48V Bus Output, Synchronous Rectification (>98% efficiency)`,
      qty: 1,
      unit: 'unit',
      unitCostUsd: isScale10 ? 250 : 850,
      totalCostUsd: isScale10 ? 250 : 850,
    },
    {
      item: '16S LiFePO4 Battery Pack',
      subsystem: 'BESS Storage',
      specs: `${params.bess_cap_kwh.toFixed(1)} kWh (${Math.round((params.bess_cap_kwh * 1000) / 51.2)} Ah @ 51.2V), Grade-A Prismatic Cells, 6000 cycles`,
      qty: 1,
      unit: 'pack',
      unitCostUsd: Math.round(params.bess_cap_kwh * 180),
      totalCostUsd: Math.round(params.bess_cap_kwh * 180),
    },
    {
      item: 'Smart Battery Management System (BMS)',
      subsystem: 'BESS Storage',
      specs: `16S LiFePO4 Active Balancing BMS with RS485/CAN/Modbus Telemetry`,
      qty: 1,
      unit: 'unit',
      unitCostUsd: isScale10 ? 120 : 320,
      totalCostUsd: isScale10 ? 120 : 320,
    },
    {
      item: 'Bidirectional DC-DC Converter',
      subsystem: 'BESS Storage',
      specs: `${params.bess_dis_max_kw.toFixed(1)} kW Continuous Dual-Direction Buck-Boost for BESS 48V Bus Regulation`,
      qty: 1,
      unit: 'unit',
      unitCostUsd: isScale10 ? 300 : 1100,
      totalCostUsd: isScale10 ? 300 : 1100,
    },
    {
      item: 'PEM Water Electrolyzer Stack',
      subsystem: 'Hydrogen Production',
      specs: `${params.elec_rated_kw.toFixed(1)} kW Low-V PEM Electrolyzer, SEC ${params.sec_elec_kwh_per_kg} kWh/kg, 7% turndown safety`,
      qty: 1,
      unit: 'stack',
      unitCostUsd: Math.round(params.elec_rated_kw * (isScale10 ? 1800 : 1400)),
      totalCostUsd: Math.round(params.elec_rated_kw * (isScale10 ? 1800 : 1400)),
    },
    {
      item: 'Electrolyzer CC/CV DC-DC Converter',
      subsystem: 'Hydrogen Production',
      specs: `${params.elec_rated_kw.toFixed(1)} kW Step-Down Current-Controlled DC-DC with Rapid Transient Response`,
      qty: 1,
      unit: 'unit',
      unitCostUsd: isScale10 ? 220 : 750,
      totalCostUsd: isScale10 ? 220 : 750,
    },
    {
      item: 'Deionized Water Loop & Purifier',
      subsystem: 'Hydrogen Production',
      specs: `DI Water Tank with Micro-Polishing Ion Exchange Resin Cartridge & Peristaltic Feed Metering Pump`,
      qty: 1,
      unit: 'system',
      unitCostUsd: isScale10 ? 180 : 650,
      totalCostUsd: isScale10 ? 180 : 650,
    },
    {
      item: 'Hydrogen Pressure Vessel & Manifold',
      subsystem: 'Hydrogen Storage',
      specs: `${Math.round(params.tank_volume_m3 * 1000)} Liters Storage Cylinder rated for ${params.tank_p_max_bar} bar with overpressure relief valve`,
      qty: 1,
      unit: 'vessel',
      unitCostUsd: Math.round(params.tank_volume_m3 * 1000 * (isScale10 ? 18 : 6.5)),
      totalCostUsd: Math.round(params.tank_volume_m3 * 1000 * (isScale10 ? 18 : 6.5)),
    },
    ...(params.tedlar_bags_enabled !== false
      ? [
          {
            item: 'Atmospheric Tedlar Gas Bags',
            subsystem: 'Hydrogen Storage',
            specs: `Polyvinyl Fluoride (PVF) Tedlar gas bags for uncompressed atmospheric excess H₂ storage at 1.013 bar (${summary.total_tedlar_volume_liters.toFixed(1)} L required, ${params.tedlar_bag_chunk_l || 10}L chunks)`,
            qty: Math.max(1, summary.total_tedlar_bags_10l_count),
            unit: `${params.tedlar_bag_chunk_l || 10}L bags`,
            unitCostUsd: 28,
            totalCostUsd: Math.max(1, summary.total_tedlar_bags_10l_count) * 28,
          },
        ]
      : []),
    ...(params.fc_enabled !== false
      ? [
          {
            item: 'PEM Fuel Cell Stack',
            subsystem: 'Re-Electrification',
            specs: `${params.fc_rated_kw.toFixed(1)} kW Air-Cooled/Liquid-Cooled PEMFC Stack (52% electrochemical efficiency)`,
            qty: 1,
            unit: 'stack',
            unitCostUsd: Math.round(params.fc_rated_kw * (isScale10 ? 1600 : 1200)),
            totalCostUsd: Math.round(params.fc_rated_kw * (isScale10 ? 1600 : 1200)),
          },
          {
            item: 'Step-Up Boost DC-DC Converter',
            subsystem: 'Re-Electrification',
            specs: `${params.fc_rated_kw.toFixed(1)} kW Synchronous Boost to 48V Bus with Overvoltage Clamping`,
            qty: 1,
            unit: 'unit',
            unitCostUsd: isScale10 ? 190 : 680,
            totalCostUsd: isScale10 ? 190 : 680,
          },
        ]
      : []),
    {
      item: 'Central DAQ & Supervisory Controller',
      subsystem: 'Monitoring & Control',
      specs: `Multi-channel Data Logger / DAQ, Modbus-RTU / CAN bus transceivers, Pyranometer, Anemometer, Thermocouples`,
      qty: 1,
      unit: 'kit',
      unitCostUsd: isScale10 ? 450 : 1350,
      totalCostUsd: isScale10 ? 450 : 1350,
    },
    {
      item: '48V DC Busbar & Enclosure Assembly',
      subsystem: 'DC Power Distribution',
      specs: `Solid Tinned Copper Busbars (1000A rated), IP65 Enclosure, DC Type 2 SPD, Shunts, and Cable Glands`,
      qty: 1,
      unit: 'cabinet',
      unitCostUsd: isScale10 ? 280 : 850,
      totalCostUsd: isScale10 ? 280 : 850,
    },
  ];

  const totalCapExUsd =
    equipmentBom.reduce((sum, item) => sum + item.totalCostUsd, 0) +
    switchgear.reduce((sum, item) => sum + item.estimatedCostUsd, 0);

  return { switchgear, equipmentBom, totalCapExUsd };
}
