/**
 * Sends one report of an AI answer (./report.ts says what it holds) and remembers, for this run of the
 * app, which answers were reported, so the same answer is not sent twice. The insert goes through the
 * signed-in Supabase client with no select (the table has no read for anyone but the service role).
 */
import { create } from 'zustand';

import { isBackendConfigured, supabase } from '@/services/supabase';

import { reportOutcome, type ReportOutcome, type ReportRow } from './report';

/** Answers reported in this run of the app (message ids). Not stored: a restart may offer it again, and the server caps a day at 20. */
export const useReportedAnswers = create<{ ids: readonly string[] }>(() => ({ ids: [] }));

export function markReported(id: string): void {
  const { ids } = useReportedAnswers.getState();
  if (!ids.includes(id)) useReportedAnswers.setState({ ids: [...ids, id] });
}

/** Insert the row. Never throws: the answer is how it went. */
export async function sendCoachReport(row: ReportRow): Promise<ReportOutcome> {
  if (!isBackendConfigured || !supabase) return 'account';
  try {
    const got = await supabase.auth.getSession();
    // Offline with an old token the refresh fails on the network: that is "no connection", not "signed out".
    if (got.error && !got.data.session) return reportOutcome(got.error);
    const session = got.data.session;
    if (!session?.user?.id) return 'account';
    const { error } = await supabase.from('ai_reports').insert({ user_id: session.user.id, ...row });
    return reportOutcome(error);
  } catch (e) {
    return reportOutcome({ message: e instanceof Error ? e.message : String(e) });
  }
}
