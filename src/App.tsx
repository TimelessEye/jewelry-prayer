import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Download,
  Gem,
  Heart,
  Lock,
  Music2,
  Pause,
  Play,
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
  EXTENDED_END_DATE,
  OFFICIAL_END_DATE,
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
  findParentParticipantProgress,
  findTeacherParticipantProgress,
  finalizeChallenge,
  getCompletionCount,
  getCurrentParticipantId,
  getParticipantCompletions,
  getPrayerAudio,
  getPrayerDeclaration,
  getPrayerImage,
  getPrayerRequest,
  getPrayerText,
  hydrateStateFromSupabase,
  hasFinalizedChallenge,
  hasCompleted,
  loadState,
  loadInteractiveState,
  markParticipantSeen,
  savePrayerImage,
  savePrayerAudio,
  savePrayerDeclaration,
  savePrayerText,
  savePrayerRequest,
  setCurrentParticipantId,
  resumeParticipant,
} from './lib/storage'
import { createCompletionCard, shareCompletionCard } from './lib/share'
import type { AppState, GuardianRole, Participant, ParticipantChild, PrayerDay, PrayerDeclaration, PrayerRequest } from './lib/types'

type Screen = 'start' | 'parent-register' | 'teacher-register' | 'home' | 'prayer' | 'collection' | 'all-prayers' | 'complete' | 'admin'
type FinishCeremony = {
  count: number
  participantType: Participant['type']
}
type CompletionPrompt = {
  count: number
  participantType: Participant['type']
}
type CompletionCelebration = CompletionPrompt
type ParentFinishChoicePrompt = {
  day: PrayerDay
}
type CollectionCeremony = {
  dayIndex: number
  replay?: boolean
}
type PrayerTextSize = 'normal' | 'large'
type ParentProgressMatch = {
  participant: Participant
  completionCount: number
}
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const HIDDEN_ADMIN_PARENT_NAMES = new Set(['김채론 맘'])

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

function preloadImage(src: string | null | undefined) {
  if (!src || typeof window === 'undefined') return
  const image = new Image()
  image.src = src
  if (typeof image.decode === 'function') {
    void image.decode().catch(() => undefined)
  }
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
  const [completionCelebration, setCompletionCelebration] = useState<CompletionCelebration | null>(null)
  const [completionPrompt, setCompletionPrompt] = useState<CompletionPrompt | null>(null)
  const [parentFinishChoicePrompt, setParentFinishChoicePrompt] = useState<ParentFinishChoicePrompt | null>(null)
  const [collectionCeremony, setCollectionCeremony] = useState<CollectionCeremony | null>(null)
  const didApplyDevProgress = useRef(false)
  const finishTimerRef = useRef<number | null>(null)
  const collectionTimerRef = useRef<number | null>(null)
  const completionCelebrationTimerRef = useRef<number | null>(null)
  const completionPromptTimerRef = useRef<number | null>(null)

  const participant = useMemo(
    () => state.participants.find((item) => item.id === currentId) ?? null,
    [currentId, state.participants],
  )

  useEffect(() => {
    if (!currentId || participant) return
    setCurrentParticipantId(null)
    setCurrentId(null)
    setScreen('start')
  }, [currentId, participant])

  useEffect(() => {
    hydrateStateFromSupabase().then((nextState) => setState(nextState))
  }, [])

  useEffect(() => {
    preloadImage(ASSETS.gemBoard)
    preloadImage(ASSETS.baseGem)
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
      if (collectionTimerRef.current) window.clearTimeout(collectionTimerRef.current)
      if (completionCelebrationTimerRef.current) window.clearTimeout(completionCelebrationTimerRef.current)
      if (completionPromptTimerRef.current) window.clearTimeout(completionPromptTimerRef.current)
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

  function enterPrayerScreen(day: PrayerDay) {
    setSelectedDay(day)
    setScreen('prayer')
  }

  function openPrayer(day: PrayerDay) {
    if (!isPrayerOpen(day, state)) {
      showToast(getPrayerLockedMessage(day))
      return
    }

    if (participant?.type === 'parent') {
      const count = getCompletionCount(participant.id, state)
      const finalized = hasFinalizedChallenge(participant.id, state)

      if (count < PRAYER_DAYS.length && !finalized && isWithinVisibleDateRange(OFFICIAL_END_DATE, EXTENDED_END_DATE)) {
        setParentFinishChoicePrompt({ day })
        return
      }
    }

    enterPrayerScreen(day)
  }

  async function finishParentChallengeToday() {
    if (!participant || participant.type !== 'parent') return
    await finalizeChallenge(participant.id)
    setParentFinishChoicePrompt(null)
    openCompleteWithCeremony(loadState(), participant)
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

  function openCollectionWithCeremony(nextState: AppState, dayIndex: number, message: string, replay = false) {
    if (collectionTimerRef.current) window.clearTimeout(collectionTimerRef.current)
    preloadImage(ASSETS.gemBoard)
    preloadImage(COLLECTION_GEMS[dayIndex - 1] ?? ASSETS.baseGem)
    setState(nextState)
    setHighlightDayIndex(dayIndex)
    setCollectionCeremony({ dayIndex, replay })
    collectionTimerRef.current = window.setTimeout(() => {
      setCollectionCeremony(null)
      setScreen('collection')
      showToast(message)
    }, 2850)
  }

  function openFinalCollectionWithCertificatePrompt(nextState: AppState, dayIndex: number, nextParticipant: Participant, message: string) {
    if (collectionTimerRef.current) window.clearTimeout(collectionTimerRef.current)
    if (completionCelebrationTimerRef.current) window.clearTimeout(completionCelebrationTimerRef.current)
    if (completionPromptTimerRef.current) window.clearTimeout(completionPromptTimerRef.current)
    preloadImage(ASSETS.gemBoard)
    preloadImage(COLLECTION_GEMS[dayIndex - 1] ?? ASSETS.baseGem)
    setState(nextState)
    setHighlightDayIndex(dayIndex)
    setCompletionPrompt(null)
    setCompletionCelebration(null)
    setCollectionCeremony({ dayIndex })
    collectionTimerRef.current = window.setTimeout(() => {
      const prompt = {
        count: getCompletionCount(nextParticipant.id, nextState),
        participantType: nextParticipant.type,
      }
      setCollectionCeremony(null)
      setScreen('collection')
      showToast(message)
      completionCelebrationTimerRef.current = window.setTimeout(() => {
        setCompletionCelebration(prompt)
        completionPromptTimerRef.current = window.setTimeout(() => {
          setCompletionCelebration(null)
          setCompletionPrompt(prompt)
        }, 2400)
      }, 1650)
    }, 2850)
  }

  function goHomeFromHeader() {
    setScreen('start')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    showToast('처음 화면으로 이동했어요.')
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fff4d8_0,#fffaf1_32%,#f4efe9_100%)] text-jewel-ink">
      <InAppNotice />
      <InstallNotice />
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
              onStateChange={setState}
              onBack={() => setScreen('home')}
              onCollected={async () => {
                const nextState = loadState()
                setState(nextState)
                const completedCount = getCompletionCount(participant.id, nextState)
                if (completedCount === PRAYER_DAYS.length) {
                  openFinalCollectionWithCertificatePrompt(nextState, selectedDay.dayIndex, participant, '마지막 기도보석을 수집했어요.')
                } else if (
                  participant.type === 'parent' &&
                  selectedDay.dayIndex === PRAYER_DAYS.length &&
                  isOnOrAfterVisibleDate(EXTENDED_END_DATE)
                ) {
                  await finalizeChallenge(participant.id)
                  openFinalCollectionWithCertificatePrompt(loadState(), selectedDay.dayIndex, participant, '마지막 기도보석을 수집했어요.')
                } else {
                  openCollectionWithCeremony(nextState, selectedDay.dayIndex, `${selectedDay.monthDay} 기도보석을 수집했어요.`)
                }
              }}
              onReplayCollection={async () => {
                const nextState = await loadInteractiveState()
                const completedCount = getCompletionCount(participant.id, nextState)
                const shouldReplayCertificate =
                  selectedDay.dayIndex === PRAYER_DAYS.length &&
                  (completedCount === PRAYER_DAYS.length || hasFinalizedChallenge(participant.id, nextState))

                if (shouldReplayCertificate) {
                  openFinalCollectionWithCertificatePrompt(nextState, selectedDay.dayIndex, participant, '마지막 기도보석을 다시 보여드릴게요.')
                  return
                }

                openCollectionWithCeremony(nextState, selectedDay.dayIndex, `${selectedDay.monthDay} 기도보석을 다시 보여드릴게요.`, true)
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
              completionCelebrating={Boolean(completionCelebration)}
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
      {collectionCeremony && <CollectionCeremonyOverlay ceremony={collectionCeremony} />}
      {completionCelebration && <BoardCompletionCelebration />}
      {parentFinishChoicePrompt && (
        <ParentFinishChoiceModal
          onFinish={finishParentChallengeToday}
          onContinue={() => {
            const day = parentFinishChoicePrompt.day
            setParentFinishChoicePrompt(null)
            enterPrayerScreen(day)
          }}
          onClose={() => setParentFinishChoicePrompt(null)}
        />
      )}
      {completionPrompt && participant && (
        <CertificatePrompt
          prompt={completionPrompt}
          onCancel={() => setCompletionPrompt(null)}
          onConfirm={() => {
            setCompletionPrompt(null)
            openCompleteWithCeremony(loadState(), participant)
          }}
        />
      )}
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
        <h1 className="mt-2 text-4xl font-black leading-tight text-jewel-ink">20일 보석기도</h1>
        <p className="mt-2 text-sm font-medium text-stone-600">20일 동안 다음세대를 위해 함께 기도해요</p>
        <p className="mt-3 rounded-full bg-white/70 px-4 py-2 text-sm font-black text-jewel-brown shadow-sm ring-1 ring-jewel-gold/25">
          보석기도는 7/17(금)까지 연장 운영됩니다.
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
  const [pendingExisting, setPendingExisting] = useState<ParentProgressMatch | null>(null)

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

  useEffect(() => {
    setPendingExisting(null)
  }, [customName, role, selectedIds])

  async function submit() {
    if (!children.length || saving) return
    setSaving(true)
    try {
      const existing = await findParentParticipantProgress(children, role)
      if (existing && existing.completionCount > 0) {
        setPendingExisting(existing)
        return
      }
      onCreate(await createParentParticipant(children, role))
    } finally {
      setSaving(false)
    }
  }

  async function continueExisting() {
    if (!pendingExisting || saving) return
    setSaving(true)
    try {
      const participant = await resumeParticipant(pendingExisting.participant.id)
      if (participant) onCreate(participant)
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

      {pendingExisting && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-stone-950/55 px-4 backdrop-blur-sm">
          <div className="relative w-full max-w-sm rounded-3xl border border-white/70 bg-white p-6 text-center shadow-card">
            <button
              type="button"
              onClick={() => setPendingExisting(null)}
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-stone-100 text-lg font-black leading-none text-stone-500 transition hover:bg-stone-200"
              aria-label="창 닫기"
            >
              ×
            </button>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-jewel-cream text-jewel-brown">
              <Gem size={28} />
            </div>
            <h3 className="mt-4 text-2xl font-black leading-tight">이미 진행된 기도가 있어요</h3>
            <p className="mt-3 text-sm font-bold leading-relaxed text-stone-600">
              {pendingExisting.participant.displayName} 이름으로 {pendingExisting.completionCount}/20개의 기도보석이 모여 있습니다.
            </p>
            <p className="mt-2 text-sm font-bold leading-relaxed text-stone-600">이전 기록을 이어서 하시겠어요?</p>
            <div className="mt-5 grid gap-2">
              <button type="button" onClick={continueExisting} disabled={saving} className="rounded-xl bg-jewel-ink py-3 text-sm font-black text-white disabled:opacity-50">
                네, 이어서 할게요
              </button>
              <button type="button" onClick={() => setPendingExisting(null)} disabled={saving} className="rounded-xl bg-stone-100 py-3 text-sm font-black text-stone-700 disabled:opacity-50">
                선생님께 문의하기
              </button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}

function TeacherRegister({ onBack, onCreate }: { onBack: () => void; onCreate: (participant: Participant) => void }) {
  const [savingName, setSavingName] = useState<string | null>(null)
  const [pendingExisting, setPendingExisting] = useState<ParentProgressMatch | null>(null)

  async function selectTeacher(name: string) {
    if (savingName) return
    setSavingName(name)
    try {
      const existing = await findTeacherParticipantProgress(name)
      if (existing && existing.completionCount > 0) {
        setPendingExisting(existing)
        return
      }
      onCreate(await createTeacherParticipant(name))
    } finally {
      setSavingName(null)
    }
  }

  async function continueExisting() {
    if (!pendingExisting || savingName) return
    setSavingName(pendingExisting.participant.teacherName ?? pendingExisting.participant.displayName)
    try {
      const participant = await resumeParticipant(pendingExisting.participant.id)
      if (participant) onCreate(participant)
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

      {pendingExisting && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-stone-950/55 px-4 backdrop-blur-sm">
          <div className="relative w-full max-w-sm rounded-3xl border border-white/70 bg-white p-6 text-center shadow-card">
            <button
              type="button"
              onClick={() => setPendingExisting(null)}
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-stone-100 text-lg font-black leading-none text-stone-500 transition hover:bg-stone-200"
              aria-label="창 닫기"
            >
              ×
            </button>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-jewel-cream text-jewel-brown">
              <Gem size={28} />
            </div>
            <h3 className="mt-4 text-2xl font-black leading-tight">이미 진행된 기록이 있어요</h3>
            <p className="mt-3 text-sm font-bold leading-relaxed text-stone-600">
              {pendingExisting.participant.displayName} 이름으로 {pendingExisting.completionCount}/20개의 기도보석이 모여 있습니다.
            </p>
            <p className="mt-2 text-sm font-bold leading-relaxed text-stone-600">본인 기록이 맞으면 이어서 들어가세요.</p>
            <button type="button" onClick={continueExisting} disabled={Boolean(savingName)} className="mt-5 w-full rounded-xl bg-jewel-ink py-3 text-sm font-black text-white disabled:opacity-50">
              네, 이어서 들어갈게요
            </button>
          </div>
        </div>
      )}
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
  const published = isPrayerOpen(today, state)
  const completeToday = hasCompleted(participant.id, today.dayIndex, state)
  const count = getCompletionCount(participant.id, state)
  const progress = Math.round((count / PRAYER_DAYS.length) * 100)
  const remainingPublishedDays = PRAYER_DAYS.filter(
    (day) => isPrayerOpen(day, state) && !hasCompleted(participant.id, day.dayIndex, state),
  )
  const finalPrayerDay = PRAYER_DAYS[PRAYER_DAYS.length - 1]
  const finalDayPublished = isPrayerOpen(PRAYER_DAYS[PRAYER_DAYS.length - 1], state)
  const finalized = hasFinalizedChallenge(participant.id, state)
  const teacherFinalized = participant.type === 'teacher' && finalized
  const parentFinalized = participant.type === 'parent' && finalized
  const teacherCanFinishAsIs = participant.type === 'teacher' && isOnOrAfterVisibleDate(OFFICIAL_END_DATE) && finalDayPublished && count < PRAYER_DAYS.length && !teacherFinalized
  const parentExtensionOpen = participant.type === 'parent' && isOnOrAfterVisibleDate(OFFICIAL_END_DATE) && !isOnOrAfterVisibleDate(EXTENDED_END_DATE) && count < PRAYER_DAYS.length
  const parentCanFinalDayFinish =
    participant.type === 'parent' &&
    isOnOrAfterVisibleDate(EXTENDED_END_DATE) &&
    finalDayPublished &&
    count < PRAYER_DAYS.length &&
    !parentFinalized
  const finalPrayerCompleted = hasCompleted(participant.id, finalPrayerDay.dayIndex, state)
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
              {getPrayerLockedMessage(today)}
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
          {parentFinalized && (
            <div className="mt-5 rounded-2xl border border-jewel-gold/40 bg-jewel-cream p-4">
              <p className="text-sm font-black text-jewel-brown">20일 보석기도를 마감했어요.</p>
              <p className="mt-1 text-xs font-bold leading-relaxed text-stone-600">완주 카드를 다시 볼 수 있어요.</p>
              <button
                type="button"
                onClick={onComplete}
                className="mt-3 w-full rounded-xl bg-jewel-ink px-3 py-3 text-sm font-black text-white"
              >
                완주 카드 보기
              </button>
            </div>
          )}
          {parentExtensionOpen && (
            <div className="mt-5 rounded-2xl border border-jewel-gold/40 bg-jewel-cream p-4">
              <p className="text-sm font-black text-jewel-brown">보석기도가 7월 17일까지 연장 운영됩니다.</p>
              <p className="mt-1 text-xs font-bold leading-relaxed text-stone-600">
                남은 기도를 이어가면 20일 기도 여정을 완성할 수 있어요.
              </p>
              <button
                type="button"
                onClick={onCollection}
                className="mt-3 w-full rounded-xl bg-jewel-ink px-3 py-3 text-sm font-black text-white"
              >
                남은 기도 보기
              </button>
            </div>
          )}
          {parentCanFinalDayFinish && (
            <div className="mt-5 rounded-2xl border border-jewel-gold/40 bg-jewel-cream p-4">
              <p className="text-sm font-black text-jewel-brown">오늘은 연장 운영 마지막 날입니다.</p>
              <p className="mt-1 text-xs font-bold leading-relaxed text-stone-600">
                {finalPrayerCompleted
                  ? '기도 여정을 여기서 마감하고 완주 카드를 받을 수 있어요.'
                  : '마지막 기도를 마치면 완주 카드가 열립니다.'}
              </p>
              <button
                type="button"
                onClick={() => onPrayer(finalPrayerDay)}
                className="mt-3 w-full rounded-xl bg-jewel-ink px-3 py-3 text-sm font-black text-white"
              >
                {finalPrayerCompleted ? '마무리 선택하기' : '마지막 기도하기'}
              </button>
            </div>
          )}
          {teacherFinalized && (
            <div className="mt-5 rounded-2xl border border-jewel-gold/40 bg-jewel-cream p-4">
              <p className="text-sm font-black text-jewel-brown">20일 보석기도를 마감했어요.</p>
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
              <p className="text-sm font-black text-jewel-brown">성경학교 기도 기간이 마무리되었습니다.</p>
              <p className="mt-1 text-xs font-bold leading-relaxed text-stone-600">
                남은 기간 반 아이의 기도를 이어가시겠어요? 아니면 여기서 끝내시겠어요?
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={onCollection} className="rounded-xl bg-white px-3 py-3 text-sm font-black text-jewel-brown ring-1 ring-jewel-gold/35">
                  반 아이 기도 이어가기
                </button>
                <button type="button" onClick={onFinalize} className="rounded-xl bg-jewel-ink px-3 py-3 text-sm font-black text-white">
                  여기서 끝내기
                </button>
              </div>
            </div>
          )}
          {participant.type === 'parent' && !parentCanFinalDayFinish && !parentExtensionOpen && !parentFinalized && finalDayPublished && count < PRAYER_DAYS.length && remainingPublishedDays.length > 0 && (
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
  onStateChange,
  onBack,
  onCollected,
  onReplayCollection,
}: {
  participant: Participant
  day: PrayerDay
  state: AppState
  onStateChange: (state: AppState) => void
  onBack: () => void
  onCollected: () => void | Promise<void>
  onReplayCollection: () => void | Promise<void>
}) {
  const [collecting, setCollecting] = useState(false)
  const [collectingAlreadyCollected, setCollectingAlreadyCollected] = useState(false)
  const [page, setPage] = useState<PrayerImageSlot>(1)
  const [textSize, setTextSize] = useState<PrayerTextSize>(() => {
    try {
      return localStorage.getItem('prayer-jewelry.prayerTextSize.v1') === 'large' ? 'large' : 'normal'
    } catch {
      return 'normal'
    }
  })
  const published = isPrayerOpen(day, state)
  const prayerText = getPrayerText(state, day.dayIndex)
  const prayerDeclaration = getPrayerDeclaration(state, day.dayIndex)
  const prayerRequest = getPrayerRequest(state, day.dayIndex)
  const image = getPrayerImage(state, day.dayIndex, page)
  const audio = getPrayerAudio(state, day.dayIndex)
  const count = getCompletionCount(participant.id, state)
  const isFinalDay = day.dayIndex === PRAYER_DAYS.length
  const alreadyCollected = hasCompleted(participant.id, day.dayIndex, state)

  useEffect(() => {
    setPage(1)
    setCollecting(false)
    setCollectingAlreadyCollected(false)
  }, [day.dayIndex])

  useEffect(() => {
    try {
      localStorage.setItem('prayer-jewelry.prayerTextSize.v1', textSize)
    } catch {
      // Ignore storage errors; the current screen still keeps the selected size.
    }
  }, [textSize])

  useEffect(() => {
    if (!published) return
    PRAYER_IMAGE_SLOTS.forEach((slot) => {
      const src = getPrayerImage(state, day.dayIndex, slot)
      if (!src) return
      const preload = new Image()
      preload.src = src
    })
  }, [day.dayIndex, published, state])

  async function openCollectPrompt() {
    const latestState = await loadInteractiveState()
    onStateChange(latestState)
    setCollectingAlreadyCollected(hasCompleted(participant.id, day.dayIndex, latestState))
    setCollecting(true)
  }

  return (
    <Panel wide>
      <BackButton onClick={onBack}>홈으로</BackButton>
      <PageTitle eyebrow={`${day.monthDay} · ${day.dayIndex}일차`} title={day.title} description="기도문을 따라 읽고, 말씀으로 축복하며, 기도제목을 함께 품어주세요." />
      {!published ? (
        <LockedBox day={day} />
      ) : (
        <>
          {participant.type === 'teacher' && isFinalDay && count < PRAYER_DAYS.length && (
            <div className="mx-auto mb-4 max-w-2xl rounded-2xl border border-jewel-gold/40 bg-jewel-cream p-4 text-sm font-bold leading-relaxed text-jewel-brown">
              이 기도를 마친 뒤에도 반 아이를 위한 남은 기도를 이어갈 수 있어요.
            </div>
          )}
          {alreadyCollected && (
            <div className="mx-auto mb-4 max-w-2xl rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold leading-relaxed text-emerald-800">
              이미 기도보석을 수집한 날짜입니다. 기도문은 다시 볼 수 있어요.
            </div>
          )}
          <div className="mx-auto max-w-2xl">
            {audio && <PrayerMusicControl src={audio} />}
            {page === 1 && prayerText && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/75 px-4 py-3 shadow-sm">
                <span className="text-sm font-black text-jewel-brown">글씨 크기</span>
                <div className="grid grid-cols-2 rounded-xl bg-stone-100 p-1 text-sm font-black">
                  {(['normal', 'large'] as PrayerTextSize[]).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setTextSize(size)}
                      className={`rounded-lg px-4 py-2 ${textSize === size ? 'bg-white text-jewel-ink shadow-sm' : 'text-stone-500'}`}
                      aria-pressed={textSize === size}
                    >
                      {size === 'normal' ? '보통' : '크게'}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
              {page === 1 && prayerText ? (
                <PrayerTextPage day={day} text={prayerText} size={textSize} />
              ) : page === 2 && prayerDeclaration ? (
                <PrayerDeclarationPage declaration={prayerDeclaration} />
              ) : page === 3 && prayerRequest ? (
                <PrayerRequestPage prayerRequest={prayerRequest} />
              ) : image ? (
                <img src={image} alt={`${day.monthDay} ${slotLabel(page)}`} loading="eager" decoding="async" className="h-auto w-full object-contain" />
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
                  onClick={openCollectPrompt}
                  className="rounded-2xl bg-jewel-ink px-5 py-4 text-sm font-black text-white shadow-card"
                >
                  확인
                </button>
              )}
            </div>
          </div>
        </>
      )}
      {collecting && (
        <CollectModal
          day={day}
          alreadyCollected={alreadyCollected || collectingAlreadyCollected}
          onHome={() => {
            setCollecting(false)
            setCollectingAlreadyCollected(false)
            onBack()
          }}
          onCancel={() => {
            setCollecting(false)
            setCollectingAlreadyCollected(false)
          }}
          onCollect={async () => {
            const latestState = await loadInteractiveState()
            if (hasCompleted(participant.id, day.dayIndex, latestState)) {
              onStateChange(latestState)
              setCollecting(false)
              setCollectingAlreadyCollected(false)
              await onReplayCollection()
              return
            }
            await completePrayerDay(participant.id, day.dayIndex)
            setCollecting(false)
            setCollectingAlreadyCollected(false)
            await onCollected()
          }}
        />
      )}
    </Panel>
  )
}

function PrayerTextPage({ day, text, size }: { day: PrayerDay; text: string; size: PrayerTextSize }) {
  return (
    <article className={`prayer-text-page ${size === 'large' ? 'prayer-text-page--large' : ''}`}>
      <div className="prayer-text-header">
        <span>{day.dayIndex}일차 기도문</span>
      </div>
      <div className="prayer-text-body">
        {text.split(/\n{2,}/).map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </article>
  )
}

function PrayerDeclarationPage({ declaration }: { declaration: PrayerDeclaration }) {
  return (
    <article className="prayer-declaration-page">
      <div className="prayer-declaration-inner">
        <header className="prayer-declaration-title">
          <p>말씀으로 축복하기</p>
          <h2>{declaration.title || '선포 기도문'}</h2>
          <div className="prayer-declaration-leaf">♥</div>
        </header>

        <section className="prayer-declaration-scripture">
          <p>{declaration.scripture}</p>
          {declaration.reference && <span>({declaration.reference})</span>}
        </section>

        <div className="prayer-declaration-divider">♥</div>

        <section className="prayer-declaration-tip">
          <h3>선포 기도 안내</h3>
          <p>{declaration.tip}</p>
          <div>✦ ♥ ✦</div>
        </section>
      </div>
    </article>
  )
}

function PrayerRequestPage({ prayerRequest }: { prayerRequest: PrayerRequest }) {
  return (
    <article className="prayer-request-page">
      <div className="prayer-request-inner">
        <header className="prayer-request-title">
          <p>함께 품고 기도해요</p>
          <h2>{prayerRequest.title || '1분 기도요청'}</h2>
          <div className="prayer-request-leaf">♥</div>
        </header>

        <section className="prayer-request-box">
          <p>{prayerRequest.body}</p>
        </section>

        <footer className="prayer-request-footer">
          <span>주님, 우리의 작은 기도를 기억해 주세요.</span>
          <div>✦ ♥ ✦</div>
        </footer>
      </div>
    </article>
  )
}

function PrayerMusicControl({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(0.5)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPlaying(false)
    setError(null)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current.volume = volume
    }
  }, [src])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  async function toggle() {
    const audio = audioRef.current
    if (!audio) return
    setError(null)

    if (playing) {
      audio.pause()
      setPlaying(false)
      return
    }

    try {
      await audio.play()
      setPlaying(true)
    } catch {
      setError('재생이 막혔어요. 외부 브라우저에서 다시 열어주세요.')
      setPlaying(false)
    }
  }

  return (
    <div className="mb-3 rounded-2xl border border-jewel-gold/25 bg-jewel-cream/80 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <Music2 size={18} className="shrink-0 text-jewel-brown" />
        <button
          type="button"
          onClick={toggle}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-jewel-ink px-4 py-3 text-sm font-black text-white shadow-sm"
        >
          {playing ? <Pause size={17} /> : <Play size={17} />}
          {playing ? '기도음악 끄기' : '기도음악 켜기'}
        </button>
      </div>
      <label className="mt-3 flex items-center gap-3 text-xs font-black text-jewel-brown">
        <span className="shrink-0">음량</span>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(volume * 100)}
          onChange={(event) => setVolume(Number(event.target.value) / 100)}
          className="music-volume-slider"
          aria-label="기도음악 음량"
        />
        <span className="w-9 text-right">{Math.round(volume * 100)}%</span>
      </label>
      {error && <p className="mt-2 text-xs font-bold text-red-700">{error}</p>}
      <audio
        ref={audioRef}
        src={src}
        loop
        preload="none"
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
    </div>
  )
}

function CollectionScreen({
  participant,
  state,
  onBack,
  onOpenPrayer,
  onToast,
  highlightDayIndex,
  completionCelebrating,
}: {
  participant: Participant
  state: AppState
  onBack: () => void
  onOpenPrayer: (day: PrayerDay) => void
  onToast: (message: string) => void
  highlightDayIndex: number | null
  completionCelebrating?: boolean
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
      <div className={`board-wrap ${isAllGemPreview() ? 'board-wrap-preview' : ''} ${completionCelebrating ? 'board-wrap-complete-celebration' : ''}`}>
        <img src={ASSETS.gemBoard} alt="" className="board-bg" loading="eager" decoding="async" />
        <div className="gem-grid">
          {PRAYER_DAYS.map((day) => {
            const done = hasCompleted(participant.id, day.dayIndex, state) || isAllGemPreview()
            const published = isPrayerOpen(day, state)
            const position = GEM_SLOT_POSITIONS[day.dayIndex - 1]
            return (
              <button
                key={day.dayIndex}
                type="button"
                style={{ left: `${position.x}%`, top: `${position.y}%` }}
                onClick={() => {
                  if (done) onToast(`${day.monthDay} 기도보석을 이미 수집했어요.`)
                  else if (published) onOpenPrayer(day)
                  else onToast(getPrayerLockedMessage(day))
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
  const days = PRAYER_DAYS.filter((day) => isPrayerOpen(day, state))
  return (
    <Panel>
      <BackButton onClick={onBack}>홈으로</BackButton>
      <PageTitle eyebrow={participant.displayName} title="전체 기도문 보기" description="오늘과 과거에 공개된 기도문만 볼 수 있어요." />
      {days.length === 0 ? (
        <LockedBox day={getCurrentPrayerDay()} />
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
  const parentCanSeeCard = participant.type === 'parent' && (count === PRAYER_DAYS.length || hasFinalizedChallenge(participant.id, state))

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
        eyebrow={teacherCanSeeCard && count < PRAYER_DAYS.length ? '기도 마감' : '완주 축하'}
        title={count === 20 ? '기도보석을 모두 모았어요' : teacherCanSeeCard || parentCanSeeCard ? '20일 보석기도를 마감했어요' : '아직 모으는 중이에요'}
        description={`${count}/20개의 기도보석을 수집했습니다.`}
      />
      {count < 20 && !teacherCanSeeCard && !parentCanSeeCard ? (
        <div className="rounded-2xl bg-white p-6 text-center shadow-card">20개를 모두 모으면 완주 카드가 열립니다.</div>
      ) : teacherCanSeeCard ? (
        <div className="text-center">
          <div className="completion-card-scan-stage">
            <div className="completion-card-scan-window">
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
            </div>
            <div className="completion-card-scan-laser" />
          </div>
          <PrimaryButton className="mt-5" onClick={share} disabled={busy}>
            {busy ? '이미지 만드는 중...' : '카톡으로 공유하기'}
          </PrimaryButton>
        </div>
      ) : (
        <div className="text-center">
          <div className="completion-card-scan-stage">
            <div className="completion-card-scan-window">
              <div className="parent-completion-card shadow-card">
                <img src={ASSETS.parentCardTemplate} alt="" className="parent-completion-template" />
                <p className="parent-completion-message">보석보다 귀한 어린이 {participant.displayName}<br />20일 보석기도 완주를 축하합니다☺️♥️</p>
              </div>
            </div>
            <div className="completion-card-scan-laser" />
          </div>
          <PrimaryButton className="mt-5" onClick={share} disabled={busy}>
            {busy ? '이미지 만드는 중...' : '카톡으로 담임선생님께 알리기'}
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
  const [backupStatus, setBackupStatus] = useState<'idle' | 'running' | 'error'>('idle')
  const parentParticipants = state.participants.filter(
    (participant) => participant.type === 'parent' && !HIDDEN_ADMIN_PARENT_NAMES.has(participant.displayName),
  )
  const teacherParticipants = state.participants.filter((participant) => participant.type === 'teacher')
  const customParents = parentParticipants.filter((participant) => participant.source === 'custom')
  const parentFinishers = parentParticipants.filter(
    (participant) => getCompletionCount(participant.id, state) === 20 || hasFinalizedChallenge(participant.id, state),
  )
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
        <PageTitle eyebrow="숨긴 관리자" title="관리자 비밀번호" description="관리자만 20일 보석기도 현황을 확인할 수 있어요." />
        <input value={code} onChange={(event) => setCode(event.target.value)} type="password" className="field" placeholder="비밀번호" />
        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
        <PrimaryButton onClick={unlock}>관리자 열기</PrimaryButton>
      </Panel>
    )
  }

  return (
    <Panel wide>
      <BackButton onClick={onBack}>돌아가기</BackButton>
      <PageTitle eyebrow="관리자" title="20일 보석기도 현황" description="부모와 교사 통계를 분리해서 확인합니다." />
      <button
        type="button"
        onClick={async () => {
          try {
            setBackupStatus('running')
            await downloadAdminBackup(state, backupSummary)
            setBackupStatus('idle')
          } catch {
            setBackupStatus('error')
          }
        }}
        disabled={backupStatus === 'running'}
        className="flex items-center justify-center gap-2 rounded-2xl bg-jewel-ink px-5 py-4 text-sm font-black text-white shadow-card transition hover:bg-jewel-brown"
      >
        <Download size={18} />
        {backupStatus === 'running' ? '백업 파일 만드는 중...' : '참여 기록·기도자료 전체 백업 다운로드'}
      </button>
      {backupStatus === 'error' && (
        <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          백업 파일을 만드는 중 문제가 생겼어요. 인터넷 연결을 확인하고 다시 눌러 주세요.
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <AdminTable
          title="부모 현황"
          participants={parentParticipants}
          state={state}
          collapsed
          groupByClass
          summaryLabel={`${parentParticipants.length}명`}
          detailLabel={`완주 ${parentFinishers.length}명`}
        />
        <AdminTable
          title="교사 현황"
          participants={teacherParticipants}
          state={state}
          collapsed
          summaryLabel={`${teacherParticipants.length}/${TEACHERS.length}명`}
          detailLabel={`완주 ${teacherFinishers.length}명`}
        />
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

async function downloadAdminBackup(
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
  const prayerMaterials = buildPrayerMaterialsBackup(state)
  const backup = {
    app: APP_TITLE,
    organization: ORG_LABEL,
    exportedAt: createdAt.toISOString(),
    summary,
    prayerMaterials,
    participants: state.participants,
    completions: state.completions,
    challengeClosures: state.challengeClosures,
    prayerTexts: state.prayerTexts,
    prayerImages: state.prayerImages,
    prayerAudio: state.prayerAudio,
  }
  const files = await buildBackupZipFiles(backup, prayerMaterials)
  const blob = createZipBlob(files)
  downloadBlob(blob, `jewelry-prayer-full-backup-${dateKey}.zip`)
}

type BackupFile = {
  path: string
  data: Uint8Array
}

type PrayerMaterialBackup = {
  dayIndex: number
  date: string
  monthDay: string
  title: string
  prayerText: string
  declaration: PrayerDeclaration | null
  prayerRequest: PrayerRequest | null
  images: Record<string, string | null>
  audio: string | null
}

function buildPrayerMaterialsBackup(state: AppState): PrayerMaterialBackup[] {
  return PRAYER_DAYS.map((day) => {
    const images = Object.fromEntries(
      PRAYER_IMAGE_SLOTS.map((slot) => [String(slot), getPrayerImage(state, day.dayIndex, slot)]),
    ) as Record<string, string | null>

    return {
      dayIndex: day.dayIndex,
      date: day.date,
      monthDay: day.monthDay,
      title: day.title,
      prayerText: getPrayerText(state, day.dayIndex),
      declaration: getPrayerDeclaration(state, day.dayIndex),
      prayerRequest: getPrayerRequest(state, day.dayIndex),
      images,
      audio: getPrayerAudio(state, day.dayIndex),
    }
  })
}

async function buildBackupZipFiles(backup: unknown, prayerMaterials: PrayerMaterialBackup[]) {
  const files: BackupFile[] = [
    textBackupFile('backup.json', JSON.stringify(backup, null, 2)),
    textBackupFile('기도자료-목록.csv', `\ufeff${buildPrayerMaterialsCsv(prayerMaterials)}`),
  ]
  const failedResources: string[] = []

  for (const material of prayerMaterials) {
    const dayFolder = `기도자료/day-${String(material.dayIndex).padStart(2, '0')}`
    if (material.prayerText.trim()) {
      files.push(textBackupFile(`${dayFolder}/01-기도문.txt`, material.prayerText))
    }
    if (material.declaration) {
      files.push(textBackupFile(`${dayFolder}/02-선포기도문.json`, JSON.stringify(material.declaration, null, 2)))
      files.push(
        textBackupFile(
          `${dayFolder}/02-선포기도문.txt`,
          [
            material.declaration.title,
            '',
            material.declaration.scripture,
            material.declaration.reference ? `(${material.declaration.reference})` : '',
            '',
            material.declaration.tip,
          ]
            .filter(Boolean)
            .join('\n'),
        ),
      )
    }
    if (material.prayerRequest) {
      files.push(textBackupFile(`${dayFolder}/03-기도제목.json`, JSON.stringify(material.prayerRequest, null, 2)))
      files.push(textBackupFile(`${dayFolder}/03-기도제목.txt`, `${material.prayerRequest.title}\n\n${material.prayerRequest.body}`))
    }

    for (const slot of PRAYER_IMAGE_SLOTS) {
      const url = material.images[String(slot)]
      if (!url) continue
      try {
        const fetched = await fetchBackupResource(url, `page-${slot}`)
        files.push({
          path: `${dayFolder}/${String(slot).padStart(2, '0')}-${getPrayerSlotBackupLabel(slot)}.${fetched.extension}`,
          data: fetched.data,
        })
      } catch {
        failedResources.push(`${material.dayIndex}일차 ${slot}페이지: ${url}`)
      }
    }

    if (material.audio) {
      try {
        const fetched = await fetchBackupResource(material.audio, 'music')
        files.push({
          path: `${dayFolder}/기도음악.${fetched.extension}`,
          data: fetched.data,
        })
      } catch {
        failedResources.push(`${material.dayIndex}일차 기도음악: ${material.audio}`)
      }
    }
  }

  if (failedResources.length > 0) {
    files.push(textBackupFile('다운로드-실패-목록.txt', failedResources.join('\n')))
  }

  return files
}

function buildPrayerMaterialsCsv(prayerMaterials: PrayerMaterialBackup[]) {
  const rows = [
    ['일차', '날짜', '제목', '기도문 텍스트 있음', '선포기도문 있음', '기도제목 있음', '1페이지 이미지', '2페이지 이미지', '3페이지 이미지', '기도음악'],
    ...prayerMaterials.map((material) => [
      String(material.dayIndex),
      material.monthDay,
      material.title,
      material.prayerText.trim() ? '있음' : '없음',
      material.declaration ? '있음' : '없음',
      material.prayerRequest ? '있음' : '없음',
      material.images['1'] ?? '',
      material.images['2'] ?? '',
      material.images['3'] ?? '',
      material.audio ?? '',
    ]),
  ]

  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')
}

function escapeCsvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

function getPrayerSlotBackupLabel(slot: PrayerImageSlot) {
  if (slot === 1) return '기도문-이미지'
  if (slot === 2) return '선포기도'
  return '기도제목'
}

function textBackupFile(path: string, value: string): BackupFile {
  return {
    path,
    data: new TextEncoder().encode(value),
  }
}

async function fetchBackupResource(url: string, fallbackName: string) {
  if (url.startsWith('data:')) {
    const [header, base64Data = ''] = url.split(',')
    const mimeType = header.match(/^data:([^;]+)/)?.[1] ?? ''
    const binary = atob(base64Data)
    const data = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) data[index] = binary.charCodeAt(index)
    return { data, extension: getBackupFileExtension(url, mimeType, fallbackName) }
  }

  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Failed to fetch backup resource: ${url}`)
  const data = new Uint8Array(await response.arrayBuffer())
  return { data, extension: getBackupFileExtension(url, response.headers.get('content-type') ?? '', fallbackName) }
}

function getBackupFileExtension(url: string, mimeType: string, fallbackName: string) {
  const cleanUrl = url.split('?')[0] ?? ''
  const extension = cleanUrl.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase()
  if (extension) return extension
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('mpeg')) return 'mp3'
  if (mimeType.includes('mp4')) return 'm4a'
  if (mimeType.includes('wav')) return 'wav'
  return fallbackName === 'music' ? 'mp3' : 'bin'
}

function createZipBlob(files: BackupFile[]) {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const fileName = new TextEncoder().encode(file.path)
    const crc = crc32(file.data)
    const localHeader = new Uint8Array(30 + fileName.length)
    const localView = new DataView(localHeader.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0x0800, true)
    localView.setUint16(8, 0, true)
    localView.setUint32(14, crc, true)
    localView.setUint32(18, file.data.length, true)
    localView.setUint32(22, file.data.length, true)
    localView.setUint16(26, fileName.length, true)
    localHeader.set(fileName, 30)
    localParts.push(localHeader, file.data)

    const centralHeader = new Uint8Array(46 + fileName.length)
    const centralView = new DataView(centralHeader.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0x0800, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint32(16, crc, true)
    centralView.setUint32(20, file.data.length, true)
    centralView.setUint32(24, file.data.length, true)
    centralView.setUint16(28, fileName.length, true)
    centralView.setUint32(42, offset, true)
    centralHeader.set(fileName, 46)
    centralParts.push(centralHeader)

    offset += localHeader.length + file.data.length
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const endHeader = new Uint8Array(22)
  const endView = new DataView(endHeader.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, files.length, true)
  endView.setUint16(10, files.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)

  return new Blob([...localParts, ...centralParts, endHeader], { type: 'application/zip' })
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function AdminPrayerUpload({ state, today, onRefresh }: { state: AppState; today: PrayerDay; onRefresh: () => void }) {
  const [message, setMessage] = useState<string | null>(null)
  const [uploadUnlocked, setUploadUnlocked] = useState(false)
  const [uploadCode, setUploadCode] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const waitingDay = PRAYER_DAYS.find((day) => {
    const hasFirstPage = Boolean(getPrayerText(state, day.dayIndex) || getPrayerImage(state, day.dayIndex, 1))
    const hasSecondPage = Boolean(getPrayerDeclaration(state, day.dayIndex) || getPrayerImage(state, day.dayIndex, 2))
    const hasThirdPage = Boolean(getPrayerRequest(state, day.dayIndex) || getPrayerImage(state, day.dayIndex, 3))
    return !(hasFirstPage && hasSecondPage && hasThirdPage)
  })
  const waitingLabel = waitingDay ? `${waitingDay.dayIndex}일차 기도문 대기중` : '기도문 준비 완료'

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

  async function uploadAudio(dayIndex: number, file: File | undefined) {
    if (!file) return
    try {
      await savePrayerAudio(dayIndex, file)
      setMessage(`${dayIndex}일차 기도음악을 저장했어요.`)
      onRefresh()
    } catch {
      setMessage('기도음악 업로드에 실패했어요. 파일 형식과 인터넷 연결을 확인한 뒤 다시 시도해 주세요.')
    }
  }

  async function saveText(dayIndex: number, body: string) {
    try {
      await savePrayerText(dayIndex, body)
      setMessage(`${dayIndex}일차 기도문 텍스트를 저장했어요.`)
      onRefresh()
    } catch (error) {
      console.error(error)
      setMessage('기도문 텍스트 저장에 실패했어요. 잠시 후 다시 시도해 주세요.')
      throw error
    }
  }

  async function saveDeclaration(dayIndex: number, declaration: PrayerDeclaration) {
    try {
      await savePrayerDeclaration(dayIndex, declaration)
      setMessage(`${dayIndex}일차 선포기도문을 저장했어요.`)
      onRefresh()
    } catch (error) {
      console.error(error)
      setMessage('선포기도문 저장에 실패했어요. 잠시 후 다시 시도해 주세요.')
      throw error
    }
  }

  async function saveRequest(dayIndex: number, prayerRequest: PrayerRequest) {
    try {
      await savePrayerRequest(dayIndex, prayerRequest)
      setMessage(`${dayIndex}일차 기도제목을 저장했어요.`)
      onRefresh()
    } catch (error) {
      console.error(error)
      setMessage('기도제목 저장에 실패했어요. 잠시 후 다시 시도해 주세요.')
      throw error
    }
  }

  function unlockUploads() {
    if (uploadCode.trim() === '1111') {
      setUploadUnlocked(true)
      setUploadError(null)
      return
    }
    setUploadError('업로드 비밀번호를 확인해 주세요.')
  }

  return (
    <details className="rounded-3xl border border-white/80 bg-white/75 p-4 shadow-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">기도문, 배경 음악 관리</h3>
          <p className="text-xs font-bold text-stone-500">Supabase Storage에 저장됩니다. 오늘 기준: {today.monthDay}</p>
        </div>
        <span className="shrink-0 rounded-full bg-jewel-cream px-3 py-1 text-xs font-black text-jewel-brown">{waitingLabel}</span>
      </summary>
      {message && <p className="mt-3 rounded-xl bg-jewel-cream px-3 py-2 text-sm font-bold text-jewel-brown">{message}</p>}
      {!uploadUnlocked ? (
        <div className="mt-4 rounded-2xl border border-jewel-gold/30 bg-white p-4">
          <p className="text-sm font-black text-jewel-brown">기도문과 배경 음악 업로드는 추가 비밀번호가 필요합니다.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              value={uploadCode}
              onChange={(event) => setUploadCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') unlockUploads()
              }}
              type="password"
              inputMode="numeric"
              className="field"
              placeholder="업로드 비밀번호"
            />
            <button type="button" onClick={unlockUploads} className="rounded-xl bg-jewel-ink px-4 py-3 text-sm font-black text-white">
              업로드 열기
            </button>
          </div>
          {uploadError && <p className="mt-2 text-xs font-black text-red-700">{uploadError}</p>}
        </div>
      ) : (
      <div className="mt-4 grid gap-2">
        {PRAYER_DAYS.map((day) => {
          const slots = PRAYER_IMAGE_SLOTS
          const uploaded = slots.filter((slot) => getPrayerImage(state, day.dayIndex, slot)).length
          const hasAudio = Boolean(getPrayerAudio(state, day.dayIndex))
          const hasText = Boolean(getPrayerText(state, day.dayIndex))
          const hasDeclaration = Boolean(getPrayerDeclaration(state, day.dayIndex))
          const hasRequest = Boolean(getPrayerRequest(state, day.dayIndex))
          return (
            <details key={day.dayIndex} className="rounded-2xl border border-stone-200 bg-white p-3">
              <summary className="cursor-pointer text-sm font-black">
                {day.monthDay} · {day.dayIndex}일차 <span className="text-jewel-brown">텍스트 {hasText ? '있음' : '없음'} · 선포 {hasDeclaration ? '있음' : '없음'} · 기도제목 {hasRequest ? '있음' : '없음'} · 이미지 {uploaded}/{PRAYER_IMAGE_SLOTS.length} · 음악 {hasAudio ? '있음' : '없음'}</span>
              </summary>
              <AdminPrayerTextEditor
                initialText={getPrayerText(state, day.dayIndex)}
                onSave={(body) => saveText(day.dayIndex, body)}
              />
              <AdminPrayerDeclarationEditor
                initialDeclaration={getPrayerDeclaration(state, day.dayIndex)}
                onSave={(declaration) => saveDeclaration(day.dayIndex, declaration)}
              />
              <AdminPrayerRequestEditor
                initialRequest={getPrayerRequest(state, day.dayIndex)}
                onSave={(prayerRequest) => saveRequest(day.dayIndex, prayerRequest)}
              />
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {slots.map((slot) => (
                  <label key={slot} className="rounded-xl bg-stone-50 p-3 text-xs font-bold text-stone-600">
                    {slotLabel(slot)}
                    <input type="file" accept="image/png,image/jpeg" className="mt-2 block w-full text-xs" onChange={(event) => upload(day.dayIndex, slot, event.target.files?.[0])} />
                  </label>
                ))}
              </div>
              <label className="mt-2 block rounded-xl bg-jewel-cream p-3 text-xs font-bold text-jewel-brown">
                기도음악
                <input type="file" accept="audio/mpeg,audio/mp3,audio/mp4,audio/aac,audio/wav,audio/x-wav" className="mt-2 block w-full text-xs" onChange={(event) => uploadAudio(day.dayIndex, event.target.files?.[0])} />
              </label>
            </details>
          )
        })}
      </div>
      )}
    </details>
  )
}

function AdminPrayerTextEditor({
  initialText,
  onSave,
}: {
  initialText: string
  onSave: (body: string) => void | Promise<void>
}) {
  const [body, setBody] = useState(initialText)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const characterCount = body.length
  const characterCountWithoutSpaces = body.replace(/\s/g, '').length

  useEffect(() => {
    setBody(initialText)
    setStatus('idle')
  }, [initialText])

  async function handleSave() {
    setStatus('saving')
    try {
      await onSave(body)
      setStatus('saved')
    } catch {
      setStatus('failed')
    }
  }

  return (
    <div className="mt-3 rounded-xl bg-jewel-cream/70 p-3">
      <label className="text-xs font-black text-jewel-brown">
        1페이지 기도문 텍스트
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={8}
          className="mt-2 block w-full resize-y rounded-xl border border-jewel-gold/25 bg-white px-3 py-2 text-sm font-semibold leading-relaxed text-stone-800 outline-none focus:border-jewel-gold"
          placeholder="여기에 1페이지 기도문을 입력하세요. 문단을 나누려면 한 줄을 비워 주세요."
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-2 text-xs font-black text-jewel-brown/80">
        <span className="rounded-full bg-white px-3 py-1 shadow-sm">공백 포함 {characterCount.toLocaleString()}자</span>
        <span className="rounded-full bg-white px-3 py-1 shadow-sm">공백 제외 {characterCountWithoutSpaces.toLocaleString()}자</span>
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={status === 'saving'}
        className="mt-2 rounded-xl bg-jewel-ink px-4 py-2 text-xs font-black text-white"
      >
        {status === 'saving' ? '저장 중...' : '기도문 텍스트 저장'}
      </button>
      {status === 'saved' && <p className="mt-2 text-xs font-black text-jewel-brown">저장했어요. 1페이지에 텍스트 기도문이 표시됩니다.</p>}
      {status === 'failed' && <p className="mt-2 text-xs font-black text-red-700">저장에 실패했어요. 잠시 후 다시 눌러 주세요.</p>}
    </div>
  )
}

const DEFAULT_PRAYER_DECLARATION: PrayerDeclaration = {
  title: '선포 기도문',
  scripture: '',
  reference: '',
  tip: '“너/네” 대신 자녀의 이름을 넣어\n5번 선포해보세요.',
}

function AdminPrayerDeclarationEditor({
  initialDeclaration,
  onSave,
}: {
  initialDeclaration: PrayerDeclaration | null
  onSave: (declaration: PrayerDeclaration) => void | Promise<void>
}) {
  const [declaration, setDeclaration] = useState<PrayerDeclaration>(initialDeclaration ?? DEFAULT_PRAYER_DECLARATION)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const totalCount = declaration.scripture.length + declaration.tip.length

  useEffect(() => {
    setDeclaration(initialDeclaration ?? DEFAULT_PRAYER_DECLARATION)
    setStatus('idle')
  }, [initialDeclaration])

  function updateDeclaration(field: keyof PrayerDeclaration, value: string) {
    setDeclaration((current) => ({ ...current, [field]: value }))
    setStatus('idle')
  }

  async function handleSave() {
    setStatus('saving')
    try {
      await onSave(declaration)
      setStatus('saved')
    } catch {
      setStatus('failed')
    }
  }

  return (
    <div className="mt-3 rounded-xl bg-purple-50/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-black text-jewel-brown">2페이지 선포기도문</h4>
          <p className="mt-1 text-xs font-bold text-stone-500">저장하면 2페이지 이미지 대신 카드 디자인으로 표시됩니다.</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-jewel-brown shadow-sm">
          본문 {totalCount.toLocaleString()}자
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr]">
        <label className="text-xs font-black text-jewel-brown">
          제목
          <input
            value={declaration.title}
            onChange={(event) => updateDeclaration('title', event.target.value)}
            className="field mt-2"
            placeholder="선포 기도문"
          />
        </label>
        <label className="text-xs font-black text-jewel-brown">
          성경구절 위치
          <input
            value={declaration.reference}
            onChange={(event) => updateDeclaration('reference', event.target.value)}
            className="field mt-2"
            placeholder="시편 121편 7절"
          />
        </label>
      </div>

      <label className="mt-3 block text-xs font-black text-jewel-brown">
        성경구절
        <textarea
          value={declaration.scripture}
          onChange={(event) => updateDeclaration('scripture', event.target.value)}
          rows={4}
          className="mt-2 block w-full resize-y rounded-xl border border-jewel-gold/25 bg-white px-3 py-2 text-sm font-semibold leading-relaxed text-stone-800 outline-none focus:border-jewel-gold"
          placeholder="성경구절을 입력하세요."
        />
      </label>

      <label className="mt-3 block text-xs font-black text-jewel-brown">
        선포기도 팁
        <textarea
          value={declaration.tip}
          onChange={(event) => updateDeclaration('tip', event.target.value)}
          rows={5}
          className="mt-2 block w-full resize-y rounded-xl border border-jewel-gold/25 bg-white px-3 py-2 text-sm font-semibold leading-relaxed text-stone-800 outline-none focus:border-jewel-gold"
          placeholder="선포기도 안내 문구를 입력하세요."
        />
      </label>

      <button
        type="button"
        onClick={handleSave}
        disabled={status === 'saving'}
        className="mt-2 rounded-xl bg-jewel-ink px-4 py-2 text-xs font-black text-white"
      >
        {status === 'saving' ? '저장 중...' : '선포기도문 저장'}
      </button>
      {status === 'saved' && <p className="mt-2 text-xs font-black text-jewel-brown">저장했어요. 2페이지에 선포기도문 카드가 표시됩니다.</p>}
      {status === 'failed' && <p className="mt-2 text-xs font-black text-red-700">저장에 실패했어요. 잠시 후 다시 눌러 주세요.</p>}
    </div>
  )
}

const DEFAULT_PRAYER_REQUEST: PrayerRequest = {
  title: '1분 기도요청',
  body: '',
}

function AdminPrayerRequestEditor({
  initialRequest,
  onSave,
}: {
  initialRequest: PrayerRequest | null
  onSave: (prayerRequest: PrayerRequest) => void | Promise<void>
}) {
  const [prayerRequest, setPrayerRequest] = useState<PrayerRequest>(initialRequest ?? DEFAULT_PRAYER_REQUEST)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')

  useEffect(() => {
    setPrayerRequest(initialRequest ?? DEFAULT_PRAYER_REQUEST)
    setStatus('idle')
  }, [initialRequest])

  function updateRequest(field: keyof PrayerRequest, value: string) {
    setPrayerRequest((current) => ({ ...current, [field]: value }))
    setStatus('idle')
  }

  async function handleSave() {
    setStatus('saving')
    try {
      await onSave(prayerRequest)
      setStatus('saved')
    } catch {
      setStatus('failed')
    }
  }

  return (
    <div className="mt-3 rounded-xl bg-amber-50/80 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-black text-jewel-brown">3페이지 기도제목</h4>
          <p className="mt-1 text-xs font-bold text-stone-500">저장하면 3페이지 이미지 대신 기도제목 카드가 표시됩니다.</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-jewel-brown shadow-sm">
          내용 {prayerRequest.body.length.toLocaleString()}자
        </span>
      </div>

      <label className="mt-3 block text-xs font-black text-jewel-brown">
        제목
        <input
          value={prayerRequest.title}
          onChange={(event) => updateRequest('title', event.target.value)}
          className="field mt-2"
          placeholder="1분 기도요청"
        />
      </label>

      <label className="mt-3 block text-xs font-black text-jewel-brown">
        내용
        <textarea
          value={prayerRequest.body}
          onChange={(event) => updateRequest('body', event.target.value)}
          rows={6}
          className="mt-2 block w-full resize-y rounded-xl border border-jewel-gold/25 bg-white px-3 py-2 text-sm font-semibold leading-relaxed text-stone-800 outline-none focus:border-jewel-gold"
          placeholder="기도제목을 입력하세요."
        />
      </label>

      <button
        type="button"
        onClick={handleSave}
        disabled={status === 'saving'}
        className="mt-2 rounded-xl bg-jewel-ink px-4 py-2 text-xs font-black text-white"
      >
        {status === 'saving' ? '저장 중...' : '기도제목 저장'}
      </button>
      {status === 'saved' && <p className="mt-2 text-xs font-black text-jewel-brown">저장했어요. 3페이지에 기도제목 카드가 표시됩니다.</p>}
      {status === 'failed' && <p className="mt-2 text-xs font-black text-red-700">저장에 실패했어요. 잠시 후 다시 눌러 주세요.</p>}
    </div>
  )
}

function AdminTable({
  title,
  participants,
  state,
  collapsed = false,
  groupByClass = false,
  summaryLabel,
  detailLabel,
}: {
  title: string
  participants: Participant[]
  state: AppState
  collapsed?: boolean
  groupByClass?: boolean
  summaryLabel?: string
  detailLabel?: string
}) {
  const [selectedClass, setSelectedClass] = useState('전체')
  const classOptions = useMemo(() => {
    if (!groupByClass) return []
    const registered = CLASSES.filter((className) =>
      participants.some((participant) => getParticipantClassNames(participant).includes(className)),
    )
    const hasCustom = participants.some((participant) => getParticipantClassNames(participant).includes('명단 외'))
    return ['전체', ...registered, ...(hasCustom ? ['명단 외'] : [])]
  }, [groupByClass, participants])
  const visibleParticipants =
    groupByClass && selectedClass !== '전체'
      ? participants.filter((participant) => getParticipantClassNames(participant).includes(selectedClass))
      : participants

  const content = (
    <>
      {detailLabel && <p className="mt-3 rounded-xl bg-jewel-cream px-3 py-2 text-sm font-black text-jewel-brown">{detailLabel}</p>}
      {groupByClass && classOptions.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {classOptions.map((className) => (
            <button
              key={className}
              type="button"
              onClick={() => setSelectedClass(className)}
              className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
                selectedClass === className ? 'bg-jewel-ink text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'
              }`}
            >
              {className}
              <span className="ml-1 opacity-75">
                {className === '전체'
                  ? participants.length
                  : participants.filter((participant) => getParticipantClassNames(participant).includes(className)).length}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 grid gap-2">
        {visibleParticipants.length === 0 ? (
          <p className="rounded-xl bg-stone-50 p-4 text-sm font-bold text-stone-500">아직 참여자가 없어요.</p>
        ) : (
          visibleParticipants.map((participant) => {
            const count = getCompletionCount(participant.id, state)
            const classLabel = getParticipantClassNames(participant).join(', ')
            return (
              <div key={participant.id} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-stone-200">
                <span>
                  <span className="block text-sm font-black">{participant.displayName}</span>
                  <span className="block text-xs font-bold text-stone-500">
                    {participant.type === 'teacher' ? '교사' : classLabel}
                  </span>
                </span>
                <span className="rounded-full bg-jewel-cream px-3 py-1 text-sm font-black text-jewel-brown">{count}/20</span>
              </div>
            )
          })
        )}
      </div>
    </>
  )

  if (collapsed) {
    return (
      <details className="rounded-3xl border border-white/80 bg-white/75 p-4 shadow-card">
        <summary className="cursor-pointer list-none">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-black">{title}</h3>
            <span className="rounded-full bg-jewel-ink px-3 py-1 text-xs font-black text-white">열어보기</span>
          </div>
          {summaryLabel && <p className="mt-1 text-2xl font-black text-jewel-ink">{summaryLabel}</p>}
        </summary>
        {content}
      </details>
    )
  }

  return (
    <div className="rounded-3xl border border-white/80 bg-white/75 p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-black">{title}</h3>
        {summaryLabel && <span className="rounded-full bg-jewel-cream px-3 py-1 text-sm font-black text-jewel-brown">{summaryLabel}</span>}
      </div>
      {content}
    </div>
  )
}

function getParticipantClassNames(participant: Participant) {
  const classNames = participant.children
    ?.map((child) => child.className)
    .filter((className): className is string => Boolean(className))

  if (classNames?.length) return [...new Set(classNames)]
  return ['명단 외']
}

function isPrayerOpen(day: PrayerDay, state: AppState) {
  if (isPublished(day)) return true
  if (day.date > getVisibleDateKey()) return false
  return hasPrayerFirstPage(state, day)
}

function getPrayerLockedMessage(day: PrayerDay) {
  return isSundayPrayer(day)
    ? '주일 기도문은 주일 예배가 끝난 뒤 오후에 열립니다.'
    : '기도문은 매일 아침 7시에 열려요.'
}

function isSundayPrayer(day: PrayerDay) {
  return new Date(`${day.date}T12:00:00+09:00`).getDay() === 0
}

function hasPrayerFirstPage(state: AppState, day: PrayerDay) {
  return Boolean(getPrayerText(state, day.dayIndex).trim() || getPrayerImage(state, day.dayIndex, 1))
}

function getVisibleDateKey() {
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const previewDate = new URLSearchParams(window.location.search).get('previewDate')
    if (previewDate && /^\d{4}-\d{2}-\d{2}$/.test(previewDate)) return previewDate
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function isOnOrAfterVisibleDate(dateKey: string) {
  return getVisibleDateKey() >= dateKey
}

function isWithinVisibleDateRange(startKey: string, endKey: string) {
  const dateKey = getVisibleDateKey()
  return dateKey >= startKey && dateKey <= endKey
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

function CollectModal({
  day,
  alreadyCollected,
  onHome,
  onCancel,
  onCollect,
}: {
  day: PrayerDay
  alreadyCollected: boolean
  onHome: () => void
  onCancel: () => void
  onCollect: () => void | Promise<void>
}) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-stone-950/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-white/70 bg-white p-6 text-center shadow-card">
        <div className="collect-modal-gem mx-auto grid h-36 w-36 place-items-center rounded-full bg-jewel-cream shadow-glow">
          <GemImage dayIndex={day.dayIndex} large />
        </div>
        <h3 className="mt-5 text-2xl font-black">
          {alreadyCollected ? '이미 수집한 보석입니다.' : '오늘의 기도보석을 발견했어요.'}
        </h3>
        {!alreadyCollected && <p className="mt-2 text-sm font-bold text-stone-600">기도보석을 수집하시겠습니까?</p>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          {alreadyCollected ? (
            <>
              <button type="button" onClick={onHome} className="rounded-xl bg-stone-100 py-3 text-sm font-black text-stone-600">
                확인
              </button>
              <button type="button" onClick={onCollect} className="rounded-xl bg-jewel-ink py-3 text-sm font-black text-white">
                다시보기
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onCancel} className="rounded-xl bg-stone-100 py-3 text-sm font-black text-stone-600">
                잠시 후에
              </button>
              <button type="button" onClick={onCollect} className="rounded-xl bg-jewel-ink py-3 text-sm font-black text-white">
                수집하기
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function CertificatePrompt({
  prompt,
  onCancel,
  onConfirm,
}: {
  prompt: CompletionPrompt
  onCancel: () => void
  onConfirm: () => void
}) {
  const isFullCompletion = prompt.count >= PRAYER_DAYS.length
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-stone-950/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-jewel-gold/40 bg-white p-6 text-center shadow-card">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-jewel-cream text-jewel-brown shadow-glow">
          <Sparkles size={34} />
        </div>
        <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-jewel-brown">인증서 안내</p>
        <h3 className="mt-2 text-2xl font-black leading-tight text-jewel-ink">
          {isFullCompletion ? '보석을 다 모으셨습니다.' : '보석기도를 마치셨습니다.'}
        </h3>
        <p className="mt-2 text-sm font-bold leading-relaxed text-stone-600">
          인증서를 확인하시겠어요?
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl bg-stone-100 py-3 text-sm font-black text-stone-600">
            잠시 후에
          </button>
          <button type="button" onClick={onConfirm} className="rounded-xl bg-jewel-ink py-3 text-sm font-black text-white">
            네, 확인할게요
          </button>
        </div>
      </div>
    </div>
  )
}

function ParentFinishChoiceModal({
  onFinish,
  onContinue,
  onClose,
}: {
  onFinish: () => void | Promise<void>
  onContinue: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-stone-950/55 px-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-3xl border border-jewel-gold/35 bg-white p-6 text-center shadow-card">
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-stone-100 text-xl font-black text-stone-500"
        >
          ×
        </button>
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-jewel-cream text-jewel-brown shadow-glow">
          <Gem size={30} />
        </div>
        <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-jewel-brown">연장 운영 안내</p>
        <h3 className="mt-2 text-2xl font-black leading-tight text-jewel-ink">오늘 기도를 마무리할까요?</h3>
        <p className="mt-3 text-sm font-bold leading-relaxed text-stone-600">
          20일 보석기도의 공식 마지막 날은 7월 11일입니다. 여기까지 함께한 기도도 소중합니다.
          오늘 카드로 마무리하거나, 7월 17일까지 남은 기도를 이어갈 수 있어요.
        </p>
        <div className="mt-5 grid gap-2">
          <button type="button" onClick={onFinish} className="rounded-xl bg-jewel-ink py-3 text-sm font-black text-white">
            카드 받고 마무리하기
          </button>
          <button type="button" onClick={onContinue} className="rounded-xl border border-jewel-gold/45 bg-jewel-cream py-3 text-sm font-black text-jewel-brown">
            남은 기도 이어가기
          </button>
        </div>
        <p className="mt-3 text-xs font-bold leading-relaxed text-stone-500">
          7월 17일까지 이어가면 남은 기도를 계속 드릴 수 있습니다.
        </p>
      </div>
    </div>
  )
}

function BoardCompletionCelebration() {
  return (
    <div className="board-completion-overlay fixed inset-0 z-[65] grid place-items-center bg-[#2d241d]/20 px-4 backdrop-blur-[2px]">
      <div className="board-completion-panel" aria-hidden="true">
        <div className="board-completion-orbit">
          {GEM_COLORS.map((color, index) => (
            <span
              key={`${color}-${index}`}
              className="board-completion-gem"
              style={{
                '--gem-color': color,
                '--start-x': `${Math.cos((index / GEM_COLORS.length) * Math.PI * 2) * 132}px`,
                '--start-y': `${Math.sin((index / GEM_COLORS.length) * Math.PI * 2) * 102}px`,
                '--delay': `${index * 32}ms`,
              } as CSSProperties}
            />
          ))}
          <div className="board-completion-certificate">
            <Sparkles size={34} />
          </div>
        </div>
        <p>인증서를 준비하고 있어요</p>
      </div>
    </div>
  )
}

function CollectionCeremonyOverlay({ ceremony }: { ceremony: CollectionCeremony }) {
  const trailGems = [1, 2, 3, 4, 5, 6]
  void ceremony
  return (
    <div className="collection-ceremony fixed inset-0 z-[60] grid place-items-center bg-[#2d241d]/50 px-4 backdrop-blur-sm">
      <div className="collection-ceremony-panel">
        <div className="collection-ceremony-stage" aria-hidden="true">
          <div className="collection-light-burst" />
          <div className="collection-scan-field" />
          <div className="collection-portal">
            <Gem size={46} />
          </div>
          {trailGems.map((item) => (
            <span key={item} className={`collection-trail-gem collection-trail-gem-${item}`} />
          ))}
          <div className="collection-gem-wrap">
            <div className="collection-universal-gem">
              <img src="/images/collection/collection-universal-diamond.png" alt="" className="collection-universal-gem-img" />
              <div className="collection-gem-laser" />
            </div>
          </div>
          <Sparkles className="collection-sparkle collection-sparkle-1" size={26} />
          <Sparkles className="collection-sparkle collection-sparkle-2" size={20} />
          <Sparkles className="collection-sparkle collection-sparkle-3" size={22} />
          <Sparkles className="collection-sparkle collection-sparkle-4" size={18} />
        </div>
        <h3 className="mt-5 text-lg font-black leading-tight text-jewel-brown">발견한 보석 수집중</h3>
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
          인증서가 열립니다
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
      <img src={failed ? ASSETS.baseGem : src} alt="" loading="eager" decoding="async" onError={() => setFailed(true)} />
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
      <span className="flex-1">앱의 기능을 오류 없이 최신으로 사용하려면 '브라우저로 열기'를 눌러주세요.</span>
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

function InstallNotice() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const installNoticeClosedKey = 'prayer-jewelry.installNotice.closed'
  const [closed, setClosed] = useState(() => {
    try {
      return sessionStorage.getItem(installNoticeClosedKey) === '1'
    } catch {
      return false
    }
  })
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
      setClosed(false)
      try {
        sessionStorage.removeItem(installNoticeClosedKey)
      } catch {
        // Ignore storage restrictions in private browsing modes.
      }
    }

    function handleAppInstalled() {
      setInstallEvent(null)
      setMessage('앱 설치가 완료됐어요.')
      window.setTimeout(() => setMessage(null), 2500)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  if (typeof navigator === 'undefined') return null

  const ua = navigator.userAgent
  const inApp = /KAKAOTALK|Instagram|FBAN|FBAV|Line\/|NAVER|Daum|; wv\)/i.test(ua)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)

  if (message) {
    return <div className="bg-jewel-ink px-4 py-2 text-center text-xs font-black text-white">{message}</div>
  }

  if (closed || standalone || inApp) return null

  const isIos = /iPhone|iPad|iPod/i.test(ua)

  async function install() {
    if (!installEvent) {
      setMessage(isIos ? 'Safari 하단 공유 버튼을 누른 뒤 홈 화면에 추가를 선택해 주세요.' : '브라우저 메뉴에서 앱 설치 또는 홈 화면에 추가를 눌러주세요.')
      window.setTimeout(() => setMessage(null), 4200)
      return
    }

    await installEvent.prompt()
    const choice = await installEvent.userChoice
    setInstallEvent(null)
    if (choice.outcome === 'accepted') {
      setMessage('앱 설치가 시작됐어요.')
    } else {
      setMessage('설치가 취소됐어요. 필요하면 다시 설치 버튼을 눌러주세요.')
    }
    window.setTimeout(() => setMessage(null), 3000)
  }

  function close() {
    try {
      sessionStorage.setItem(installNoticeClosedKey, '1')
    } catch {
      // Ignore storage restrictions in private browsing modes.
    }
    setClosed(true)
  }

  return (
    <div className="bg-jewel-cream px-4 py-3 text-jewel-brown shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center gap-2 text-xs font-black sm:text-sm">
        <span className="flex-1">
          {isIos ? 'iPhone은 Safari에서 공유 버튼 → 홈 화면에 추가로 설치해 주세요.' : '홈 화면에서 바로 열려면 앱을 설치해 주세요.'}
        </span>
        <button type="button" onClick={install} className="rounded-xl bg-jewel-ink px-3 py-2 text-white shadow-sm">
          앱 설치하기
        </button>
        <button type="button" onClick={close} aria-label="설치 안내 닫기" className="px-1 text-lg leading-none">
          ×
        </button>
      </div>
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

function LockedBox({ day }: { day?: PrayerDay }) {
  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-card">
      <Lock className="mx-auto text-stone-400" size={34} />
      <p className="mt-4 text-lg font-black">{day ? getPrayerLockedMessage(day) : '기도문은 매일 아침 7시에 열려요.'}</p>
      <p className="mt-2 text-sm font-semibold text-stone-500">오늘과 과거에 공개된 기도문만 볼 수 있어요.</p>
    </div>
  )
}

function slotLabel(slot: PrayerImageSlot) {
  if (slot === 1) return '기도문'
  if (slot === 2) return '말씀과 기도팁'
  return '유치부 기도요청'
}
