# Hybrid DC Microgrid & Power-to-Hydrogen-to-Power (P2H2P) Simulation Workbench

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.2-646cff.svg)](https://vitejs.dev/)
[![First Law Energy Balance](https://img.shields.io/badge/Energy%20Conservation-|ΔE|<1e--4%20kWh-emerald.svg)]()
[![License](https://img.shields.io/badge/License-MIT-green.svg)]()

A deterministic, engineering-grade web application for dynamic numerical simulation, dispatch control analysis, and sizing optimization of a **48 V DC Bus Microgrid** coupled with a **Power-to-Hydrogen-to-Power (P2H2P)** energy storage system.

Designed with a high-density, dark-mode engineering layout (similar to MATLAB/Simulink Data Inspector and Grafana), prioritizing physical rigor, high-speed time-series discrete solver execution ($<4\text{ ms}$ for 2,976 points), and automated switchgear sizing compliant with NEC 690 and IEC 60364-7-712.

---

## System Architecture

```
Weather Monitoring [G(t), T_amb(t), v_wind(t)]
       │
       ▼
[ Solar PV Array ] ──> [ DC Isolator & MCB ] ──> [ MPPT DC-DC Converter ] ──┐
                                                                             │
[ Programmable DC Load ] <── [ DC MCB ] <───────────────────────────────────┼──> [+ / - 48V DC BUS]
                                                                             │      (48.0V - 56.8V)
[ 16S LiFePO4 BESS + BMS ] <──> [ BiDir DC-DC ] <── [ DC MCB / Fuse ] <─────┤
                                                                             │
[ DI Water Tank ] ──> [ PEM Electrolyzer ] <── [ Step-Down CC/CV DC-DC ] <──┤
                             │                                               │
                             ▼                                               │
               [ Pressurized H2 Tank ]                                       │
                             │                                               │
                             ▼                                               │
                     [ PEM Fuel Cell ] ──> [ Step-Up Boost DC-DC ] ──────────┘
```

The system models a common 48 V DC Bus architecture with five primary branches governed by a central supervisory Data Acquisition & Control (DAQ) state machine:

1. **Weather & Solar PV Branch**: Pyranometer solar irradiance $G(t)\text{ [W/m}^2\text{]}$, thermocouple ambient temperature $T_{\text{amb}}(t)\text{ [}^\circ\text{C]}$, and anemometer wind speed $v_{\text{wind}}(t)\text{ [m/s]}$ feeding a monocrystalline PV array and MPPT charge controller.
2. **Programmable DC Load Branch**: Ingests 15-minute ($96\text{ steps/day}$) or 1-hour community and household load profiles $P_{\text{load}}(t)\text{ [kW]}$.
3. **Battery Energy Storage System (BESS) Branch**: 16S LiFePO4 battery pack with active balancing BMS connected via a Bidirectional Buck-Boost DC-DC converter.
4. **Hydrogen Production Branch**: Step-down CC/CV DC-DC converter feeding a low-voltage PEM Electrolyzer stack drawing from a Deionized (DI) Water Tank, safely venting $\text{O}_2$, and pressurizing an $\text{H}_2$ storage vessel.
5. **Hydrogen Re-Electrification Branch**: Pressurized $\text{H}_2$ storage vessel feeding a PEM Fuel Cell stack via a two-stage pressure regulator ($1.5\text{ bar}$) and a unidirectional Step-Up (Boost) DC-DC converter back to the 48 V DC bus.

---

## Core Mathematical Models ($dt = 0.25\text{ h}$)

### 1. Solar PV & Thermal Derating Model
- **Cell Temperature**:
  $$T_{\text{cell}}(t) = T_{\text{amb}}(t) + \left(\frac{NOCT - 20}{800}\right) \cdot G(t) - 1.5 \cdot v_{\text{wind}}(t)$$
- **MPPT DC Output Power**:
  $$P_{\text{pv\_bus}}(t) = \min\left(P_{\text{mppt\_max}},\, P_{\text{pv\_peak}} \cdot \left(\frac{G(t)}{1000}\right) \cdot \left[1 + \gamma_T \cdot (T_{\text{cell}}(t) - 25)\right] \cdot \eta_{\text{mppt}} \cdot \eta_{\text{wiring}}\right)$$

### 2. 4-State Hysteresis Dispatch Controller
- **Net Power**: $P_{\text{net}}(t) = P_{\text{pv\_bus}}(t) - P_{\text{load}}(t)$.
- **STATE 1 (BESS Priority Charging)**: Active when $P_{\text{net}} > 0$ and $\text{SoC} < 1.0$.
  - When $\text{SoC} > 0.90$, linearly tapers maximum charge rate down to $0.05 \cdot E_{\text{bess\_cap}}$ at $100\%$ SoC.
- **STATE 2 (Excess Solar to PEM Electrolyzer)**: Active when $P_{\text{net}} - P_{\text{bess\_chg}} > 0$, $\text{SoC} \ge 0.999$, and $P_{\text{tank}} < P_{\text{tank\_max}}$.
  - Minimum turndown safety guard: $P_{\text{elec\_min}} = 0.07 \cdot P_{\text{elec\_rated}}$.
  - Hydrogen production: $m_{\text{h2\_prod\_kg}}(t) = \frac{P_{\text{elec\_bus}} \cdot \eta_{\text{elec\_dcdc}} \cdot dt}{SEC_{\text{elec}}}$ ($SEC = 52\text{ kWh/kg}$).
  - Water consumption: $V_{\text{di\_water\_L}}(t) = m_{\text{h2\_prod\_kg}} \cdot 11.0\text{ L/kg}$.
- **STATE 3 (Normal BESS Discharge)**: Active when $P_{\text{net}} \le 0$ and Fuel Cell latch is inactive. Discharges BESS down to $15\%$ cut-off. Latches Fuel Cell ON when $\text{SoC} \le 25\%$.
- **STATE 4 (PEM Fuel Cell Range-Extender)**: Operates Fuel Cell to cover deficit plus recharge BESS at optimal setpoint ($P_{\text{fc\_opt}}$). Resets latch OFF when $\text{SoC} \ge 35\%$, $P_{\text{net}} > 0$, or $\text{H}_2$ fuel depletes.

### 3. Compressibility-Corrected Real Gas Law
- Hydrogen gas pressure:
  $$n = \frac{m_{\text{h2\_tank\_kg}} \cdot 1000}{2.016} \text{ mol}, \quad P_{\text{ideal\_bar}} = \frac{n R (T_{\text{amb}} + 273.15)}{V_{\text{tank\_m3}} \cdot 10^5}$$
  $$Z \approx 1 + 0.0006 \cdot P_{\text{ideal\_bar}}, \quad P_{\text{tank\_bar}}(t) = Z \cdot P_{\text{ideal\_bar}}$$

### 4. 16S LiFePO4 Bus Terminal Voltage
- Monotonic cubic Hermite interpolation across empirical 16S open-circuit knots ($48.0\text{ V}$ at 0% to $56.8\text{ V}$ at 100%).
- Closed-form quadratic terminal voltage solution:
  $$V_{\text{bus}} = \frac{V_{\text{oc}} + \sqrt{V_{\text{oc}}^2 - 4 \cdot P_{\text{net\_bess\_W}} \cdot R_{\text{internal}}}}{2}$$

### 5. First-Law Energy Conservation Audit
Rigorous balance check across every time-step verifying:
$$|E_{\text{in}} - E_{\text{out}} - \Delta E_{\text{storage}}| < 10^{-4}\text{ kWh} \quad \implies \text{PASS}$$

---

## Pre-Loaded Benchmark Datasets & Stress Scenarios

1. **1-Day Baseline (2017-01-01 Household Profile)**: 96 steps ($dt = 0.25\text{ h}$), flat daytime load $0.40\text{--}0.56\text{ kW}$, sharp evening ramp peaking at $3.567\text{ kW}$ at 19:15, $\sim 25\text{ kWh}$ daily energy.
2. **31-Day Monthly Profile (Jan 2017)**: 2,976 steps matching empirical measurements with monthly peak $4.43\text{ kW}$ on Day 2 at 20:15.
3. **Multi-Day Monsoon Stress Test (7 Days)**: Days 1–3 clear sun (builds $\text{H}_2$ inventory); Days 4–5 heavy monsoon overcast ($82\%$ solar drop) triggering State 4 Fuel Cell range-extender; Days 6–7 recovery.
4. **1:10 Lab Benchtop Scale Preset**: Hardware-in-the-loop laboratory testbench scale ($1.2\text{ kWp}$ PV, $3.07\text{ kWh}$ BESS, $500\text{ W}$ PEM Electrolyzer, $300\text{ W}$ Fuel Cell, $443\text{ W}$ peak load).

---

## Features & UI Layout

- **Top KPI & Energy Audit Ribbon**: 11 Grafana-style metric tiles with duty cycle breakdown and real-time first-law energy conservation badge.
- **Left Parameter Control Matrix**: Categorized collapsible engineering parameters with live re-computation and 1:1 vs 1:10 scale toggles.
- **Synchronized 4-Track Plots**:
  - Track 1: Power Dispatch Stack (kW)
  - Track 2: BESS State of Charge (%) & Active Controller State Bands (1, 2, 3, 4)
  - Track 3: $\text{H}_2$ Storage Tank Mass (kg) & Working Pressure (bar)
  - Track 4: 48 V DC Bus Voltage (V) & Branch Currents (A)
- **Automated Component Sizing Solver**: Multi-objective analytical solver for optimal PV array, BESS, PEM Electrolyzer, Fuel Cell, and tank sizing.
- **Bottom Tabbed Inspector**:
  - Tab A: Time-Step Data Table with search, state filtering, and RFC-4180 CSV Export.
  - Tab B: Custom CSV Ingestion engine with delimiter auto-detection and live parser preview.
  - Tab C: Master Bill of Materials (BoM) & Switchgear Sizing table (1.25x NEC safety factor, DIN DC MCBs, and conductor cross-sections).
  - Tab D: System Architecture Single-Line Diagram inspector.
  - Tab E: Empirical Load Profile benchmark analysis.

---

## Getting Started

### Prerequisites
- Node.js 18+ or 20+
- npm or yarn

### Installation
```bash
git clone https://github.com/indrajeetmdate/hybrid-dc-microgrid-p2h2p-workbench.git
cd hybrid-dc-microgrid-p2h2p-workbench
npm install
```

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm run preview
```

---

## License
MIT License. Built for renewable DC microgrid and green hydrogen engineering research.
