# Hybrid DC Microgrid & Power-to-Hydrogen-to-Power (P2H2P) Simulation Workbench

## 1. System Architecture Overview
The simulation workbench models a common **48 V DC Bus microgrid** coupled with a Power-to-Hydrogen-to-Power (P2H2P) multi-stage storage loop governed by a central Data Acquisition & Control (DAQ) state machine.

```mermaid
flowchart TD
    subgraph Weather ["Weather Monitoring System"]
        W1["Pyranometer G(t) [W/m²]"]
        W2["Thermocouple T_amb(t) [°C]"]
        W3["Anemometer v_wind(t) [m/s]"]
    end

    subgraph PV_Branch ["Branch 1: Solar PV Array"]
        PV["Solar PV Modules"] --> SW1["DC Isolator Switch"]
        SW1 --> MCB1["DC Fuse / MCB"]
        MCB1 --> MPPT["MPPT DC-DC Converter"]
    end

    Weather --> MPPT
    Weather --> DAQ["Central DAQ & Supervisory Controller"]

    MPPT --> Bus48V

    subgraph DC_Bus ["Common 48 V DC Busbar System"]
        Bus48V["+ / - 48 V DC Bus (48.0 V to 56.8 V)"]
    end

    subgraph Load_Branch ["Branch 2: DC Load (Community / Electronic)"]
        Bus48V --> MCB2["DC MCB (1.25x)"]
        MCB2 --> Load["DC Load Profile P_load(t) [kW]"]
    end

    subgraph BESS_Branch ["Branch 3: Battery Energy Storage System (BESS)"]
        Bus48V <--> MCB3["DC MCB / Fast Fuse"]
        MCB3 <--> BiDir["Bidirectional DC-DC Converter"]
        BiDir <--> Pack["16S LiFePO4 Battery Pack + BMS"]
    end

    subgraph Elec_Branch ["Branch 4: Hydrogen Production (PEM Electrolyzer)"]
        Bus48V --> MCB4["DC MCB"]
        MCB4 --> DCDC_Elec["Step-Down CC/CV DC-DC"]
        DCDC_Elec --> PEM_Elec["PEM Electrolyzer Stack"]
        DI_Tank["DI Water Tank (11 L/kg H₂)"] --> PEM_Elec
        PEM_Elec --> O2_Vent["O₂ Safe Ventilation"]
        PEM_Elec --> H2_Gas["H₂ Gas Stream"]
    end

    subgraph H2_Storage ["Hydrogen Storage Subsystem"]
        H2_Gas --> Tank["H₂ Storage Tank (30 / 200 bar)"]
    end

    subgraph FC_Branch ["Branch 5: Re-Electrification (PEM Fuel Cell)"]
        Tank --> Reg["Pressure Regulator (1.5 bar)"]
        Reg --> PEM_FC["PEM Fuel Cell Stack"]
        PEM_FC --> Boost_FC["Step-Up Boost DC-DC"]
        Boost_FC --> MCB5["DC MCB"]
        MCB5 --> Bus48V
    end

    DAQ -.-> MPPT
    DAQ -.-> BiDir
    DAQ -.-> DCDC_Elec
    DAQ -.-> Boost_FC
    DAQ -.-> Load
```

---

## 2. Core Physics & Mathematical Formulation (Time Step $dt = 0.25\text{ h}$)

### 2.1 Solar PV & Thermal Derating Model
1. **Operating Cell Temperature**:
   $$T_{\text{cell}}(t) = T_{\text{amb}}(t) + \left(\frac{NOCT - 20}{800}\right) \cdot G(t) - 1.5 \cdot v_{\text{wind}}(t)$$
   where $NOCT = 45^\circ\text{C}$ (Nominal Operating Cell Temperature), $G(t)$ is plane-of-array irradiance in $\text{W/m}^2$, and $v_{\text{wind}}(t)$ is wind velocity in $\text{m/s}$.

2. **Loaded DC Bus Power Output**:
   $$P_{\text{pv\_bus}}(t) = \min\left(P_{\text{mppt\_max}},\, P_{\text{pv\_peak}} \cdot \left(\frac{G(t)}{1000}\right) \cdot \left[1 + \gamma_T \cdot (T_{\text{cell}}(t) - 25)\right] \cdot \eta_{\text{mppt}} \cdot \eta_{\text{wiring}}\right)$$
   where $\gamma_T = -0.0038 / ^\circ\text{C}$, $\eta_{\text{mppt}} = 0.98$, and $\eta_{\text{wiring}} = 0.98$.

---

### 2.2 4-State Hysteresis Dispatch Controller
Let the net microgrid instantaneous power be:
$$P_{\text{net}}(t) = P_{\text{pv\_bus}}(t) - P_{\text{load}}(t)$$

```mermaid
stateDiagram-v2
    [*] --> State1: P_net > 0 & SoC < 1.0
    
    State1: State 1 - BESS Priority Charging
    State1 --> State2: SoC >= 0.999 & P_net - P_bess > 0 & P_tank < P_max
    State1 --> State3: P_net <= 0 & FC_active == false

    State2: State 2 - Excess Solar to PEM Electrolyzer
    State2 --> State1: P_net drops or SoC < 0.999
    State2 --> State3: P_net <= 0
    State2 --> Curtailed: P_tank >= P_max or P_surplus < P_turndown

    State3: State 3 - Normal BESS Discharge
    State3 --> State1: P_net > 0
    State3 --> State4: SoC <= SoC_fc_on (0.25) & m_h2 > m_min

    State4: State 4 - PEM Fuel Cell Range-Extender
    State4 --> State1: P_net > 0
    State4 --> State3: SoC >= SoC_fc_off (0.35) or H2 Depleted
```

#### State 1 (BESS Priority Charging)
Active when $P_{\text{net}}(t) > 0$ and $\text{SoC}(t) < \text{SoC}_{\max}$ (1.0).
- **Absorption Taper Limit**: When $\text{SoC}(t) > 0.90$, maximum allowable charge rate tapers linearly down to $0.05 \cdot E_{\text{bess\_cap}}$ at $100\%$ SoC:
  $$P_{\text{chg\_limit}} = P_{\text{bess\_chg\_max}} - \left(\frac{\text{SoC}(t) - 0.90}{1.0 - 0.90}\right) \cdot \left(P_{\text{bess\_chg\_max}} - 0.05 \cdot E_{\text{bess\_cap}}\right)$$
- **Charge Acceptance**:
  $$P_{\text{bess\_chg}}(t) = \min\left(P_{\text{net}}(t),\, P_{\text{chg\_limit}},\, \frac{(\text{SoC}_{\max} - \text{SoC}(t)) \cdot E_{\text{bess\_cap}}}{dt \cdot \eta_{\text{bess\_chg}}}\right)$$

#### State 2 (Excess Solar to PEM Electrolyzer)
Active when $P_{\text{net}}(t) - P_{\text{bess\_chg}}(t) > 0$, $\text{SoC}(t) \ge 0.999$, and $P_{\text{tank\_bar}}(t) < P_{\text{tank\_max\_bar}}$.
- **Surplus Power**: $P_{\text{surplus}}(t) = P_{\text{net}}(t) - P_{\text{bess\_chg}}(t)$.
- **Turndown Safety Guard**:
  $$P_{\text{elec\_min}} = k_{\text{turndown}} \cdot P_{\text{elec\_rated}} \quad (\text{default } 7\%)$$
  If $P_{\text{surplus}}(t) \cdot \eta_{\text{elec\_dcdc}} \ge P_{\text{elec\_min}}$:
  $$P_{\text{elec\_bus}}(t) = \min\left(P_{\text{surplus}}(t),\, \frac{P_{\text{elec\_rated}}}{\eta_{\text{elec\_dcdc}}}\right)$$
  $$m_{\text{h2\_prod\_kg}}(t) = \frac{P_{\text{elec\_bus}}(t) \cdot \eta_{\text{elec\_dcdc}} \cdot dt}{SEC_{\text{elec\_kwh\_per\_kg}}} \quad (\text{default } SEC = 52\text{ kWh/kg})$$
  $$V_{\text{di\_water\_L}}(t) = m_{\text{h2\_prod\_kg}}(t) \cdot 11.0$$
  $$V_{\text{o2\_nm3}}(t) = \left(m_{\text{h2\_prod\_kg}}(t) \cdot 11.12\right) \cdot 0.5$$
  $$P_{\text{curtailed}}(t) = P_{\text{surplus}}(t) - P_{\text{elec\_bus}}(t)$$
  Else: $P_{\text{elec\_bus}}(t) = 0$, $P_{\text{curtailed}}(t) = P_{\text{surplus}}(t)$.

#### State 3 (Normal BESS Discharge)
Active when $P_{\text{net}}(t) \le 0$ and latch $FC_{\text{active}} == \text{false}$.
- Deficit: $P_{\text{def}}(t) = -P_{\text{net}}(t)$.
- Energy boundary: $P_{\text{bess\_dis\_max\_energy}} = \frac{(\text{SoC}(t) - \text{SoC}_{\min}) \cdot E_{\text{bess\_cap}} \cdot \eta_{\text{bess\_dis}}}{dt}$.
- $P_{\text{bess\_dis}}(t) = \min(P_{\text{def}}(t),\, P_{\text{bess\_dis\_max}},\, P_{\text{bess\_dis\_max\_energy}})$.
- $P_{\text{unserved}}(t) = \max(0,\, P_{\text{def}}(t) - P_{\text{bess\_dis}}(t))$.
- **Latch Trigger**: If $\text{SoC}(t) \le \text{SoC}_{\text{fc\_trigger\_on}}$ ($0.25$), latch $FC_{\text{active}} \leftarrow \text{true}$.

#### State 4 (PEM Fuel Cell Range-Extender Mode)
Active when $FC_{\text{active}} == \text{true}$ and $m_{\text{h2\_tank\_kg}}(t) > m_{\text{h2\_min\_kg}}$.
- $P_{\text{fc\_target}} = \min(P_{\text{fc\_rated}},\, \max(P_{\text{def}}(t),\, P_{\text{fc\_opt\_setpoint}}))$.
- Available fuel limit: $P_{\text{fc\_max\_h2}} = \frac{(m_{\text{h2\_tank\_kg}} - m_{\text{h2\_min}}) \cdot LHV_{\text{h2}} \cdot \eta_{\text{fc\_stack}} \cdot \eta_{\text{fc\_dcdc}}}{dt}$.
- $P_{\text{fc\_bus}}(t) = \min(P_{\text{fc\_target}},\, P_{\text{fc\_max\_h2}})$.
- Consumption: $m_{\text{h2\_cons\_kg}}(t) = \frac{P_{\text{fc\_bus}}(t) \cdot dt}{LHV_{\text{h2}} \cdot \eta_{\text{fc\_stack}} \cdot \eta_{\text{fc\_dcdc}}}$ ($LHV_{\text{h2}} = 33.33\text{ kWh/kg}$).
- Excess FC power above deficit recharges BESS; if FC output is insufficient, BESS discharges remainder.
- **Latch Reset**: $FC_{\text{active}} \leftarrow \text{false}$ when $\text{SoC} \ge \text{SoC}_{\text{fc\_trigger\_off}}$ ($0.35$), $P_{\text{net}} > 0$, or H₂ tank reaches minimum cushion.

---

### 2.3 Compressibility-Corrected Real Gas Law
For hydrogen storage cylinder pressure calculation:
$$n = \frac{m_{\text{h2\_tank\_kg}} \cdot 1000}{2.016} \text{ moles}$$
$$P_{\text{ideal\_bar}} = \frac{n \cdot R \cdot (T_{\text{amb}} + 273.15)}{V_{\text{tank\_m3}} \cdot 10^5}$$
$$Z \approx 1 + 0.0006 \cdot P_{\text{ideal\_bar}}$$
$$P_{\text{tank\_bar}}(t) = Z \cdot P_{\text{ideal\_bar}}$$

---

### 2.4 16S LiFePO4 Bus Terminal Voltage & Exact Quadratic Solution
Open circuit voltage $V_{\text{oc}}(\text{SoC})$ conforms to the empirical 16S curve (48.0 V at 0% to 56.8 V at 100%).
Terminal voltage satisfies:
$$V_{\text{bus}} = V_{\text{oc}} - I_{\text{bess}} \cdot R_{\text{internal}} \quad \text{where } I_{\text{bess}} = \frac{(P_{\text{bess\_dis}} - P_{\text{bess\_chg}}) \cdot 1000}{V_{\text{bus}}}$$
Exact closed-form solution:
$$V_{\text{bus}} = \frac{V_{\text{oc}} + \sqrt{V_{\text{oc}}^2 - 4 \cdot P_{\text{bess\_net\_W}} \cdot R_{\text{internal}}}}{2}$$

---

### 2.5 First Law of Thermodynamics Energy Conservation Proof
Total energy balance verified across the entire horizon:
$$E_{\text{pv\_gen}} = E_{\text{load\_served}} + E_{\text{curtailed}} + E_{\text{bess\_losses}} + E_{\text{elec\_losses}} + E_{\text{fc\_losses}} + \Delta E_{\text{bess\_storage}} + \Delta E_{\text{h2\_storage}}$$
$$\text{Residual: } \left|E_{\text{in}} - E_{\text{out}} - \Delta E_{\text{storage}}\right| < 10^{-4}\text{ kWh} \quad \implies \mathbf{PASSED}$$

---

## 3. Playwright Verification Gallery

````carousel
![1-Day Baseline View](/root/.gemini/antigravity/brain/e6221762-e841-44b7-ad01-17a34920930b/screenshots/workbench_main_view.png)
<!-- slide -->
![Automated Component Sizing Modal](/root/.gemini/antigravity/brain/e6221762-e841-44b7-ad01-17a34920930b/screenshots/workbench_autosizer_modal.png)
<!-- slide -->
![Master BoM & Switchgear Sizing](/root/.gemini/antigravity/brain/e6221762-e841-44b7-ad01-17a34920930b/screenshots/workbench_bom_tab.png)
<!-- slide -->
![31-Day January 2017 Benchmark (2,976 steps)](/root/.gemini/antigravity/brain/e6221762-e841-44b7-ad01-17a34920930b/screenshots/workbench_31day_view.png)
<!-- slide -->
![Multi-Day Monsoon Stress Test](/root/.gemini/antigravity/brain/e6221762-e841-44b7-ad01-17a34920930b/screenshots/workbench_monsoon_stress.png)
````

---

## 4. Key Verification Findings
1. **Mathematical Accuracy**: The energy audit residual tests $\Delta E < 10^{-4}\text{ kWh}$ across all 2,976 simulation steps, validating zero unmodeled energy leakage.
2. **Hysteresis State Machine**: During the 7-Day Monsoon stress scenario, Days 4–5 overcast conditions trigger the Fuel Cell latch at $\text{SoC} \le 25\%$, smoothly sustaining the 48V DC bus until recovery.
3. **Execution Speed**: The discrete numerical solver evaluates 2,976 15-minute steps in **under 4 milliseconds**, enabling fluid instant-recalculation parameter tuning.
