# Scientific Foundation: Biofloc Water Quality Dynamics & Modeling

**Document ID**: `DOC-SCI-001`  
**Project**: Smart Aquaculture Water Quality Management System for Zero-Water-Exchange Biofloc Technology  
**Target Context**: KTU S7/S8 B.Tech Engineering Group Project  
**Date**: September 2026  

---

## 1. Introduction & Biofloc Technology (BFT) Principles

### 1.1 What is Biofloc Technology?
Biofloc Technology (BFT) is a sustainable, biosecure aquaculture management approach that maintains high water quality in zero-water-exchange or minimal-exchange production systems (Avnimelech, 2009; Hargreaves, 2013). Traditional aquaculture systems rely on continuous or periodic water exchange to dilute toxic metabolic byproducts (primarily ammonia and nitrite) and remove suspended solids. However, water discharge introduces biosecurity vulnerabilities (pathogen transmission), environmental eutrophication in surrounding coastal or freshwater ecosystems, and heavy water resource depletion.

In zero-water-exchange biofloc systems, water is retained within the culture pond or indoor raceway for the entire production cycle (typically 90 to 120 days for shrimp). Environmental waste products are treated *in situ* through the cultivation of dense, macro-aggregate microbial communities ("bioflocs"). These aggregates comprise:
1. **Heterotrophic bacteria**: Assimilate ammonium nitrogen directly into bacterial single-cell protein.
2. **Autotrophic nitrifying bacteria**: Convert toxic ammonia to nitrite ($NO_2^-$) and subsequently to less toxic nitrate ($NO_3^-$).
3. **Microalgae, protozoa, and rotifers**: Form a dynamic trophic web within the floc matrix.

```
       Feed Input (Proteins)
                |
                v
        Fish / Shrimp Biomass
                |
          Metabolic Excretion
                |
                v
     Total Ammonia Nitrogen (TAN)
                |
   +------------+------------+
   |                         |
   v                         v
[Nitrification]       [Heterotrophic Assimilation]
(Slow, consumes       (Rapid, requires Carbon:Nitrogen
 alkalinity, yields    manipulation: C:N >= 15:1,
 Nitrite & Nitrate)    yields Microbial Single-Cell Protein)
                             |
                             v
                     Consumed by Shrimp
                   (Secondary Feed Source)
```

### 1.2 The Carbon-to-Nitrogen (C:N) Ratio
Cultured aquatic species (such as Pacific white shrimp *Litopenaeus vannamei* or Nile tilapia *Oreochromis niloticus*) retain only 20% to 35% of the nitrogen contained in commercial formulated feed (Ebeling et al., 2006). The remaining 65% to 80% is excreted into the water column as Total Ammonia Nitrogen (TAN) and particulate fecal nitrogen.

Heterotrophic bacteria possess a typical microbial biomass carbon-to-nitrogen ratio of approximately $4:1$ to $5:1$. With a microbial carbon assimilation efficiency ($E_{assim}$) of roughly 40% to 50%, heterotrophs require approximately 15 to 20 grams of assimilable organic carbon to take up 1 gram of inorganic nitrogen:

$$\frac{C}{N} \ge 15:1 \quad \text{to} \quad 20:1$$

To drive rapid heterotrophic assimilation over slower autotrophic nitrification, farm managers dose external organic carbon sources (e.g., sugarcane molasses, cassava starch, or wheat flour) into the tank based on feed protein content.

### 1.3 Aeration & Biological Oxygen Demand (BOD)
Because biofloc systems operate at exceptionally high total suspended solids (TSS: $300\text{–}600\text{ mg/L}$, with biofloc volume index $FVI: 15\text{–}35\text{ mL/L}$ in Imhoff cones), the microbial community exhibits an enormous biological oxygen demand (BOD). 

In traditional semi-intensive ponds, phytoplankton and animal respiration represent the primary oxygen sinks. In biofloc systems, heterotrophic and nitrifying bacterial respiration accounts for a substantial fraction of total system respiration (Hargreaves, 2006; Vinatea et al., 2010). Consequently:
- Continuous mechanical aeration (using aspirators, root blowers, or paddle wheels) is a critical operational requirement.
- A sudden power or mechanical blower failure leads to rapid oxygen depletion, posing severe operational risk within 1 to 2 hours if unaddressed.

---

## 2. Dissolved Oxygen (DO) Dynamics

### 2.1 Diurnal Variations & Equilibrium
In hybrid green-brown biofloc systems exposed to sunlight, dissolved oxygen undergoes a natural diurnal oscillation:
- **Daylight (08:00 – 17:00)**: Microalgal photosynthesis generates oxygen, reaching a supersaturated peak in the late afternoon (~15:00–16:00).
- **Nighttime (18:00 – 06:00)**: Photosynthesis ceases. Unabated biological respiration by the dense biofloc matrix and shrimp causes a continuous drop, reaching a critical minimum just before dawn (~04:00–06:00).

The baseline diurnal trajectory can be represented by a diurnal sinusoidal model:

$$\mu_{DO}(t) = \bar{DO} + A_{DO} \sin\left(\frac{2\pi (t - t_{shift})}{24}\right)$$

Where:
- $\bar{DO}$: Mean dissolved oxygen concentration under active mechanical aeration ($\approx 5.8\text{–}6.2\text{ mg/L}$).
- $A_{DO}$: Diurnal amplitude ($\approx 1.2\text{–}1.6\text{ mg/L}$).
- $t_{shift}$: Phase adjustment aligning the trough with 04:00 and peak with 16:00 ($t_{shift} = 10.0\text{ hours}$).

### 2.2 Temperature & Salinity Dependent Oxygen Saturation
The physical solubility limit of oxygen in water ($DO_{sat}$) decreases with increasing water temperature and salinity. Under standard atmospheric pressure, the empirical Benson and Krause (1984) relation (USGS standard) governs saturation:

$$\ln(DO_{sat}) = -139.34411 + \frac{1.575701 \times 10^5}{T_K} - \frac{6.642308 \times 10^7}{T_K^2} + \frac{1.243800 \times 10^{10}}{T_K^3} - \frac{8.621949 \times 10^{11}}{T_K^4} - S \cdot \Phi(T_K)$$

Where $T_K = T_{celsius} + 273.15$ and $S$ is salinity in g/kg (ppt). At $28.5^\circ\text{C}$ in freshwater, $DO_{sat} \approx 7.8\text{ mg/L}$.

### 2.3 Simulated Aerator Failure Scenario Dynamics
In the project's simulator, aerator failure is modeled using a simplified phenomenological scenario dynamics formulation rather than validated biochemical digital twin kinetics:

$$[DO](t) \approx DO_0 \cdot \exp(-k_{decay} \cdot t) + DO_{floor}$$

Where $k_{decay} \approx 0.8\text{–}1.2\text{ h}^{-1}$ governs mean-reversion rate toward a scenario baseline floor $DO_{floor} \approx 1.2\text{–}1.8\text{ mg/L}$. This provides reproducible stress telemetry for software and ML evaluation.

### 2.4 Project Operational & Monitoring Thresholds
The monitoring dashboard utilizes operational thresholds informed by aquaculture literature ranges for **Pacific white shrimp (*Litopenaeus vannamei*)** and **Nile tilapia (*Oreochromis niloticus*)**:

| Parameter Status | DO Concentration (mg/L) | Typical Literature Observations | Project Operational Action |
| :--- | :--- | :--- | :--- |
| **Optimal** | $> 5.0\text{ mg/L}$ | Unimpaired respiration, normal feeding activity and growth. | Standard aeration schedule. |
| **Sub-Optimal / Warning** | $4.0\text{ to }5.0\text{ mg/L}$ | Reduced feeding activity, mild physiological stress. | Operational warning; inspect aeration equipment. |
| **Critical Hypoxia** | $< 4.0\text{ mg/L}$ | Acute respiratory distress, lethargy, elevated mortality risk. | Emergency protocol; engage backup aeration. |
| **Severe Hypoxia (Scenario Floor)** | $< 2.0\text{ mg/L}$ | Severe hypoxia in intensive biofloc culture. | Emergency alert state. |

---

## 3. Total Ammonia Nitrogen (TAN) & Toxic Unionized Ammonia ($NH_3$)

### 3.1 TAN Equilibrium & The Emerson Formulation
Total Ammonia Nitrogen represents the sum of two chemical species in aqueous equilibrium:

$$\text{TAN} = [NH_3] + [NH_4^+]$$

- **Ionized Ammonium ($NH_4^+$)**: Hydrophilic, does not readily penetrate biological membranes; virtually non-toxic at standard aquaculture concentrations.
- **Unionized Ammonia ($NH_3$)**: Uncharged, lipid-soluble gas molecule; easily diffuses across the gill epithelium, disrupting cellular osmoregulation, blood pH, and central nervous system function. Highly toxic.

The equilibrium fraction $f_{NH_3}$ of unionized ammonia depends strictly on water temperature and pH, dictated by the base dissociation constant $pKa$ (Emerson, Russo, Nelson & Thurston, 1975):

$$pKa = \frac{2729.92}{T_K} + 0.09018$$

Where $T_K = T_{celsius} + 273.15$. The percentage of unionized ammonia is calculated as:

$$\%NH_3 = \frac{100}{1 + 10^{(pKa - pH)}}$$

$$[NH_3]\text{ (mg/L)} = \text{TAN}\text{ (mg/L)} \times \frac{1}{1 + 10^{(pKa - pH)}}$$

#### Table: Unionized Ammonia ($NH_3$) as % of TAN across pH and Temperature
| Temperature ($^\circ\text{C}$) | pH 7.0 | pH 7.5 | pH 7.8 | pH 8.0 | pH 8.2 | pH 8.5 |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **26.0** | 0.52% | 1.62% | 3.20% | 5.03% | 7.79% | 14.5% |
| **28.5** | 0.63% | 1.96% | 3.86% | 6.03% | 9.30% | 17.0% |
| **30.0** | 0.70% | 2.18% | 4.29% | 6.69% | 10.3% | 18.6% |

> **Crucial Academic Insight**: A TAN reading of $1.0\text{ mg/L}$ at $\text{pH } 7.2$ yields $[NH_3] \approx 0.01\text{ mg/L}$ (completely safe). However, the same $1.0\text{ mg/L}$ TAN at $\text{pH } 8.5$ and $28.5^\circ\text{C}$ yields $[NH_3] \approx 0.17\text{ mg/L}$, which surpasses the chronic safe threshold ($0.05\text{ mg/L}$) and enters the acute shrimp toxicity zone! A biologically defensible system must compute and display calculated $NH_3$.

### 3.2 Feeding & Waste Accumulation
Following a feeding event (typically distributed 3 to 4 times daily at 08:00, 12:00, 16:00, and 20:00), protein digestion produces an excretion peak within 1.5 to 3 hours:

$$\text{TAN excretion} \approx \text{Feed Mass (g)} \times \text{Protein \%} \times 0.092$$

In biofloc, heterotrophic assimilation removes TAN continuously according to Michaelis-Menten / Monod microbial uptake kinetics:

$$\frac{d[TAN]}{dt} = \text{Rate}_{excretion}(t) - V_{max} \frac{[TAN]}{K_s + [TAN]}$$

Where $K_s$ is the half-saturation constant ($\approx 0.2\text{–}0.5\text{ mg/L}$). In simplified educational simulators, this is effectively modeled by continuous exponential reversion toward baseline, punctuated by feeding step pulses.

---

## 4. pH and Water Temperature Interactions

### 4.1 Carbonate-Bicarbonate Buffer & Alkalinity Consumption
In biofloc systems, water pH is buffered by the dissolved inorganic carbon (DIC) equilibrium:

$$\text{CO}_2 + \text{H}_2\text{O} \rightleftharpoons \text{H}_2\text{CO}_3 \rightleftharpoons \text{HCO}_3^- + \text{H}^+ \rightleftharpoons \text{CO}_3^{2-} + 2\text{H}^+$$

- Nitrifying autotrophic bacteria consume approximately $7.14\text{ mg}$ of calcium carbonate ($\text{CaCO}_3$) alkalinity per gram of ammonia nitrogen oxidized, releasing $\text{H}^+$ ions and depressing pH.
- Nighttime respiration releases $\text{CO}_2$, which forms carbonic acid and slightly reduces pH by 0.2 to 0.4 units.
- Daytime photosynthesis strips dissolved $\text{CO}_2$, shifting the equilibrium rightward and elevating pH.
- Target biofloc pH range: **7.4 to 8.2**. pH values below 7.0 impair bacterial nitrification kinetics, while pH values above 8.4 exponentially increase unionized ammonia toxicity.

### 4.2 Water Temperature Effects
Tropical biofloc aquaculture species thrive between **$26.0^\circ\text{C}$ and $30.0^\circ\text{C}$**. Temperature directly affects:
1. **Metabolic rate**: Follows the $Q_{10}$ rule ($Q_{10} \approx 2.0\text{–}2.3$), doubling biological oxygen demand for every $10^\circ\text{C}$ increase.
2. **Nitrification efficiency**: Peaks near $28\text{–}30^\circ\text{C}$ and drops precipitously below $20^\circ\text{C}$.
3. **Oxygen solubility**: Warmer water holds significantly less dissolved oxygen at saturation.

---

## 5. Mathematical Formulation: Ornstein-Uhlenbeck (OU) SDE

### 5.1 The Continuous Stochastic Process
To simulate realistic, continuous, mean-reverting environmental sensors subjected to biological drift and physical turbulence, the system implements coupled **Ornstein-Uhlenbeck (OU) stochastic differential equations**:

$$dX_t = \theta \cdot (\mu(t) - X_t) \cdot dt + \sigma \cdot dW_t$$

Where:
- $X_t$: The continuous state variable ($DO$, $TAN$, $pH$, $Temp$).
- $\theta$: Mean-reversion velocity ($h^{-1}$), representing biological or chemical restoring forces (e.g. aeration re-oxygenation or microbial buffer capacity).
- $\mu(t)$: The dynamic time-varying biological attractor (incorporating diurnal harmonics and feeding events).
- $\sigma$: Volatility parameter representing sensor noise and hydrodynamic turbulence.
- $W_t$: Standard Brownian motion (Wiener process) where $dW_t \sim \mathcal{N}(0, dt)$.

### 5.2 Discrete Euler-Maruyama Implementation
For numerical computation across discrete time steps $\Delta t$, the stochastic differential equation is integrated using the Euler-Maruyama scheme:

$$X_{n+1} = X_n + \theta (\mu_n - X_n) \Delta t + \sigma \sqrt{\Delta t} \cdot \xi_n$$

Where $\xi_n \sim \mathcal{N}(0, 1)$ are independent and identically distributed standard normal random variates generated via a fixed seed pseudo-random number generator.

---

## 6. Scientific Scope, Claims & Methodological Demarcation

To maintain strict academic integrity and scientific credibility, all elements of the system are categorized explicitly:

### Category A: Established Scientific Equations & Relationships
- **Emerson et al. (1975) Freshwater Ammonia Equilibrium:** Real implemented biochemical relationship computing toxic unionized ammonia ($NH_3$) as a function of Total Ammonia Nitrogen (TAN), pH, and temperature.
- **Euler-Maruyama Numerical Discretization:** Established mathematical method for integrating stochastic differential equations (Kloeden & Platen, 1992).

### Category B: Literature-Informed Assumptions
- **Baseline Water Quality Ranges:** Baseline setpoints ($DO \approx 6.0$ mg/L, $pH \approx 7.8$, $T \approx 28.5^\circ\text{C}$, $TAN \approx 0.4$ mg/L) informed by biofloc literature (Avnimelech, 2009; Boyd & Tucker, 2014).
- **Diurnal Amplitude:** Amplitude parameters reflecting photosynthetic and solar forcing in surface ponds.

### Category C: Phenomenological Simulator Dynamics
- **OU Mean-Reversion Dynamics:** Uses Ornstein-Uhlenbeck stochastic processes to represent restoring tendencies (aeration, buffering) without solving full computational fluid dynamics or microbial population differential equations.
- **Nitrogen Assimilation:** Modeled phenomenologically as net exponential decay toward baseline rather than explicit stoichiometry of feed protein conversion.
- **Thermal Variation:** Modeled as a stochastic diurnal curve rather than a heat-transfer energy balance.

### Category D: Synthetic Scenario Behaviour
- **Simulated Aerator Failure:** Simplified exponential decay toward a low-DO floor ($DO_{floor} \approx 1.8$ mg/L) to generate test telemetry for anomaly detection.
- **Feeding Scenario:** Transient step-pulse elevation in TAN representing post-prandial excretion.

### Category E: Software Verification Results
- **Automated Test Suite:** 30 automated tests (23 unit/verification tests via `pytest` + 7 live container integration tests via `unittest`) passing with 100% success rate.
- **Dataflow Ingestion:** Verified MQTT ingestion, QuestDB ILP persistence, FastAPI routing, Server-Sent Events broadcasting, and unified delayed-residual ML evaluation.

### Category F: Machine Learning on Synthetic Data
- **Held-Out Evaluation:** Evaluated on 893 chronologically held-out synthetic test samples.
- **Performance:** LightGBM achieved 69.64% RMSE reduction relative to naive persistence (0.1507 vs 0.4963 mg/L); historical diurnal mean baseline achieved slightly lower RMSE (0.1447 mg/L) on this synthetic test set.
- **Quantile Coverage:** Nominal 90% interval achieved approximately 74.4% empirical coverage; further calibration required before claiming calibrated 90% intervals.
- **ADWIN-Inspired Residual Monitoring:** 0 drift detections observed during the 893-step stationary synthetic evaluation; flagged residual shift at step 15 (75-minute scenario detection delay in evaluated residual stream) in the synthetic failure scenario.

### Category G: Real-World Farm Validation — NOT Demonstrated
- **Field Telemetry:** The platform has NOT been validated on live aquaculture farm ponds or commercial raceways.
- **Physical Probes:** Sensor readings are synthetic. Physical sensor integration is ready via the `/api/telemetry` webhook but belongs to the teammate hardware scope.
- **Biological Inferences:** Simulator scenario outcomes reflect mathematical models, not guaranteed physiological outcomes for every real-world tank.

---

## 7. Academic References & Bibliography

1. **Avnimelech, Y.** (2009). *Biofloc Technology: A Practical Guide Book*. The World Aquaculture Society, Baton Rouge, Louisiana, USA.
2. **Benson, B. B., & Krause, D.** (1984). The concentration and isotopic fractionation of oxygen dissolved in freshwater and seawater in equilibrium with the atmosphere. *Limnology and Oceanography*, 29(3), 620-632.
3. **Boyd, C. E., & Tucker, C. S.** (2014). *Handbook for Aquaculture Water Quality*. Craftmaster Printers, Auburn, Alabama.
4. **Ebeling, J. M., Timmons, M. B., & Bisogni, J. J.** (2006). Review of recirculating aquaculture system technologies: Stoichiometry of microbial processes. *Aquacultural Engineering*, 34(3), 336-356.
5. **Emerson, K., Russo, R. C., Lund, R. E., & Thurston, R. V.** (1975). Aqueous ammonia equilibrium calculations: Effect of pH and temperature. *Journal of the Fisheries Research Board of Canada*, 32(12), 2379-2383.
6. **Hargreaves, J. A.** (2006). Photosynthetic suspended-growth systems in aquaculture. *Aquacultural Engineering*, 34(3), 344-363.
7. **Hargreaves, J. A.** (2013). *Biofloc Production Systems for Aquaculture*. Southern Regional Aquaculture Center (SRAC) Publication No. 4503.
8. **Kloeden, P. E., & Platen, E.** (1992). *Numerical Solution of Stochastic Differential Equations*. Springer-Verlag, Berlin.
9. **Vinatea, L., Gálvez, A. O., Browdy, C. L., et al.** (2010). Photosynthesis, respiration and emissions of trace greenhouse gases in zero-water exchange biofloc shrimp culture ponds. *Aquacultural Engineering*, 42(3), 115-124.
