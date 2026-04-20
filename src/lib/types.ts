export type StudyMode = "summary" | "flashcards" | "questions";

export interface SummarySection {
  heading: string;
  content: string;
}

export interface StudySummary {
  title: string;
  sections: SummarySection[];
  keyPoints: string[];
  studyPlan: string[];
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface GeneratedStudyPack {
  summary: StudySummary;
  flashcards: Flashcard[];
  questions: QuizQuestion[];
  sourceFiles: string[];
}

export interface StudySectionPack extends GeneratedStudyPack {
  id: string;
  name: string;
  createdAt: string;
}

export interface Notebook {
  id: string;
  name: string;
  createdAt: string;
  sections: StudySectionPack[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}
