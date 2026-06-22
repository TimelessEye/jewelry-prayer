export type ParticipantType = 'parent' | 'teacher'
export type GuardianRole = 'mom' | 'daddy'

export interface Student {
  id: string
  className: string
  name: string
}

export interface ParticipantChild {
  studentId?: string
  name: string
  className?: string
  custom: boolean
}

export interface Participant {
  id: string
  type: ParticipantType
  displayName: string
  guardianRole?: GuardianRole
  teacherName?: string
  children?: ParticipantChild[]
  source: 'official' | 'custom'
  householdKey?: string
  createdAt: string
  lastSeenAt: string
}

export interface PrayerDay {
  dayIndex: number
  date: string
  monthDay: string
  title: string
  publishAt: string
}

export interface Completion {
  participantId: string
  dayIndex: number
  completedAt: string
  collectedAt: string
}

export interface ChallengeClosure {
  participantId: string
  finalizedAt: string
}

export interface AppState {
  participants: Participant[]
  completions: Completion[]
  challengeClosures: ChallengeClosure[]
  prayerImages: Record<string, Record<string, string>>
  prayerAudio: Record<string, string>
  prayerTexts: Record<string, string>
}
