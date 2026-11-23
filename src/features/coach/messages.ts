/**
 * New chat messages, each with its own id and the moment it was written. Kept apart from the screen
 * so no render reads the clock: these run in event handlers only.
 */
import { newId } from '@/lib/id';

import type { CoachAnswer, CoachMessage } from './request';
import type { CoachNoticeKind } from './words';

export function questionMessage(text: string, source: 'typed' | 'local'): CoachMessage {
  return { id: newId(), role: 'user', source, text, at: Date.now() };
}

export function localAnswerMessage(q: CoachMessage, topic: 'training' | 'ideas', text: string): CoachMessage {
  return { id: newId(), role: 'assistant', source: 'local', topic, replyTo: q.id, text, at: Date.now() };
}

export function aiAnswerMessage(q: CoachMessage, a: CoachAnswer): CoachMessage {
  return { id: newId(), role: 'assistant', source: 'ai', replyTo: q.id, text: a.text, at: Date.now(), ...(a.truncated ? { truncated: true } : {}), ...(a.refer ? { refer: true } : {}) };
}

export function noticeMessage(q: CoachMessage, kind: CoachNoticeKind): CoachMessage {
  return { id: newId(), role: 'assistant', source: 'notice', notice: kind, replyTo: q.id, at: Date.now() };
}
