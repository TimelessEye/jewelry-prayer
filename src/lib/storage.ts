import { DEV_SAMPLE_PRAYER_IMAGES, PRAYER_DAYS, type PrayerImageSlot } from './constants'
import { supabase } from './supabase'
import type {
  AppState,
  ChallengeClosure,
  Completion,
  GuardianRole,
  Participant,
  ParticipantChild,
} from './types'

const STATE_KEY = 'prayer-jewelry.state.v1'
const CURRENT_KEY = 'prayer-jewelry.currentParticipantId.v1'

const EMPTY_STATE: AppState = {
  participants: [],
  completions: [],
  challengeClosures: [],
  prayerImages: {},
}

type ParticipantRow = {
  id: string
  type: Participant['type']
  display_name: string
  guardian_role: GuardianRole | null
  teacher_name: string | null
  source: Participant['source']
  household_key: string | null
  created_at: string
  last_seen_at: string
}

type ParticipantChildRow = {
  participant_id: string
  student_id: string | null
  child_name: string
  class_name: string | null
  custom: boolean
}

type CompletionRow = {
  participant_id: string
  day_index: number
  completed_at: string
  collected_at: string
}

type ChallengeClosureRow = {
  participant_id: string
  finalized_at: string
}

type PrayerImageRow = {
  day_index: number
  slot: PrayerImageSlot
  public_url: string
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (!raw) return cloneState(EMPTY_STATE)
    return normalizeState({ ...EMPTY_STATE, ...JSON.parse(raw) } as AppState)
  } catch {
    return cloneState(EMPTY_STATE)
  }
}

export function saveState(state: AppState) {
  localStorage.setItem(STATE_KEY, JSON.stringify(normalizeState(state)))
}

export async function hydrateStateFromSupabase() {
  if (!supabase) return loadState()

  try {
    const [
      participantsResult,
      childrenResult,
      completionsResult,
      closuresResult,
      imagesResult,
    ] = await Promise.all([
      supabase.from('participants').select('*').order('created_at', { ascending: true }),
      supabase.from('participant_children').select('*').order('created_at', { ascending: true }),
      supabase.from('prayer_completions').select('*').order('completed_at', { ascending: true }),
      supabase.from('challenge_closures').select('*').order('finalized_at', { ascending: true }),
      supabase.from('prayer_images').select('day_index, slot, public_url').order('day_index', { ascending: true }),
    ])

    throwIfError(participantsResult.error)
    throwIfError(childrenResult.error)
    throwIfError(completionsResult.error)
    throwIfError(closuresResult.error)
    throwIfError(imagesResult.error)

    const remoteState = mapRemoteState({
      participants: (participantsResult.data ?? []) as ParticipantRow[],
      children: (childrenResult.data ?? []) as ParticipantChildRow[],
      completions: (completionsResult.data ?? []) as CompletionRow[],
      closures: (closuresResult.data ?? []) as ChallengeClosureRow[],
      images: (imagesResult.data ?? []) as PrayerImageRow[],
    })
    const merged = mergeStates(loadState(), remoteState)
    saveState(merged)
    return merged
  } catch (error) {
    console.warn('Supabase state sync failed.', error)
    return loadState()
  }
}

export function getCurrentParticipantId() {
  return localStorage.getItem(CURRENT_KEY)
}

export function setCurrentParticipantId(id: string | null) {
  if (id) localStorage.setItem(CURRENT_KEY, id)
  else localStorage.removeItem(CURRENT_KEY)
}

export async function createParentParticipant(children: ParticipantChild[], guardianRole: GuardianRole) {
  const state = loadState()
  const names = children.map((child) => child.name)
  const displayName = `${names.join('·')} ${guardianRole === 'mom' ? '맘' : '대디'}`
  const now = new Date().toISOString()
  const householdKey = names.slice().sort().join('|')
  const participant: Participant = {
    id: crypto.randomUUID(),
    type: 'parent',
    displayName,
    guardianRole,
    children,
    source: children.some((child) => child.custom) ? 'custom' : 'official',
    householdKey,
    createdAt: now,
    lastSeenAt: now,
  }

  state.participants.push(participant)
  saveState(state)
  setCurrentParticipantId(participant.id)

  await syncParticipant(participant)
  return participant
}

export async function createTeacherParticipant(teacherName: string) {
  const state = await hydrateStateFromSupabase()
  const now = new Date().toISOString()
  const existing = state.participants.find(
    (participant) => participant.type === 'teacher' && participant.teacherName === teacherName,
  )

  if (existing) {
    existing.lastSeenAt = now
    saveState(state)
    setCurrentParticipantId(existing.id)
    await touchParticipant(existing.id, now)
    return existing
  }

  const participant: Participant = {
    id: crypto.randomUUID(),
    type: 'teacher',
    displayName: `${teacherName} 선생님`,
    teacherName,
    source: 'official',
    createdAt: now,
    lastSeenAt: now,
  }
  state.participants.push(participant)
  saveState(state)
  setCurrentParticipantId(participant.id)

  await syncParticipant(participant)
  return participant
}

export async function markParticipantSeen(id: string) {
  const state = loadState()
  const participant = state.participants.find((item) => item.id === id)
  if (participant) {
    participant.lastSeenAt = new Date().toISOString()
    saveState(state)
    await touchParticipant(id, participant.lastSeenAt)
  }
}

export async function completePrayerDay(participantId: string, dayIndex: number): Promise<Completion> {
  const state = loadState()
  const existing = state.completions.find(
    (completion) => completion.participantId === participantId && completion.dayIndex === dayIndex,
  )
  if (existing) return existing

  const now = new Date().toISOString()
  const completion = { participantId, dayIndex, completedAt: now, collectedAt: now }
  state.completions.push(completion)
  saveState(state)

  if (supabase) {
    const { error } = await supabase.from('prayer_completions').upsert(
      {
        participant_id: participantId,
        day_index: dayIndex,
        completed_at: now,
        collected_at: now,
      },
      { onConflict: 'participant_id,day_index' },
    )
    throwIfError(error)
  }

  return completion
}

export function getParticipantCompletions(participantId: string, state = loadState()) {
  return state.completions
    .filter((completion) => completion.participantId === participantId)
    .sort((a, b) => a.dayIndex - b.dayIndex)
}

export function getCompletionCount(participantId: string, state = loadState()) {
  return getParticipantCompletions(participantId, state).length
}

export function hasCompleted(participantId: string, dayIndex: number, state = loadState()) {
  return state.completions.some(
    (completion) => completion.participantId === participantId && completion.dayIndex === dayIndex,
  )
}

export async function finalizeChallenge(participantId: string) {
  const state = loadState()
  const existing = state.challengeClosures.find((closure) => closure.participantId === participantId)
  if (existing) return existing

  const closure = { participantId, finalizedAt: new Date().toISOString() }
  state.challengeClosures.push(closure)
  saveState(state)

  if (supabase) {
    const { error } = await supabase.from('challenge_closures').upsert(
      {
        participant_id: participantId,
        finalized_at: closure.finalizedAt,
      },
      { onConflict: 'participant_id' },
    )
    throwIfError(error)
  }

  return closure
}

export function hasFinalizedChallenge(participantId: string, state = loadState()) {
  return state.challengeClosures.some((closure) => closure.participantId === participantId)
}

export function getPrayerImage(state: AppState, dayIndex: number, slot: PrayerImageSlot) {
  const uploaded = state.prayerImages[String(dayIndex)]?.[String(slot)]
  if (uploaded) return uploaded
  if (import.meta.env.DEV) return DEV_SAMPLE_PRAYER_IMAGES[slot]
  return null
}

export async function savePrayerImage(dayIndex: number, slot: PrayerImageSlot, file: File) {
  if (supabase) {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'png'
    const storagePath = `prayers/day-${String(dayIndex).padStart(2, '0')}/slot-${slot}.${extension}`
    const upload = await supabase.storage.from('prayer-images').upload(storagePath, file, {
      cacheControl: '60',
      upsert: true,
    })
    throwIfError(upload.error)

    const { data } = supabase.storage.from('prayer-images').getPublicUrl(storagePath)
    const publicUrl = `${data.publicUrl}?v=${Date.now()}`
    const { error } = await supabase.from('prayer_images').upsert(
      {
        day_index: dayIndex,
        slot,
        storage_path: storagePath,
        public_url: publicUrl,
      },
      { onConflict: 'day_index,slot' },
    )
    throwIfError(error)

    const state = loadState()
    state.prayerImages[String(dayIndex)] = {
      ...(state.prayerImages[String(dayIndex)] ?? {}),
      [String(slot)]: publicUrl,
    }
    saveState(state)
    return publicUrl
  }

  const dataUrl = await fileToDataUrl(file)
  const state = loadState()
  state.prayerImages[String(dayIndex)] = {
    ...(state.prayerImages[String(dayIndex)] ?? {}),
    [String(slot)]: dataUrl,
  }
  saveState(state)
  return dataUrl
}

export function fillCurrentParticipantForDev(participantId: string) {
  if (!import.meta.env.DEV) return
  const state = loadState()
  for (const day of PRAYER_DAYS) {
    if (!state.completions.some((completion) => completion.participantId === participantId && completion.dayIndex === day.dayIndex)) {
      state.completions.push({
        participantId,
        dayIndex: day.dayIndex,
        completedAt: new Date().toISOString(),
        collectedAt: new Date().toISOString(),
      })
    }
  }
  saveState(state)
}

export function fillAllParticipantsUntilForDev(dayLimit: number) {
  const state = loadState()
  if (!import.meta.env.DEV) return state

  const normalizedLimit = Math.max(0, Math.min(PRAYER_DAYS.length, Math.floor(dayLimit)))
  const participantIds = new Set(state.participants.map((participant) => participant.id))
  const now = new Date().toISOString()

  state.completions = state.completions.filter(
    (completion) => !participantIds.has(completion.participantId) || completion.dayIndex <= normalizedLimit,
  )

  for (const participant of state.participants) {
    for (const day of PRAYER_DAYS.slice(0, normalizedLimit)) {
      const hasCompletion = state.completions.some(
        (completion) => completion.participantId === participant.id && completion.dayIndex === day.dayIndex,
      )
      if (!hasCompletion) {
        state.completions.push({
          participantId: participant.id,
          dayIndex: day.dayIndex,
          completedAt: now,
          collectedAt: now,
        })
      }
    }
  }

  if (normalizedLimit < PRAYER_DAYS.length) {
    state.challengeClosures = state.challengeClosures.filter(
      (closure) => !participantIds.has(closure.participantId),
    )
  }

  saveState(state)
  return state
}

async function syncParticipant(participant: Participant) {
  if (!supabase) return

  const { error } = await supabase.from('participants').upsert(
    {
      id: participant.id,
      type: participant.type,
      display_name: participant.displayName,
      guardian_role: participant.guardianRole ?? null,
      teacher_name: participant.teacherName ?? null,
      source: participant.source,
      household_key: participant.householdKey ?? null,
      created_at: participant.createdAt,
      last_seen_at: participant.lastSeenAt,
    },
    { onConflict: 'id' },
  )
  throwIfError(error)

  if (participant.type === 'parent' && participant.children?.length) {
    const { error: childrenError } = await supabase.from('participant_children').insert(
      participant.children.map((child) => ({
        participant_id: participant.id,
        student_id: child.studentId ?? null,
        child_name: child.name,
        class_name: child.className ?? null,
        custom: child.custom,
      })),
    )
    throwIfError(childrenError)
  }
}

async function touchParticipant(id: string, seenAt: string) {
  if (!supabase) return
  const { error } = await supabase
    .from('participants')
    .update({ last_seen_at: seenAt })
    .eq('id', id)
  throwIfError(error)
}

function mapRemoteState({
  participants,
  children,
  completions,
  closures,
  images,
}: {
  participants: ParticipantRow[]
  children: ParticipantChildRow[]
  completions: CompletionRow[]
  closures: ChallengeClosureRow[]
  images: PrayerImageRow[]
}): AppState {
  const childrenByParticipant = new Map<string, ParticipantChild[]>()
  children.forEach((child) => {
    const participantChildren = childrenByParticipant.get(child.participant_id) ?? []
    participantChildren.push({
      studentId: child.student_id ?? undefined,
      name: child.child_name,
      className: child.class_name ?? undefined,
      custom: child.custom,
    })
    childrenByParticipant.set(child.participant_id, participantChildren)
  })

  const prayerImages: AppState['prayerImages'] = {}
  images.forEach((image) => {
    prayerImages[String(image.day_index)] = {
      ...(prayerImages[String(image.day_index)] ?? {}),
      [String(image.slot)]: image.public_url,
    }
  })

  return normalizeState({
    participants: participants.map((participant) => ({
      id: participant.id,
      type: participant.type,
      displayName: participant.display_name,
      guardianRole: participant.guardian_role ?? undefined,
      teacherName: participant.teacher_name ?? undefined,
      children: childrenByParticipant.get(participant.id),
      source: participant.source,
      householdKey: participant.household_key ?? undefined,
      createdAt: participant.created_at,
      lastSeenAt: participant.last_seen_at,
    })),
    completions: completions.map((completion) => ({
      participantId: completion.participant_id,
      dayIndex: completion.day_index,
      completedAt: completion.completed_at,
      collectedAt: completion.collected_at,
    })),
    challengeClosures: closures.map((closure) => ({
      participantId: closure.participant_id,
      finalizedAt: closure.finalized_at,
    })),
    prayerImages,
  })
}

function mergeStates(local: AppState, remote: AppState): AppState {
  return normalizeState({
    participants: mergeBy(local.participants, remote.participants, (participant) => participant.id),
    completions: mergeBy(local.completions, remote.completions, (completion) => `${completion.participantId}:${completion.dayIndex}`),
    challengeClosures: mergeBy(local.challengeClosures, remote.challengeClosures, (closure) => closure.participantId),
    prayerImages: {
      ...local.prayerImages,
      ...remote.prayerImages,
    },
  })
}

function mergeBy<T>(local: T[], remote: T[], getKey: (item: T) => string) {
  const map = new Map<string, T>()
  local.forEach((item) => map.set(getKey(item), item))
  remote.forEach((item) => map.set(getKey(item), item))
  return [...map.values()]
}

function normalizeState(state: AppState): AppState {
  return {
    participants: [...state.participants].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    completions: [...state.completions].sort((a, b) => a.dayIndex - b.dayIndex),
    challengeClosures: [...state.challengeClosures],
    prayerImages: state.prayerImages ?? {},
  }
}

function cloneState(state: AppState): AppState {
  return JSON.parse(JSON.stringify(state)) as AppState
}

function throwIfError(error: unknown) {
  if (error) throw error
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
