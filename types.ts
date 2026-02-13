
export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE'
}

export interface MedicalData {
  age: number;
  gender: Gender;
  height: number;
  weight: number;
  bmi: number;
  systolicBP: number;
  diastolicBP: number;
  totalCholesterol: number;
  hdlCholesterol: number;
  hasDiabetes: boolean;
  isSmoker: boolean;
  onHypertensionMeds: boolean;
  onStatins: boolean;
  eGFR: number;
  acr: number;
  useFullKfre: boolean;
  phosphate?: number;
  bicarbonate?: number;
  calcium?: number;
  albumin?: number;
}

export interface RiskResults {
  cvTimeline: {
    fiveYear: number;
    tenYear: number;
    fifteenYear: number;
  };
  cv30y: {
    total: number;
  };
  renalTimeline: {
    twoYear: number;
    fiveYear: number;
    tenYear: number;
  };
  combinedLevel: 'low' | 'moderate' | 'high' | 'very_high';
}
