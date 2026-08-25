import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

export interface EventTask {
  id: string
  event_id: string
  title: string
  assigned_to: string | null
  created_by: string
  created_at: string
}

const taskFields = 'id, event_id, title, assigned_to, created_by, created_at'

function tasksQueryKey(eventId: string) {
  return ['event-tasks', eventId] as const
}

async function fetchEventTasks(eventId: string): Promise<EventTask[]> {
  const { data, error } = await supabase
    .from('event_tasks')
    .select(taskFields)
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data
}

export function useEventTasks(eventId: string, userId: string) {
  const queryClient = useQueryClient()
  const queryKey = tasksQueryKey(eventId)

  const tasksQuery = useQuery({
    queryKey,
    queryFn: () => fetchEventTasks(eventId),
  })

  const createTask = useMutation({
    mutationFn: async (title: string) => {
      const { error } = await supabase
        .from('event_tasks')
        .insert({ event_id: eventId, title, created_by: userId })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const claimTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from('event_tasks')
        .update({ assigned_to: userId })
        .eq('id', taskId)
      if (error) throw error
    },
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<EventTask[]>(queryKey) ?? []
      queryClient.setQueryData<EventTask[]>(
        queryKey,
        previous.map((task) =>
          task.id === taskId ? { ...task, assigned_to: userId } : task,
        ),
      )
      return { previous }
    },
    onError: (_error, _taskId, context) => {
      if (context) queryClient.setQueryData(queryKey, context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  const releaseTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from('event_tasks')
        .update({ assigned_to: null })
        .eq('id', taskId)
      if (error) throw error
    },
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<EventTask[]>(queryKey) ?? []
      queryClient.setQueryData<EventTask[]>(
        queryKey,
        previous.map((task) =>
          task.id === taskId ? { ...task, assigned_to: null } : task,
        ),
      )
      return { previous }
    },
    onError: (_error, _taskId, context) => {
      if (context) queryClient.setQueryData(queryKey, context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from('event_tasks')
        .delete()
        .eq('id', taskId)
      if (error) throw error
    },
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<EventTask[]>(queryKey) ?? []
      queryClient.setQueryData<EventTask[]>(
        queryKey,
        previous.filter((task) => task.id !== taskId),
      )
      return { previous }
    },
    onError: (_error, _taskId, context) => {
      if (context) queryClient.setQueryData(queryKey, context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  return { tasksQuery, createTask, claimTask, releaseTask, deleteTask }
}
