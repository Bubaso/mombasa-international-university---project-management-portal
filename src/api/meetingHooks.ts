import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAutoTranslate } from './translateHooks';
import * as meetings from './meetings';

export const useMeetings = () =>
  useQuery({ queryKey: ['meetings'], queryFn: meetings.fetchMeetings });

export const useMeeting = (id: string | undefined) =>
  useQuery({
    queryKey: ['meeting', id],
    queryFn: () => meetings.fetchMeeting(id as string),
    enabled: id != null,
  });

export const useAttendees = (meetingId: string | undefined) =>
  useQuery({
    queryKey: ['attendees', meetingId],
    queryFn: () => meetings.fetchAttendees(meetingId as string),
    enabled: meetingId != null,
  });

export const useNotes = (meetingId: string | undefined) =>
  useQuery({
    queryKey: ['meetingNotes', meetingId],
    queryFn: () => meetings.fetchNotes(meetingId as string),
    enabled: meetingId != null,
  });

export const useDecisions = (meetingId?: string) =>
  useQuery({
    queryKey: ['decisions', meetingId ?? 'all'],
    queryFn: () => meetings.fetchDecisions(meetingId),
  });

export const useActions = (meetingId?: string) =>
  useQuery({
    queryKey: ['actions', meetingId ?? 'all'],
    queryFn: () => meetings.fetchActions(meetingId),
  });

export const useQuestions = (meetingId?: string) =>
  useQuery({
    queryKey: ['questions', meetingId ?? 'all'],
    queryFn: () => meetings.fetchQuestions(meetingId),
  });

/** Everything still open, which is where the next meeting starts. */
export const useAgenda = () => useQuery({ queryKey: ['agenda'], queryFn: meetings.fetchAgenda });

/**
 * Translating what a save left single-language (M3-10).
 *
 * Hung on the create mutations rather than on a form, so every way of creating
 * one of these records gets it — the meeting form, the offline capture's sync,
 * adopting an action candidate. The translation runs after the save has
 * succeeded and cannot fail it: `useAutoTranslate` swallows its own errors
 * because a minute that saved is saved whether or not a model was reachable.
 *
 * Only the create paths. An update is somebody editing, and a machine writing
 * into the other language while a person is working in this one is the kind of
 * help nobody asked for.
 */
function useTranslatingInvalidator(keys: string[], entityKind: string) {
  const invalidate = useInvalidator(keys);
  const translate = useAutoTranslate();
  return (created: unknown) => {
    invalidate();
    // The create functions return either the new id or the created record.
    // Both are accepted because both exist in this file and a translation that
    // silently never ran is worse than a line of narrowing here.
    const id =
      typeof created === 'string'
        ? created
        : typeof (created as { id?: unknown } | null)?.id === 'string'
          ? (created as { id: string }).id
          : null;
    if (id) void translate(entityKind, id);
  };
}

function useInvalidator(keys: string[]) {
  const queryClient = useQueryClient();
  return () => {
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] });
  };
}

export const useCreateMeeting = () => {
  const onSuccess = useTranslatingInvalidator(['meetings'], 'meeting');
  return useMutation({ mutationFn: meetings.createMeeting, onSuccess });
};

export const useUpdateMeeting = () => {
  const invalidate = useInvalidator(['meetings', 'meeting']);
  return useMutation({ mutationFn: meetings.updateMeeting, onSuccess: invalidate });
};

export const useAddAttendee = () => {
  const invalidate = useInvalidator(['attendees', 'meetings', 'meeting']);
  return useMutation({ mutationFn: meetings.addAttendee, onSuccess: invalidate });
};

export const useRemoveAttendee = () => {
  const invalidate = useInvalidator(['attendees', 'meetings', 'meeting']);
  return useMutation({ mutationFn: meetings.removeAttendee, onSuccess: invalidate });
};

export const useSaveNote = () => {
  const invalidate = useInvalidator(['meetingNotes']);
  return useMutation({ mutationFn: meetings.saveNote, onSuccess: invalidate });
};

export const useCreateDecision = () => {
  const onSuccess = useTranslatingInvalidator(['decisions'], 'decision');
  return useMutation({ mutationFn: meetings.createDecision, onSuccess });
};

export const useUpdateDecisionStatus = () => {
  const invalidate = useInvalidator(['decisions']);
  return useMutation({ mutationFn: meetings.updateDecisionStatus, onSuccess: invalidate });
};

export const useCreateAction = () => {
  // A new action is immediately something the next meeting has to deal with.
  const onSuccess = useTranslatingInvalidator(['actions', 'agenda'], 'action_item');
  return useMutation({ mutationFn: meetings.createAction, onSuccess });
};

export const useReportOnAction = () => {
  const invalidate = useInvalidator(['actions', 'agenda']);
  return useMutation({ mutationFn: meetings.reportOnAction, onSuccess: invalidate });
};

export const useRescheduleAction = () => {
  const invalidate = useInvalidator(['actions', 'agenda']);
  return useMutation({ mutationFn: meetings.rescheduleAction, onSuccess: invalidate });
};

export const useCreateQuestion = () => {
  const onSuccess = useTranslatingInvalidator(['questions', 'agenda'], 'open_question');
  return useMutation({ mutationFn: meetings.createQuestion, onSuccess });
};

export const useAnswerQuestion = () => {
  const invalidate = useInvalidator(['questions', 'agenda']);
  return useMutation({ mutationFn: meetings.answerQuestion, onSuccess: invalidate });
};
