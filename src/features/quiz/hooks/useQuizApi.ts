import { useMemo } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import type {
  Quiz,
  QuizAnswerResult,
  QuizCompleteResult,
  QuizDashboard,
  QuizResumeResult,
  MistakeItem,
  RecentQuizItem,
  TopicMastery,
} from '../../../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

interface GenerateQuizPayload {
  subject: string;
  topic: string;
  difficulty: string;
  question_count: number;
  source: string;
  document_id?: string | null;
}

interface AnswerPayload {
  question_id: string;
  selected_answer?: string | null;
  is_unknown?: boolean;
  used_hint?: boolean;
  time_spent_seconds?: number;
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === 'string') return body.detail;
  } catch {
    // ignore — fall through to generic message
  }
  return 'Something went wrong. Please try again.';
}

export function useQuizApi() {
  const { session } = useAuth();
  const accessToken = session?.access_token;

  return useMemo(() => {
    async function request<T>(path: string, init?: RequestInit): Promise<T> {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(init?.headers || {}),
        },
      });
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }
      return response.json() as Promise<T>;
    }

    return {
      generateQuiz: (payload: GenerateQuizPayload) =>
        request<Quiz>('/api/quiz/generate', { method: 'POST', body: JSON.stringify(payload) }),

      startQuiz: (quizId: string) =>
        request<{ attempt_id: string; quiz: Quiz }>(`/api/quiz/${quizId}/start`, { method: 'POST' }),

      resumeQuiz: (attemptId: string) =>
        request<QuizResumeResult>(`/api/quiz/attempts/${attemptId}/resume`),

      submitAnswer: (attemptId: string, payload: AnswerPayload) =>
        request<QuizAnswerResult>(`/api/quiz/attempts/${attemptId}/answer`, {
          method: 'POST',
          body: JSON.stringify(payload),
        }),

      completeQuiz: (attemptId: string) =>
        request<QuizCompleteResult>(`/api/quiz/attempts/${attemptId}/complete`, { method: 'POST' }),

      getHistory: () => request<{ attempts: RecentQuizItem[] }>('/api/quiz/history'),

      getMistakes: (status?: string) =>
        request<{ mistakes: MistakeItem[] }>(`/api/quiz/mistakes${status ? `?status=${status}` : ''}`),

      practiceMistake: (mistakeId: string) =>
        request<Quiz>(`/api/quiz/mistakes/${mistakeId}/practice`, { method: 'POST' }),

      masterMistake: (mistakeId: string) =>
        request<{ status: string }>(`/api/quiz/mistakes/${mistakeId}/master`, { method: 'POST' }),

      getMastery: () => request<{ mastery: TopicMastery[] }>('/api/quiz/mastery'),

      getDashboard: () => request<QuizDashboard>('/api/quiz/dashboard'),
    };
  }, [accessToken]);
}
