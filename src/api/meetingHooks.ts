import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslatingInvalidator } from './translatingMutation';
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

function useInvalidator(keys: string[]) {
  const queryClient = useQueryClient();
  return () => {
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] });
  };
}

export const useCreateMeeting = () => {
  const onSuccess = useTranslatingInvalidator(['meetings'], 'meetings');
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
  const onSuccess = useTranslatingInvalidator(['decisions'], 'decisions');
  return useMutation({ mutationFn: meetings.createDecision, onSuccess });
};

export const useUpdateDecisionStatus = () => {
  const invalidate = useInvalidator(['decisions']);
  return useMutation({ mutationFn: meetings.updateDecisionStatus, onSuccess: invalidate });
};

export const useCreateAction = () => {
  // A new action is immediately something the next meeting has to deal with.
  const onSuccess = useTranslatingInvalidator(['actions', 'agenda'], 'action_items');
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
  const onSuccess = useTranslatingInvalidator(['questions', 'agenda'], 'open_questions');
  return useMutation({ mutationFn: meetings.createQuestion, onSuccess });
};

export const useAnswerQuestion = () => {
  const invalidate = useInvalidator(['questions', 'agenda']);
  return useMutation({ mutationFn: meetings.answerQuestion, onSuccess: invalidate });
};
