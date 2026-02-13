
import { MedicalData, Gender, RiskResults } from '../types';

/**
 * Cálculo das Pooled Cohort Equations (ACC/AHA 2013)
 * Estudo de referência: Goff DC Jr, et al. 2013 ACC/AHA Guideline on the Assessment of Cardiovascular Risk.
 */
export const calculateCVRisk = (data: MedicalData) => {
  const { age, gender, systolicBP, totalCholesterol, hdlCholesterol, isSmoker, hasDiabetes, onHypertensionMeds, onStatins } = data;
  
  // Limites do estudo PCE (30-79 anos)
  const evalAge = Math.min(Math.max(age, 30), 79);
  const lnAge = Math.log(evalAge);
  const lnTotalChol = Math.log(totalCholesterol);
  const lnHDL = Math.log(hdlCholesterol);
  const lnSBP = Math.log(systolicBP);
  const smoker = isSmoker ? 1 : 0;
  const diabetes = hasDiabetes ? 1 : 0;

  let indivSum = 0;
  let meanSum = 0;
  let s10 = 0;

  if (gender === Gender.MALE) {
    indivSum = 
      (12.344 * lnAge) + 
      (11.853 * lnTotalChol) + 
      (-2.664 * lnAge * lnTotalChol) + 
      (-7.990 * lnHDL) + 
      (1.769 * lnAge * lnHDL) + 
      (onHypertensionMeds ? 1.797 * lnSBP : 1.764 * lnSBP) + 
      (7.837 * smoker) + 
      (-1.795 * lnAge * smoker) + 
      (0.658 * diabetes);
    
    meanSum = 61.1816;
    s10 = 0.9144;
  } else {
    indivSum = 
      (-29.799 * lnAge) + 
      (4.884 * lnAge * lnAge) + 
      (13.540 * lnTotalChol) + 
      (-3.114 * lnAge * lnTotalChol) + 
      (-13.578 * lnHDL) + 
      (3.149 * lnAge * lnHDL) + 
      (onHypertensionMeds ? 2.019 * lnSBP : 1.957 * lnSBP) + 
      (7.574 * smoker) + 
      (-1.665 * lnAge * smoker) + 
      (0.661 * diabetes);

    meanSum = -29.182;
    s10 = 0.9665;
  }

  const riskFactor = Math.exp(indivSum - meanSum);
  
  const calculateRiskAtTime = (t: number) => {
    // Escalonamento linear simples para tempos diferentes de 10 anos baseado no risco basal S10
    const st = Math.pow(s10, t / 10);
    let risk = 1 - Math.pow(st, riskFactor);
    
    // Impacto do uso de Estatina (Redução de Risco Relativo baseada em metanálises de ~25%)
    if (onStatins) {
      risk = risk * 0.75; 
    }
    
    return Math.min(Math.max(risk * 100, 0.1), 100);
  };

  return {
    fiveYear: calculateRiskAtTime(5),
    tenYear: calculateRiskAtTime(10),
    fifteenYear: calculateRiskAtTime(15),
    total: calculateRiskAtTime(10)
  };
};

/**
 * Kidney Failure Risk Equation (KFRE 4-variáveis)
 * Estudo de referência: Tangri N, et al. JAMA 2011.
 */
export const calculateRenalRisk = (data: MedicalData) => {
  const { age, gender, eGFR, acr } = data;
  
  const isMale = gender === Gender.MALE ? 1 : 0;
  
  // Coeficientes originais KFRE 4-variáveis (América do Norte/Universal)
  // LP = -0.2201 * (age/10 - 7.036) + 0.2467 * (male - 0.5642) - 0.5567 * (eGFR/5 - 7.222) + 0.4510 * (logACR - 5.137)
  const lnACR = Math.log(acr);
  
  let lp = 
    -0.2201 * (age / 10 - 7.036) +
    0.2467 * (isMale - 0.5642) -
    0.5567 * (eGFR / 5 - 7.222) +
    0.4510 * (lnACR - 5.137);

  // Sobrevida basal para falência renal
  const s2 = 0.9832;
  const s5 = 0.9365;
  const s10 = 0.8200; // Estimativa linear para 10 anos baseada na curva de progressão DRC

  return {
    twoYear: (1 - Math.pow(s2, Math.exp(lp))) * 100,
    fiveYear: (1 - Math.pow(s5, Math.exp(lp))) * 100,
    tenYear: (1 - Math.pow(s10, Math.exp(lp))) * 100,
  };
};

export const getCombinedResults = (data: MedicalData): RiskResults => {
  const cvRes = calculateCVRisk(data);
  const renalRes = calculateRenalRisk(data);

  // Estratificação de Risco Combinado baseada em diretrizes brasileiras e internacionais
  let level: RiskResults['combinedLevel'] = 'low';
  
  // Critérios de Risco Muito Alto: CV > 20% ou Renal > 15%
  if (cvRes.tenYear > 20 || renalRes.fiveYear > 15) level = 'very_high';
  // Critérios de Risco Alto: CV > 10% ou Renal > 10%
  else if (cvRes.tenYear > 10 || renalRes.fiveYear > 10) level = 'high';
  // Critérios de Risco Moderado: CV > 5% ou Renal > 5%
  else if (cvRes.tenYear > 5 || renalRes.fiveYear > 5) level = 'moderate';

  return { 
    cvTimeline: {
      fiveYear: cvRes.fiveYear,
      tenYear: cvRes.tenYear,
      fifteenYear: cvRes.fifteenYear
    },
    cv30y: {
      total: Math.min(cvRes.tenYear * 2.5, 100)
    },
    renalTimeline: {
      twoYear: renalRes.twoYear,
      fiveYear: renalRes.fiveYear,
      tenYear: renalRes.tenYear
    },
    combinedLevel: level 
  };
};

export const calculateOptimalRisk = (data: MedicalData) => {
  const optimalData: MedicalData = {
    ...data,
    systolicBP: 115, // Meta ideal estrita
    diastolicBP: 75,
    totalCholesterol: 160,
    hdlCholesterol: 55,
    isSmoker: false,
    onHypertensionMeds: false,
    onStatins: false,
    hasDiabetes: data.hasDiabetes // Diabetes é mantido como fator fixo para comparação justa de metas pressóricas/lipídicas
  };
  return calculateCVRisk(optimalData);
};
