import type { PrayerDay, Student } from './types'

export const APP_TITLE = '20일 보석기도'
export const ORG_LABEL = '용문교회 유치부'

export const ASSETS = {
  baseGem: '/images/collection/base-gem-transparent.png',
  gemBoard: '/images/collection/board.png',
  parentBottle: '/images/parent/completion-card-parent-template.png',
  parentCardSample: '/images/parent/completion-card-parent-template.png',
  parentCardTemplate: '/images/parent/completion-card-parent-template.png',
  teacherCardSample: '/images/teacher/completion-card-sample.png',
}

const TEACHER_COMPLETION_CARDS: Record<string, string> = {
  성유리: '/images/teacher/completion-cards/Seong-Yuri.png',
  신미경: '/images/teacher/completion-cards/shin-migyeong.png',
  이선예: '/images/teacher/completion-cards/Lee-seonyae.png',
}

export const DEFAULT_TEACHER_COMPLETION_CARD = '/images/teacher/completion-card-sample.png'

export function getTeacherCompletionCardSrc(teacherName?: string) {
  if (!teacherName) return null
  return TEACHER_COMPLETION_CARDS[teacherName] ?? `/images/teacher/completion-cards/${encodeURIComponent(teacherName)}.png`
}

export const TEACHERS = [
  '강순진',
  '김현진',
  '박옥희',
  '성유리',
  '신미경',
  '오선녀',
  '윤정아',
  '이린자',
  '이선예',
  '정은지',
  '조문경',
  '조선영',
  '홍명환',
]

export const STUDENTS: Student[] = [
  { className: '사랑반', name: '김채론', id: 'sarang-kim-chaeron' },
  { className: '사랑반', name: '노엘', id: 'sarang-noel' },
  { className: '사랑반', name: '송예서', id: 'sarang-song-yeseo' },
  { className: '사랑반', name: '안지호', id: 'sarang-an-jiho' },
  { className: '사랑반', name: '윤주로', id: 'sarang-yoon-juro' },
  { className: '사랑반', name: '장윤슬', id: 'sarang-jang-yunseul' },
  { className: '사랑반', name: '정지호', id: 'sarang-jung-jiho' },
  { className: '소망1반', name: '김아론', id: 'somang1-kim-aron' },
  { className: '소망1반', name: '김윤우', id: 'somang1-kim-yunwoo' },
  { className: '소망1반', name: '송연서', id: 'somang1-song-yeonseo' },
  { className: '소망1반', name: '유선예', id: 'somang1-yoo-seonye' },
  { className: '소망1반', name: '유선하', id: 'somang1-yoo-seonha' },
  { className: '소망2반', name: '김라온', id: 'somang2-kim-raon' },
  { className: '소망2반', name: '김이서', id: 'somang2-kim-iseo' },
  { className: '소망2반', name: '김하민', id: 'somang2-kim-hamin' },
  { className: '소망2반', name: '박재준', id: 'somang2-park-jaejun' },
  { className: '소망2반', name: '최지안', id: 'somang2-choi-jian' },
  { className: '소망2반', name: '김은율', id: 'somang2-kim-eunyul' },
  { className: '소망2반', name: '윤설', id: 'somang2-yoon-seol' },
  { className: '믿음1반', name: '김다희', id: 'mideum1-kim-dahee' },
  { className: '믿음1반', name: '김은우', id: 'mideum1-kim-eunwoo' },
  { className: '믿음1반', name: '이서우', id: 'mideum1-lee-seowoo' },
  { className: '믿음1반', name: '진소리', id: 'mideum1-jin-sori' },
  { className: '믿음2반', name: '손혜린', id: 'mideum2-son-hyerin' },
  { className: '믿음2반', name: '윤태준', id: 'mideum2-yoon-taejun' },
  { className: '믿음2반', name: '차예온', id: 'mideum2-cha-yeeon' },
  { className: '믿음2반', name: '함이서', id: 'mideum2-ham-iseo' },
]

export const CLASSES = [...new Set(STUDENTS.map((student) => student.className))]

export const GEM_COLORS = [
  '#F4F8FF',
  '#E8D9A8',
  '#F3E58D',
  '#F4D44E',
  '#F2A437',
  '#F7886B',
  '#E84C4F',
  '#F48FB1',
  '#F8CFE1',
  '#C9A0F5',
  '#A86AE8',
  '#8FA7F7',
  '#8ED8F8',
  '#4D8DFF',
  '#8FE7D2',
  '#36C6C0',
  '#B7EA57',
  '#37B66B',
  '#14A989',
  '#C9D1E6',
]

const COLLECTION_GEM_VERSION = '20260621-2'

export const COLLECTION_GEMS = Array.from({ length: 20 }, (_, index) => {
  const day = String(index + 1).padStart(2, '0')
  return `/images/collection/gems/day-${day}.png?v=${COLLECTION_GEM_VERSION}`
})

export const PRAYER_IMAGE_SLOTS = [1, 2, 3] as const
export type PrayerImageSlot = (typeof PRAYER_IMAGE_SLOTS)[number]

export const PRAYER_DAYS: PrayerDay[] = Array.from({ length: 20 }, (_, index) => {
  const start = new Date('2026-06-22T00:00:00+09:00')
  const date = new Date(start)
  date.setDate(start.getDate() + index)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()]
  return {
    dayIndex: index + 1,
    date: `${yyyy}-${mm}-${dd}`,
    monthDay: `${date.getMonth() + 1}월 ${date.getDate()}일(${weekday})`,
    title: `${index + 1}일차 기도문`,
    publishAt: `${yyyy}-${mm}-${dd}T07:00:00+09:00`,
  }
})

export function isPublished(day: PrayerDay, now = getAppNow()) {
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const previewAll = new URLSearchParams(window.location.search).get('previewAllPrayers')
    if (previewAll === '1') return true
  }
  return new Date(day.publishAt).getTime() <= now.getTime()
}

export function getCurrentPrayerDay(now = getAppNow()) {
  const day = PRAYER_DAYS.find((item) => item.date === formatKoreanDateKey(now))
  if (day) return day
  if (now.getTime() < new Date(PRAYER_DAYS[0].publishAt).getTime()) return PRAYER_DAYS[0]
  return PRAYER_DAYS[PRAYER_DAYS.length - 1]
}

function getAppNow() {
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const previewDate = new URLSearchParams(window.location.search).get('previewDate')
    if (previewDate && /^\d{4}-\d{2}-\d{2}$/.test(previewDate)) {
      return new Date(`${previewDate}T12:00:00+09:00`)
    }
  }
  return new Date()
}

function formatKoreanDateKey(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(date)
}
