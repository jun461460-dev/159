export interface MistakeQuestion {
  id: string;
  question: string;
  options?: string[];
  userAnswer?: string;
  standardAnswer?: string;
  knowledgePoint: string;
  createdAt: number;
  originalImage?: string;
  variations: Variation[];
}

export interface Variation {
  id: string;
  question: string;
  answer: string;
  analysis: string;
}

export interface OCRResult {
  question: string;
  options?: string[];
  userAnswer?: string;
  standardAnswer?: string;
  knowledgePoint: string;
}
