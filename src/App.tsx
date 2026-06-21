import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Download,
  Gem,
  Heart,
  Lock,
  Settings,
  Share2,
  Sparkles,
  UserRound,
  UsersRound,
} from 'lucide-react'
import {
  APP_TITLE,
  ASSETS,
  CLASSES,
  COLLECTION_GEMS,
  DEFAULT_TEACHER_COMPLETION_CARD,
  GEM_COLORS,
  ORG_LABEL,
  PRAYER_DAYS,
  PRAYER_IMAGE_SLOTS,
  STUDENTS,
  TEACHERS,
  type PrayerImageSlot,
  getCurrentPrayerDay,
  getTeacherCompletionCardSrc,
  isPublished,
} from './lib/constants'
import {
  completePrayerDay,
  createParentParticipant,
  createTeacherParticipant,
  fillAllParticipantsUntilForDev,
  finalizeChallenge,
  getCompletionCount,
  getCurrentParticipantId,
  getParticipantCompletions,
  getPrayerImage,
  hydrateStateFromSupabase,
  hasFinalizedChallenge,
  hasCompleted,
  loadState,
  markParticipantSeen,
  savePrayerImage,
  setCurrentParticipantId,
} from './lib/storage'
import { createCompletionCard, shareCompletionCard } from './lib/share'
import type { AppState, GuardianRole, Participant, ParticipantChild, PrayerDay } from './lib/types'

type Screen = 'start' | 'parent-register' | 'teacher-register' | 'home' | 'prayer' | 'collection' | 'all-prayers' | 'complete' | 'admin'
type FinishCeremony = {
  count: number
  participantType: Participant['type']
}

const GEM_SLOT_POSITIONS = [
  { x: 23.2, y: 30.7 },
  { x: 41.15, y: 30.7 },
  { x: 58.05, y: 30.7 },
  { x: 75.05, y: 30.7 },
  { x: 23.2, y: 43.6 },
  { x: 41.15, y: 43.6 },
  { x: 58.05, y: 43.6 },
  { x: 75.05, y: 43.6 },
  { x: 23.2, y: 56.3 },
  { x: 41.15, y: 56.3 },
  { x: 58.05, y: 56.3 },
  { x: 75.05, y: 56.3 },
  { x: 23.2, y: 68.9 },
  { x: 41.15, y: 68.9 },
  { x: 58.05, y: 68.9 },
  { x: 75.05, y: 68.9 },
  { x: 23.2, y: 81.5 },
  { x: 41.15, y: 81.5 },
  { x: 58.05, y: 81.5 },
  { x: 75.05, y: 81.5 },
]

function isAllGemPreview() {
  return import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('previewGems') === 'all'
}

function getDevCompletionLimit() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null
  const value = new URLSearchParams(window.location.search).get('devCompleteUntil')
  if (!value) return null
  const dayLimit = Number(value)
  return Number.isInteger(dayLimit) ? dayLimit : null
}

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState())
  const [currentId, setCurrentId] = useState<string | null>(() => getCurrentParticipantId())
  const [screen, setScreen] = useState<Screen>(() => (getCurrentParticipantId() ? 'home' : 'start'))
  const [selectedDay, setSelectedDay] = useState<PrayerDay>(() => getCurrentPrayerDay())
  const [toast, setToast] = useState<string | null>(null)
  const [highlightDayIndex, setHighlightDayIndex] = useState<number | null>(null)
  const [finishCeremony, setFinishCeremony] = useState<FinishCeremony | null>(null)
  const didApplyDevProgress = useRef(false)
  const finishTimerRef = useRef<number | null>(null)

  const participant = useMemo(
    () => state.participants.find((item) => item.id === currentId) ?? null,
    [currentId, state.participants],
  )

  useEffect(() => {
    hydrateStateFromSupabase().then((nextState) => setState(nextState))
  }, [])

  useEffect(() => {
    if (didApplyDevProgress.current || !import.meta.env.DEV) return
    const dayLimit = getDevCompletionLimit()
    if (dayLimit === null) return
    didApplyDevProgress.current = true
    const nextState = fillAllParticipantsUntilForDev(dayLimit)
    setState(nextState)
    showToast(`테스트 상태: 모든 등록 기도자 ${Math.min(Math.max(dayLimit, 0), PRAYER_DAYS.length)}/20 완료`)
  }, [])

  useEffect(() => {
    if (currentId) void markParticipantSeen(currentId)
  }, [currentId])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [screen, selectedDay.dayIndex])

  useEffect(() => {
    return () => {
      if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current)
    }
  }, [])

  function refresh() {
    setState(loadState())
  }

  function enterParticipant(next: Participant) {
    setCurrentParticipantId(next.id)
    setCurrentId(next.id)
    const devCompletionLimit = getDevCompletionLimit()
    if (devCompletionLimit === null) refresh()
    else setState(fillAllParticipantsUntilForDev(devCompletionLimit))
    setScreen('home')
  }

  function openPrayer(day: PrayerDay) {
    if (!isPublished(day)) {
      showToast('기도문은 당일 0시부터 열립니다.')
      return
    }
    setSelectedDay(day)
    setScreen('prayer')
  }

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 2200)
  }

  function openCompleteWithCeremony(nextState: AppState, nextParticipant: Participant) {
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current)
    setState(nextState)
    setFinishCeremony({
      count: getCompletionCount(nextParticipant.id, nextState),
      participantType: nextParticipant.type,
    })
    finishTimerRef.current = window.setTimeout(() => {
      setFinishCeremony(null)
      setScreen('complete')
    }, 1900)
  }

  function goHomeFromHeader() {
    setScreen('start')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    showToast('처음 화면으로 이동했어요.')
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fff4d8_0,#fffaf1_32%,#f4efe9_100%)] text-jewel-ink">
      <InAppNotice />
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <TopBar
          participant={participant}
          onHome={goHomeFromHeader}
          onAdmin={() => setScreen('admin')}
        />

        <main className="flex flex-1 items-start justify-center py-3 pb-12">
          {screen === 'start' && (
            <StartScreen
              current={participant}
              onContinue={() => setScreen('home')}
              onReset={() => {
                setCurrentParticipantId(null)
                setCurrentId(null)
                setScreen('start')
              }}
              onParent={() => setScreen('parent-register')}
              onTeacher={() => setScreen('teacher-register')}
            />
          )}
          {screen === 'parent-register' && <ParentRegister onBack={() => setScreen('start')} onCreate={enterParticipant} />}
          {screen === 'teacher-register' && <TeacherRegister onBack={() => setScreen('start')} onCreate={enterParticipant} />}
          {screen === 'home' && participant && (
            <HomeScreen
              participant={participant}
              state={state}
              onPrayer={openPrayer}
              onCollection={() => setScreen('collection')}
              onAllPrayers={() => setScreen('all-prayers')}
              onSwitch={() => setScreen('start')}
              onComplete={() => setScreen('complete')}
              onFinalize={async () => {
                await finalizeChallenge(participant.id)
                openCompleteWithCeremony(loadState(), participant)
              }}
            />
          )}
          {screen === 'prayer' && participant && (
            <PrayerScreen
              participant={participant}
              day={selectedDay}
              state={state}
              onBack={() => setScreen('home')}
              onCollected={async () => {
                const nextState = loadState()
                setState(nextState)
                const completedCount = getCompletionCount(participant.id, nextState)
                if (completedCount === PRAYER_DAYS.length) {
                  openCompleteWithCeremony(nextState, participant)
                  showToast('20개의 기도보석을 모두 모았어요.')
                } else if (participant.type === 'teacher' && selectedDay.dayIndex === PRAYER_DAYS.length) {
                  await finalizeChallenge(participant.id)
                  openCompleteWithCeremony(loadState(), participant)
                  showToast('보석기도 챌린지를 마감했어요.')
                } else {
                  setHighlightDayIndex(selectedDay.dayIndex)
                  setScreen('collection')
                  showToast(`${selectedDay.monthDay} 기도보석을 수집했어요.`)
                }
              }}
            />
          )}
          {screen === 'collection' && participant && (
            <CollectionScreen
              participant={participant}
              state={state}
              onBack={() => setScreen('home')}
              onOpenPrayer={openPrayer}
              onToast={showToast}
              highlightDayIndex={highlightDayIndex}
            />
          )}
          {screen === 'all-prayers' && participant && (
            <AllPrayersScreen
              participant={participant}
              state={state}
              onBack={() => setScreen('home')}
              onOpenPrayer={openPrayer}
            />
          )}
          {screen === 'complete' && participant && (
            <CompletionScreen
              participant={participant}
              state={state}
              onBack={() => setScreen('home')}
            />
          )}
          {screen === 'admin' && <AdminScreen state={state} onBack={() => setScreen(participant ? 'home' : 'start')} onRefresh={refresh} />}
        </main>
      </div>
      {toast && <div className="fixed bottom-5 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-full bg-jewel-ink px-4 py-3 text-center text-sm font-bold text-white shadow-card">{toast}</div>}
      {finishCeremony && <FinishCeremonyOverlay ceremony={finishCeremony} />}
    </div>
  )
}

function TopBar({ participant, onHome, onAdmin }: { participant: Participant | null; onHome: () => void; onAdmin: () => void }) {
  return (
    <header className="flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/55 px-3 py-2 shadow-sm backdrop-blur">
      <button
        type="button"
        onClick={onHome}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-jewel-gold/50"
        aria-label="메인 홈으로 이동"
      >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-jewel-gold/15 text-jewel-brown">
          <Gem size={22} />
        </span>
        <span>
          <span className="block text-sm font-black sm:text-base">{APP_TITLE}</span>
          <span className="block text-[11px] font-semibold text-jewel-brown/80">{ORG_LABEL}</span>
        </span>
      </button>
      <div className="flex items-center gap-2">
        {participant && <span className="hidden rounded-full bg-white px-3 py-1 text-xs font-bold text-jewel-brown shadow-sm sm:inline-block">{participant.displayName}</span>}
        <IconButton label="관리자 설정" onClick={onAdmin}>
          <Settings size={20} />
        </IconButton>
      </div>
    </header>
  )
}

function StartScreen({
  current,
  onContinue,
  onReset,
  onParent,
  onTeacher,
}: {
  current: Participant | null
  onContinue: () => void
  onReset: () => void
  onParent: () => void
  onTeacher: () => void
}) {
  return (
    <section className="grid w-full max-w-md content-center gap-4">
      <div className="text-center">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-jewel-brown">{ORG_LABEL}</p>
        <h1 className="mt-2 text-4xl font-black leading-tight text-jewel-ink">기도보석 챌린지</h1>
        <p className="mt-2 text-sm font-medium text-stone-600">20일 동안 다음세대를 위해 기도하고 보석을 모아요.</p>
        <p className="mt-3 rounded-full bg-white/70 px-4 py-2 text-sm font-black text-jewel-brown shadow-sm ring-1 ring-jewel-gold/25">
          운영기간: 6/22(월)~7/11(토)까지 20일 연속
        </p>
      </div>

      {current && (
        <div className="rounded-2xl border border-jewel-gold/30 bg-white/80 p-4 shadow-card">
          <p className="text-sm font-bold text-stone-600">이어서 참여하기</p>
          <button type="button" onClick={onContinue} className="mt-3 flex w-full items-center justify-between rounded-xl bg-jewel-ink px-4 py-3 text-left font-black text-white">
            {current.displayName}으로 계속하기
            <ChevronRight size={20} />
          </button>
          <button type="button" onClick={onReset} className="mt-3 text-xs font-bold text-stone-500 underline underline-offset-4">
            다른 이름으로 시작하기
          </button>
        </div>
      )}

      <div className="grid gap-3">
        <ChoiceButton icon={<Heart size={28} />} title="부모로 참여하기" subtitle="자녀를 위해 기도하고 보석을 모아요" onClick={onParent} />
        <ChoiceButton icon={<UsersRound size={28} />} title="교사로 참여하기" subtitle="교사 명단에서 이름을 선택해 시작해요" onClick={onTeacher} />
      </div>
    </section>
  )
}

function ParentRegister({ onBack, onCreate }: { onBack: () => void; onCreate: (participant: Participant) => void }) {
  const [selectedClass, setSelectedClass] = useState(CLASSES[0])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [customName, setCustomName] = useState('')
  const [role, setRole] = useState<GuardianRole>('mom')
  const [saving, setSaving] = useState(false)

  const selectedChildren = STUDENTS.filter((student) => selectedIds.includes(student.id)).map<ParticipantChild>((student) => ({
    studentId: student.id,
    name: student.name,
    className: student.className,
    custom: false,
  }))
  const customChildren = customName
    .split(/[,\n]/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map<ParticipantChild>((name) => ({ name, custom: true }))
  const children = [...selectedChildren, ...customChildren]
  const preview = children.length ? `${children.map((child) => child.name).join('·')} ${role === 'mom' ? '맘' : '대디'}` : '표시 이름 미리보기'

  async function submit() {
    if (!children.length || saving) return
    setSaving(true)
    try {
      onCreate(await createParentParticipant(children, role))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel>
      <BackButton onClick={onBack}>처음으로</BackButton>
      <PageTitle eyebrow="부모 등록" title="누구를 위해 기도하시나요?" description="자녀를 선택하고 맘/대디를 골라주세요." />

      <div className="flex flex-wrap gap-2">
        {CLASSES.map((className) => (
          <button key={className} type="button" onClick={() => setSelectedClass(className)} className={`chip ${selectedClass === className ? 'chip-active' : ''}`}>
            {className}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {STUDENTS.filter((student) => student.className === selectedClass).map((student) => {
          const active = selectedIds.includes(student.id)
          return (
            <button
              key={student.id}
              type="button"
              onClick={() => setSelectedIds((prev) => (active ? prev.filter((id) => id !== student.id) : [...prev, student.id]))}
              className={`rounded-xl border px-3 py-3 text-sm font-black transition ${active ? 'border-jewel-gold bg-jewel-gold/20 text-jewel-ink' : 'border-stone-200 bg-white text-stone-600'}`}
            >
              {student.name}
            </button>
          )
        })}
      </div>

      <label className="block">
        <span className="text-sm font-black text-stone-700">명단에 없는 자녀</span>
        <input value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="예: 하늘, 사랑" className="field mt-2" />
        <span className="mt-1 block text-xs font-medium text-stone-500">여러 명이면 쉼표로 구분해 주세요. 관리자 통계에서는 별도로 표시됩니다.</span>
      </label>

      <div className="grid grid-cols-2 gap-2 rounded-xl bg-stone-100 p-1">
        {(['mom', 'daddy'] as GuardianRole[]).map((item) => (
          <button key={item} type="button" onClick={() => setRole(item)} className={`rounded-lg py-2 text-sm font-black ${role === item ? 'bg-white text-jewel-brown shadow-sm' : 'text-stone-500'}`}>
            {item === 'mom' ? '맘' : '대디'}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-jewel-gold/30 bg-jewel-cream p-4 text-center">
        <p className="text-xs font-bold text-jewel-brown">표시 이름</p>
        <p className="mt-1 text-2xl font-black">{preview}</p>
      </div>

      <PrimaryButton disabled={!children.length || saving} onClick={submit}>
        {saving ? '저장 중...' : '이 이름으로 시작하기'}
      </PrimaryButton>
    </Panel>
  )
}

function TeacherRegister({ onBack, onCreate }: { onBack: () => void; onCreate: (participant: Participant) => void }) {
  const [savingName, setSavingName] = useState<string | null>(null)

  async function selectTeacher(name: string) {
    if (savingName) return
    setSavingName(name)
    try {
      onCreate(await createTeacherParticipant(name))
    } finally {
      setSavingName(null)
    }
  }

  return (
    <Panel>
      <BackButton onClick={onBack}>처음으로</BackButton>
      <PageTitle eyebrow="교사 등록" title="선생님 이름을 선택하세요" description="한 번 선택하면 다음 접속부터 자동으로 이어집니다." />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TEACHERS.map((name) => (
          <button key={name} type="button" onClick={() => selectTeacher(name)} className="rounded-xl border border-stone-200 bg-white px-3 py-4 text-sm font-black text-stone-700 shadow-sm transition hover:border-jewel-gold hover:bg-jewel-cream" disabled={Boolean(savingName)}>
            {savingName === name ? '저장 중...' : name}
          </button>
        ))}
      </div>
    </Panel>
  )
}

function HomeScreen({
  participant,
  state,
  onPrayer,
  onCollection,
  onAllPrayers,
  onSwitch,
  onComplete,
  onFinalize,
}: {
  participant: Participant
  state: AppState
  onPrayer: (day: PrayerDay) => void
  onCollection: () => void
  onAllPrayers: () => void
  onSwitch: () => void
  onComplete: () => void
  onFinalize: () => void | Promise<void>
}) {
  const today = getCurrentPrayerDay()
  const published = isPublished(today)
  const completeToday = hasCompleted(participant.id, today.dayIndex, state)
  const count = getCompletionCount(participant.id, state)
  const progress = Math.round((count / PRAYER_DAYS.length) * 100)
  const remainingPublishedDays = PRAYER_DAYS.filter(
    (day) => isPublished(day) && !hasCompleted(participant.id, day.dayIndex, state),
  )
  const finalDayPublished = isPublished(PRAYER_DAYS[PRAYER_DAYS.length - 1])
  const teacherFinalized = participant.type === 'teacher' && hasFinalizedChallenge(participant.id, state)
  const teacherCanFinishAsIs = participant.type === 'teacher' && finalDayPublished && count < PRAYER_DAYS.length && !teacherFinalized
  const onlyFinalPrayerRemains =
    remainingPublishedDays.length === 1 && remainingPublishedDays[0]?.dayIndex === PRAYER_DAYS.length

  return (
    <Panel wide>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-white/80 bg-white/70 p-5 shadow-card">
          <p className="text-sm font-black text-jewel-brown">{participant.displayName}</p>
          <h2 className="mt-2 text-3xl font-black">오늘의 기도</h2>
          <p className="mt-2 text-sm font-semibold text-stone-600">
            {today.monthDay} · {today.dayIndex}일차
          </p>
          {!published ? (
            <div className="mt-5 rounded-2xl bg-stone-100 p-4 text-sm font-bold text-stone-600">
              기도문은 당일 0시부터 열립니다.
            </div>
          ) : completeToday ? (
            <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
              오늘 기도보석을 수집했어요.
            </div>
          ) : (
            <PrimaryButton className="mt-5" onClick={() => onPrayer(today)}>
              오늘의 기도 시작하기
            </PrimaryButton>
          )}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <SecondaryButton onClick={onCollection} icon={<Gem size={18} />}>
              보석 수집장
            </SecondaryButton>
            <SecondaryButton onClick={onAllPrayers} icon={<CalendarDays size={18} />}>
              전체 기도문
            </SecondaryButton>
          </div>
          <button type="button" onClick={onSwitch} className="mt-4 text-xs font-bold text-stone-500 underline underline-offset-4">
            참여자 바꾸기
          </button>
        </div>

        <div className="rounded-3xl border border-white/80 bg-white/70 p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-jewel-brown">나의 수집 현황</p>
              <h3 className="text-3xl font-black">{count}/20</h3>
            </div>
            <div className="grid h-20 w-20 place-items-center rounded-full bg-jewel-gold/15 text-xl font-black text-jewel-brown">{progress}%</div>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-stone-200">
            <div className="h-full rounded-full bg-gradient-to-r from-jewel-rose via-jewel-gold to-jewel-teal" style={{ width: `${progress}%` }} />
          </div>
          <MiniGemRow participant={participant} state={state} />
          {teacherFinalized && (
            <div className="mt-5 rounded-2xl border border-jewel-gold/40 bg-jewel-cream p-4">
              <p className="text-sm font-black text-jewel-brown">챌린지를 마감했어요.</p>
              <p className="mt-1 text-xs font-bold leading-relaxed text-stone-600">교사 완주 카드를 다시 볼 수 있어요.</p>
              <button
                type="button"
                onClick={onComplete}
                className="mt-3 w-full rounded-xl bg-jewel-ink px-3 py-3 text-sm font-black text-white"
              >
                완주 카드 보기
              </button>
            </div>
          )}
          {teacherCanFinishAsIs && (
            <div className="mt-5 rounded-2xl border border-jewel-gold/40 bg-jewel-cream p-4">
              <p className="text-sm font-black text-jewel-brown">오늘은 챌린지 마지막 날입니다.</p>
              <p className="mt-1 text-xs font-bold leading-relaxed text-stone-600">
                남은 기도를 하시겠어요, 아니면 이대로 챌린지를 마감하시겠습니까?
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={onCollection} className="rounded-xl bg-white px-3 py-3 text-sm font-black text-jewel-brown ring-1 ring-jewel-gold/35">
                  남은 기도 하기
                </button>
                <button type="button" onClick={onFinalize} className="rounded-xl bg-jewel-ink px-3 py-3 text-sm font-black text-white">
                  이대로 마감하기
                </button>
              </div>
            </div>
          )}
          {!teacherCanFinishAsIs && !teacherFinalized && finalDayPublished && count < PRAYER_DAYS.length && remainingPublishedDays.length > 0 && (
            <div className="mt-5 rounded-2xl border border-jewel-gold/40 bg-jewel-cream p-4">
              <p className="text-sm font-black text-jewel-brown">
                {onlyFinalPrayerRemains ? '마지막 남은 오늘의 기도에 참여하시겠습니까?' : '남은 기도를 완주하시겠습니까?'}
              </p>
              <p className="mt-1 text-xs font-bold leading-relaxed text-stone-600">
                {onlyFinalPrayerRemains
                  ? '20일차 기도를 마치면 완주 축하 보석카드가 열립니다.'
                  : '수집장에서 비어 있는 보석 자리를 눌러 지난 기도를 이어갈 수 있어요.'}
              </p>
              <button
                type="button"
                onClick={() => (onlyFinalPrayerRemains ? onPrayer(remainingPublishedDays[0]) : onCollection())}
                className="mt-3 w-full rounded-xl bg-jewel-ink px-3 py-3 text-sm font-black text-white"
              >
                {onlyFinalPrayerRemains ? '20일차 기도하기' : '빈 보석 자리 보러가기'}
              </button>
            </div>
          )}
        </div>
      </div>
    </Panel>
  )
}

function PrayerScreen({
  participant,
  day,
  state,
  onBack,
  onCollected,
}: {
  participant: Participant
  day: PrayerDay
  state: AppState
  onBack: () => void
  onCollected: () => void | Promise<void>
}) {
  const [collecting, setCollecting] = useState(false)
  const [page, setPage] = useState<PrayerImageSlot>(1)
  const published = isPublished(day)
  const image = getPrayerImage(state, day.dayIndex, page)
  const count = getCompletionCount(participant.id, state)
  const isFinalDay = day.dayIndex === PRAYER_DAYS.length

  useEffect(() => {
    setPage(1)
    setCollecting(false)
  }, [day.dayIndex])

  return (
    <Panel wide>
      <BackButton onClick={onBack}>홈으로</BackButton>
      <PageTitle eyebrow={`${day.monthDay} · ${day.dayIndex}일차`} title={day.title} description="기도문을 따라 읽고, 말씀으로 축복하며, 기도제목을 함께 품어주세요." />
      {!published ? (
        <LockedBox />
      ) : (
        <>
          {participant.type === 'teacher' && isFinalDay && count < PRAYER_DAYS.length && (
            <div className="mx-auto mb-4 max-w-2xl rounded-2xl border border-jewel-gold/40 bg-jewel-cream p-4 text-sm font-bold leading-relaxed text-jewel-brown">
              이 기도를 마친 뒤 남은 기도를 더 하거나, 이대로 챌린지를 마감할 수 있어요.
            </div>
          )}
          <div className="mx-auto max-w-2xl">
            <div className="mb-3 flex items-center justify-between rounded-2xl bg-white/75 px-4 py-3 shadow-sm">
              <span className="text-sm font-black text-jewel-brown">
                {page}/{PRAYER_IMAGE_SLOTS.length} · {slotLabel(page)}
              </span>
              <div className="flex gap-1">
                {PRAYER_IMAGE_SLOTS.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setPage(slot)}
                    className={`h-2.5 w-8 rounded-full ${page === slot ? 'bg-jewel-brown' : 'bg-stone-200'}`}
                    aria-label={`${slot}페이지 보기`}
                  />
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-card">
              {image ? (
                <img src={image} alt={`${day.monthDay} ${slotLabel(page)}`} className="h-auto w-full object-contain" />
              ) : (
                <div className="grid min-h-[560px] place-items-center p-6 text-center">
                  <div>
                    <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-jewel-gold/15 text-jewel-brown">
                      <Sparkles size={28} />
                    </div>
                    <p className="mt-4 text-xl font-black">기도문을 준비 중이에요.</p>
                    <p className="mt-2 text-sm font-semibold text-stone-500">조금만 기다려주세요.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1) as PrayerImageSlot)}
                disabled={page === 1}
                className="rounded-2xl bg-white px-5 py-4 text-sm font-black text-stone-600 shadow-sm ring-1 ring-stone-200 disabled:opacity-40"
              >
                이전 장
              </button>
              {page < PRAYER_IMAGE_SLOTS.length ? (
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(PRAYER_IMAGE_SLOTS.length, prev + 1) as PrayerImageSlot)}
                  className="rounded-2xl bg-jewel-ink px-5 py-4 text-sm font-black text-white shadow-card"
                >
                  다음 장
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCollecting(true)}
                  className="rounded-2xl bg-jewel-ink px-5 py-4 text-sm font-black text-white shadow-card"
                >
                  기도 마치기
                </button>
              )}
            </div>
          </div>
        </>
      )}
      {collecting && (
        <CollectModal
          day={day}
          onCancel={() => setCollecting(false)}
          onCollect={async () => {
            await completePrayerDay(participant.id, day.dayIndex)
            setCollecting(false)
            await onCollected()
          }}
        />
      )}
    </Panel>
  )
}

function CollectionScreen({
  participant,
  state,
  onBack,
  onOpenPrayer,
  onToast,
  highlightDayIndex,
}: {
  participant: Participant
  state: AppState
  onBack: () => void
  onOpenPrayer: (day: PrayerDay) => void
  onToast: (message: string) => void
  highlightDayIndex: number | null
}) {
  return (
    <Panel wide>
      <BackButton
        onClick={() => {
          onBack()
        }}
      >
        홈으로
      </BackButton>
      <PageTitle eyebrow={participant.displayName} title="나의 보석 수집장" description="아직 수집하지 못한 보석 자리를 누르면 지난 기도문으로 이동합니다." />
      <div className={`board-wrap ${isAllGemPreview() ? 'board-wrap-preview' : ''}`}>
        <img src={ASSETS.gemBoard} alt="" className="board-bg" />
        <div className="gem-grid">
          {PRAYER_DAYS.map((day) => {
            const done = hasCompleted(participant.id, day.dayIndex, state) || isAllGemPreview()
            const published = isPublished(day)
            const position = GEM_SLOT_POSITIONS[day.dayIndex - 1]
            return (
              <button
                key={day.dayIndex}
                type="button"
                style={{ left: `${position.x}%`, top: `${position.y}%` }}
                onClick={() => {
                  if (done) onToast(`${day.monthDay} 기도보석을 이미 수집했어요.`)
                  else if (published) onOpenPrayer(day)
                  else onToast('기도문은 당일 0시부터 열립니다.')
                }}
                className={`gem-slot ${done ? 'gem-slot-done' : published ? 'gem-slot-open' : 'gem-slot-locked'} ${highlightDayIndex === day.dayIndex ? 'gem-slot-collected' : ''}`}
              >
                {done && <GemImage dayIndex={day.dayIndex} />}
                <span className="gem-day-badge">{day.dayIndex}</span>
              </button>
            )
          })}
        </div>
      </div>
    </Panel>
  )
}

function AllPrayersScreen({
  participant,
  state,
  onBack,
  onOpenPrayer,
}: {
  participant: Participant
  state: AppState
  onBack: () => void
  onOpenPrayer: (day: PrayerDay) => void
}) {
  const days = PRAYER_DAYS.filter((day) => isPublished(day))
  return (
    <Panel>
      <BackButton onClick={onBack}>홈으로</BackButton>
      <PageTitle eyebrow={participant.displayName} title="전체 기도문 보기" description="오늘과 과거에 공개된 기도문만 볼 수 있어요." />
      {days.length === 0 ? (
        <LockedBox />
      ) : (
        <div className="grid gap-2">
          {days.map((day) => {
            const done = hasCompleted(participant.id, day.dayIndex, state)
            return (
              <button key={day.dayIndex} type="button" onClick={() => onOpenPrayer(day)} className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm">
                <span>
                  <span className="block text-sm font-black">{day.monthDay} · {day.dayIndex}일차</span>
                  <span className="block text-xs font-bold text-stone-500">{done ? '보석 수집 완료' : '기도 가능'}</span>
                </span>
                {done ? <Check className="text-emerald-600" size={22} /> : <ChevronRight size={22} />}
              </button>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

function CompletionScreen({
  participant,
  state,
  onBack,
}: {
  participant: Participant
  state: AppState
  onBack: () => void
}) {
  const count = getCompletionCount(participant.id, state)
  const [busy, setBusy] = useState(false)
  const teacherCompletionCardSrc = participant.type === 'teacher' ? getTeacherCompletionCardSrc(participant.teacherName) : null
  const [teacherCardSrc, setTeacherCardSrc] = useState(teacherCompletionCardSrc ?? DEFAULT_TEACHER_COMPLETION_CARD)
  const teacherCanSeeCard = participant.type === 'teacher' && (count === PRAYER_DAYS.length || hasFinalizedChallenge(participant.id, state))

  useEffect(() => {
    setTeacherCardSrc(teacherCompletionCardSrc ?? DEFAULT_TEACHER_COMPLETION_CARD)
  }, [teacherCompletionCardSrc])

  async function share() {
    setBusy(true)
    try {
      const blob = await createCompletionCard(participant)
      await shareCompletionCard(participant, blob)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel>
      <BackButton onClick={onBack}>홈으로</BackButton>
      <PageTitle
        eyebrow={teacherCanSeeCard && count < PRAYER_DAYS.length ? '챌린지 마감' : '완주 축하'}
        title={teacherCanSeeCard && count < PRAYER_DAYS.length ? '챌린지를 마감했어요' : count === 20 ? '기도보석을 모두 모았어요' : '아직 모으는 중이에요'}
        description={`${count}/20개의 기도보석을 수집했습니다.`}
      />
      {count < 20 && !teacherCanSeeCard ? (
        <div className="rounded-2xl bg-white p-6 text-center shadow-card">20개를 모두 모으면 완주 카드가 열립니다.</div>
      ) : teacherCanSeeCard ? (
        <div className="text-center">
          <div className="teacher-completion-card shadow-card">
            <img
              src={teacherCardSrc}
              alt={`${participant.displayName} 완주 카드`}
              className="teacher-completion-template"
              onError={() => {
                if (teacherCardSrc !== DEFAULT_TEACHER_COMPLETION_CARD) setTeacherCardSrc(DEFAULT_TEACHER_COMPLETION_CARD)
              }}
            />
          </div>
          <PrimaryButton className="mt-5" onClick={share} disabled={busy}>
            {busy ? '이미지 만드는 중...' : '카톡으로 공유하기'}
          </PrimaryButton>
        </div>
      ) : (
        <div className="text-center">
          <div className="parent-completion-card shadow-card">
            <img src={ASSETS.parentCardTemplate} alt="" className="parent-completion-template" />
            <p className="parent-completion-message">보석보다 귀한 어린이 {participant.displayName}<br />보석기도 챌린지 완주를 축하합니다☺️♥️</p>
          </div>
          <PrimaryButton className="mt-5" onClick={share} disabled={busy}>
            {busy ? '이미지 만드는 중...' : '카톡으로 공유하기'}
          </PrimaryButton>
        </div>
      )}
    </Panel>
  )
}

function AdminScreen({ state, onBack, onRefresh }: { state: AppState; onBack: () => void; onRefresh: () => void }) {
  const [unlocked, setUnlocked] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const parentParticipants = state.participants.filter((participant) => participant.type === 'parent')
  const teacherParticipants = state.participants.filter((participant) => participant.type === 'teacher')
  const customParents = parentParticipants.filter((participant) => participant.source === 'custom')
  const parentFinishers = parentParticipants.filter((participant) => getCompletionCount(participant.id, state) === 20)
  const teacherFinishers = teacherParticipants.filter(
    (participant) => getCompletionCount(participant.id, state) === 20 || hasFinalizedChallenge(participant.id, state),
  )
  const today = getCurrentPrayerDay()
  const backupSummary = {
    parentCount: parentParticipants.length,
    teacherCount: teacherParticipants.length,
    parentFinisherCount: parentFinishers.length,
    teacherFinisherCount: teacherFinishers.length,
    completionCount: state.completions.length,
  }

  function unlock() {
    const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD?.trim()
    if (import.meta.env.DEV && code === '0000') {
      setUnlocked(true)
      return
    }
    if (adminPassword && code === adminPassword) {
      setUnlocked(true)
      return
    }
    setError(import.meta.env.DEV ? '개발 미리보기 코드는 0000입니다.' : '비밀번호를 확인해 주세요.')
  }

  if (!unlocked) {
    return (
      <Panel>
        <BackButton onClick={onBack}>돌아가기</BackButton>
        <PageTitle eyebrow="숨긴 관리자" title="관리자 비밀번호" description="관리자만 챌린지 현황을 확인할 수 있어요." />
        <input value={code} onChange={(event) => setCode(event.target.value)} type="password" className="field" placeholder="비밀번호" />
        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
        <PrimaryButton onClick={unlock}>관리자 열기</PrimaryButton>
      </Panel>
    )
  }

  return (
    <Panel wide>
      <BackButton onClick={onBack}>돌아가기</BackButton>
      <PageTitle eyebrow="관리자" title="기도보석 챌린지 현황" description="부모와 교사 통계를 분리해서 확인합니다." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="부모 등록" value={`${parentParticipants.length}명`} />
        <StatCard label="교사 등록" value={`${teacherParticipants.length}/${TEACHERS.length}명`} />
        <StatCard label="부모 완주" value={`${parentFinishers.length}명`} />
        <StatCard label="교사 완주" value={`${teacherFinishers.length}명`} />
      </div>
      <button
        type="button"
        onClick={() => downloadAdminBackup(state, backupSummary)}
        className="flex items-center justify-center gap-2 rounded-2xl bg-jewel-ink px-5 py-4 text-sm font-black text-white shadow-card transition hover:bg-jewel-brown"
      >
        <Download size={18} />
        현재 참여 기록 백업 다운로드
      </button>
      <div className="grid gap-3 lg:grid-cols-2">
        <AdminTable title="부모 참여자" participants={parentParticipants} state={state} />
        <AdminTable title="교사 참여자" participants={teacherParticipants} state={state} />
      </div>
      <HouseholdBothParents participants={parentParticipants} state={state} />
      <AdminPrayerUpload state={state} today={today} onRefresh={onRefresh} />
      {customParents.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-black text-amber-900">명단 외 참여자</h3>
          <p className="mt-2 text-sm font-semibold text-amber-800">{customParents.map((participant) => participant.displayName).join(', ')}</p>
        </div>
      )}
    </Panel>
  )
}

function downloadAdminBackup(
  state: AppState,
  summary: {
    parentCount: number
    teacherCount: number
    parentFinisherCount: number
    teacherFinisherCount: number
    completionCount: number
  },
) {
  const createdAt = new Date()
  const dateKey = createdAt.toISOString().slice(0, 10)
  const backup = {
    app: APP_TITLE,
    organization: ORG_LABEL,
    exportedAt: createdAt.toISOString(),
    summary,
    participants: state.participants,
    completions: state.completions,
    challengeClosures: state.challengeClosures,
    prayerImages: state.prayerImages,
  }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `jewelry-prayer-backup-${dateKey}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function AdminPrayerUpload({ state, today, onRefresh }: { state: AppState; today: PrayerDay; onRefresh: () => void }) {
  const [message, setMessage] = useState<string | null>(null)

  async function upload(dayIndex: number, slot: PrayerImageSlot, file: File | undefined) {
    if (!file) return
    try {
      await savePrayerImage(dayIndex, slot, file)
      setMessage(`${dayIndex}일차 ${slot}번 이미지를 저장했어요.`)
      onRefresh()
    } catch {
      setMessage('업로드에 실패했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.')
    }
  }

  return (
    <div className="rounded-3xl border border-white/80 bg-white/75 p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">기도문 이미지 관리</h3>
          <p className="text-xs font-bold text-stone-500">Supabase Storage에 저장됩니다. 오늘 기준: {today.monthDay}</p>
        </div>
      </div>
      {message && <p className="mt-3 rounded-xl bg-jewel-cream px-3 py-2 text-sm font-bold text-jewel-brown">{message}</p>}
      <div className="mt-4 grid gap-2">
        {PRAYER_DAYS.map((day) => {
          const slots = PRAYER_IMAGE_SLOTS
          const uploaded = slots.filter((slot) => getPrayerImage(state, day.dayIndex, slot)).length
          return (
            <details key={day.dayIndex} className="rounded-2xl border border-stone-200 bg-white p-3">
              <summary className="cursor-pointer text-sm font-black">
                {day.monthDay} · {day.dayIndex}일차 <span className="text-jewel-brown">({uploaded}/{PRAYER_IMAGE_SLOTS.length})</span>
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {slots.map((slot) => (
                  <label key={slot} className="rounded-xl bg-stone-50 p-3 text-xs font-bold text-stone-600">
                    {slotLabel(slot)}
                    <input type="file" accept="image/png,image/jpeg" className="mt-2 block w-full text-xs" onChange={(event) => upload(day.dayIndex, slot, event.target.files?.[0])} />
                  </label>
                ))}
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}

function AdminTable({ title, participants, state }: { title: string; participants: Participant[]; state: AppState }) {
  return (
    <div className="rounded-3xl border border-white/80 bg-white/75 p-4 shadow-card">
      <h3 className="text-lg font-black">{title}</h3>
      <div className="mt-3 grid gap-2">
        {participants.length === 0 ? (
          <p className="rounded-xl bg-stone-50 p-4 text-sm font-bold text-stone-500">아직 참여자가 없어요.</p>
        ) : (
          participants.map((participant) => {
            const count = getCompletionCount(participant.id, state)
            return (
              <div key={participant.id} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-stone-200">
                <span>
                  <span className="block text-sm font-black">{participant.displayName}</span>
                  <span className="block text-xs font-bold text-stone-500">{participant.source === 'custom' ? '명단 외' : participant.type === 'teacher' ? '교사' : '공식 명단'}</span>
                </span>
                <span className="rounded-full bg-jewel-cream px-3 py-1 text-sm font-black text-jewel-brown">{count}/20</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function HouseholdBothParents({ participants, state }: { participants: Participant[]; state: AppState }) {
  const byHome = new Map<string, Participant[]>()
  participants.forEach((participant) => {
    if (!participant.householdKey) return
    byHome.set(participant.householdKey, [...(byHome.get(participant.householdKey) ?? []), participant])
  })
  const both = [...byHome.values()].filter((items) => items.some((item) => item.guardianRole === 'mom') && items.some((item) => item.guardianRole === 'daddy'))

  return (
    <div className="rounded-3xl border border-white/80 bg-white/75 p-4 shadow-card">
      <h3 className="text-lg font-black">부모 둘 다 참여한 가정</h3>
      {both.length === 0 ? (
        <p className="mt-2 text-sm font-bold text-stone-500">아직 해당 가정이 없어요.</p>
      ) : (
        <div className="mt-3 grid gap-2">
          {both.map((items) => (
            <div key={items[0].householdKey} className="rounded-xl bg-jewel-cream p-3 text-sm font-bold text-jewel-brown">
              {items.map((item) => `${item.displayName} ${getCompletionCount(item.id, state)}/20`).join(' · ')}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MiniGemRow({ participant, state }: { participant: Participant; state: AppState }) {
  return (
    <div className="mt-5 grid grid-cols-10 gap-1.5">
      {PRAYER_DAYS.map((day) => (
        <span key={day.dayIndex} className={`h-4 rounded-full ${hasCompleted(participant.id, day.dayIndex, state) ? '' : 'bg-stone-200'}`} style={hasCompleted(participant.id, day.dayIndex, state) ? { backgroundColor: GEM_COLORS[day.dayIndex - 1] } : undefined} />
      ))}
    </div>
  )
}

function CollectModal({ day, onCancel, onCollect }: { day: PrayerDay; onCancel: () => void; onCollect: () => void | Promise<void> }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-stone-950/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-white/70 bg-white p-6 text-center shadow-card">
        <div className="mx-auto grid h-36 w-36 place-items-center rounded-full bg-jewel-cream shadow-glow">
          <GemImage dayIndex={day.dayIndex} large />
        </div>
        <h3 className="mt-5 text-2xl font-black">오늘의 기도보석을 발견했어요.</h3>
        <p className="mt-2 text-sm font-bold text-stone-600">기도보석을 수집하시겠습니까?</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl bg-stone-100 py-3 text-sm font-black text-stone-600">
            잠시 후에
          </button>
          <button type="button" onClick={onCollect} className="rounded-xl bg-jewel-ink py-3 text-sm font-black text-white">
            수집하기
          </button>
        </div>
      </div>
    </div>
  )
}

function FinishCeremonyOverlay({ ceremony }: { ceremony: FinishCeremony }) {
  const gems = [0, 1, 2, 3, 4, 5]
  return (
    <div className="finish-ceremony fixed inset-0 z-[60] grid place-items-center bg-[#2d241d]/45 px-4 backdrop-blur-sm">
      <div className="finish-ceremony-panel">
        <div className="finish-ceremony-stage" aria-hidden="true">
          <div className="finish-card-glow" />
          <div className="finish-bottle">
            <div className="finish-bottle-neck" />
            <div className="finish-bottle-body">
              {gems.map((item) => (
                <span key={item} className={`finish-flying-gem finish-flying-gem-${item + 1}`} />
              ))}
              <Gem className="finish-center-gem" size={44} />
            </div>
          </div>
          <Sparkles className="finish-sparkle finish-sparkle-1" size={24} />
          <Sparkles className="finish-sparkle finish-sparkle-2" size={18} />
          <Sparkles className="finish-sparkle finish-sparkle-3" size={20} />
        </div>
        <p className="mt-5 text-sm font-black text-jewel-brown">{ceremony.count}/20개의 기도보석</p>
        <h3 className="mt-1 text-2xl font-black leading-tight text-jewel-ink">
          보석들이 모여
          <br />
          완주 카드가 열립니다
        </h3>
      </div>
    </div>
  )
}

function GemImage({ dayIndex, large }: { dayIndex: number; large?: boolean }) {
  const [failed, setFailed] = useState(false)
  const src = COLLECTION_GEMS[dayIndex - 1] ?? ASSETS.baseGem
  return (
    <span className={`gem-image gem-image-day-${dayIndex} ${large ? 'gem-image-large' : ''}`}>
      <img src={failed ? ASSETS.baseGem : src} alt="" onError={() => setFailed(true)} />
    </span>
  )
}

function InAppNotice() {
  const [closed, setClosed] = useState(false)
  if (typeof navigator === 'undefined' || closed) return null
  const ua = navigator.userAgent
  const kakao = /KAKAOTALK/i.test(ua)
  const inApp = kakao || /Instagram|FBAN|FBAV|FB_IAB|Line\/|NAVER|Daum|; wv\)/i.test(ua)
  if (!inApp) return null

  return (
    <div className="flex items-center gap-2 bg-amber-100 px-4 py-2 text-xs font-bold text-amber-900">
      <span className="flex-1">앱 설치와 공유 기능을 사용하려면 외부 브라우저로 열어주세요.</span>
      {kakao && (
        <button type="button" onClick={() => (window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(window.location.href)}`)} className="rounded-md bg-amber-500 px-2 py-1 text-white">
          브라우저로 열기
        </button>
      )}
      <button type="button" onClick={() => setClosed(true)} aria-label="닫기" className="px-1">
        ×
      </button>
    </div>
  )
}

function Panel({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <section className={`w-full ${wide ? 'max-w-5xl' : 'max-w-xl'} space-y-4`}>{children}</section>
}

function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-jewel-brown">{eyebrow}</p>
      <h2 className="mt-1 text-3xl font-black leading-tight">{title}</h2>
      <p className="mt-2 text-sm font-semibold leading-relaxed text-stone-600">{description}</p>
    </div>
  )
}

function ChoiceButton({ icon, title, subtitle, onClick }: { icon: ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-32 items-center gap-4 rounded-3xl border border-white/80 bg-white/80 p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:border-jewel-gold">
      <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-jewel-cream text-jewel-brown">{icon}</span>
      <span>
        <span className="block text-xl font-black">{title}</span>
        <span className="mt-1 block text-sm font-bold text-stone-500">{subtitle}</span>
      </span>
    </button>
  )
}

function PrimaryButton({ children, onClick, disabled, className = '' }: { children: ReactNode; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`w-full rounded-2xl bg-jewel-ink px-5 py-4 text-sm font-black text-white shadow-card transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40 ${className}`}>
      {children}
    </button>
  )
}

function SecondaryButton({ children, onClick, icon }: { children: ReactNode; onClick: () => void; icon: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm font-black text-stone-700 shadow-sm">
      {icon}
      {children}
    </button>
  )
}

function IconButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid h-10 w-10 place-items-center rounded-full bg-white text-jewel-brown shadow-sm ring-1 ring-stone-200">
      {children}
    </button>
  )
}

function BackButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-sm font-black text-stone-500">
      <ArrowLeft size={18} />
      {children}
    </button>
  )
}

function LockedBox() {
  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-card">
      <Lock className="mx-auto text-stone-400" size={34} />
      <p className="mt-4 text-lg font-black">기도문은 당일 0시부터 열립니다.</p>
      <p className="mt-2 text-sm font-semibold text-stone-500">오늘과 과거에 공개된 기도문만 볼 수 있어요.</p>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/75 p-4 shadow-card">
      <p className="text-xs font-black text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  )
}

function slotLabel(slot: PrayerImageSlot) {
  if (slot === 1) return '기도문'
  return '말씀과 기도팁'
}
