import { MistakeQuestion } from "../types";

const STORAGE_KEY = 'mistake_printer_records';

export function saveQuestion(question: MistakeQuestion) {
  const existing = getQuestions();
  const updated = [question, ...existing];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function getQuestions(): MistakeQuestion[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse stored questions", e);
    return [];
  }
}

export function deleteQuestions(ids: string[]) {
  const existing = getQuestions();
  const updated = existing.filter(q => !ids.includes(q.id));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
