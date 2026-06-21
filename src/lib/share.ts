import { ASSETS, DEFAULT_TEACHER_COMPLETION_CARD, getTeacherCompletionCardSrc } from './constants'
import type { Participant } from './types'

export async function createCompletionCard(participant: Participant) {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1440
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('이미지를 만들 수 없어요.')
  await ensureCardFonts()

  const teacherCompletionCardSrc = participant.type === 'teacher' ? getTeacherCompletionCardSrc(participant.teacherName) : null

  if (participant.type === 'teacher') {
    await drawTeacherImageCard(ctx, teacherCompletionCardSrc)
  } else {
    await drawParentCardV2(ctx, participant)
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('이미지 생성 실패'))), 'image/png')
  })
  return blob
}

export async function shareCompletionCard(participant: Participant, blob: Blob) {
  const file = new File([blob], `${participant.displayName}-기도보석-완주.png`, { type: 'image/png' })
  const text =
    participant.type === 'teacher'
      ? `20일 보석기도 완주를 축하합니다. ${participant.displayName}`
      : `보석보다 귀한 어린이 ${participant.displayName} 20일 보석기도 완주를 축하합니다☺️♥️`

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: '20일 보석기도 완주',
      text,
      files: [file],
    })
    return
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  URL.revokeObjectURL(url)
  await navigator.clipboard?.writeText(text).catch(() => {})
}

async function drawParentCardV2(ctx: CanvasRenderingContext2D, participant: Participant) {
  const template = await loadImage(ASSETS.parentCardTemplate)
  ctx.drawImage(template, 0, 0, 1080, 1440)
  drawParentTemplateMessage(ctx, [
    `보석보다 귀한 어린이 ${participant.displayName}`,
    '20일 보석기도 완주를 축하합니다☺️♥️',
  ])
}

async function drawImageCard(ctx: CanvasRenderingContext2D, src: string) {
  const template = await loadImage(src)
  drawCover(ctx, template, 0, 0, 1080, 1440)
}

async function drawTeacherImageCard(ctx: CanvasRenderingContext2D, src: string | null) {
  try {
    await drawImageCard(ctx, src ?? DEFAULT_TEACHER_COMPLETION_CARD)
  } catch (error) {
    if (src && src !== DEFAULT_TEACHER_COMPLETION_CARD) {
      await drawImageCard(ctx, DEFAULT_TEACHER_COMPLETION_CARD)
      return
    }
    throw error
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`이미지를 불러오지 못했어요: ${src}`))
    image.src = src
  })
}

async function ensureCardFonts() {
  await document.fonts?.load('900 48px "Cute Font"').catch(() => undefined)
}

function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / image.width, h / image.height)
  const sw = w / scale
  const sh = h / scale
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h)
}

function drawCenteredSansText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  weight = '800',
) {
  ctx.fillStyle = color
  ctx.font = `${weight} ${size}px "Cute Font", "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
}

function splitTextForWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const units = text.includes(' ') ? text.split(' ') : Array.from(text)
  const separator = text.includes(' ') ? ' ' : ''
  const lines: string[] = []
  let current = ''

  for (const unit of units) {
    const next = current ? `${current}${separator}${unit}` : unit
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current)
      current = unit
    } else {
      current = next
    }
  }

  if (current) lines.push(current)
  return lines
}

function drawParentTemplateMessage(ctx: CanvasRenderingContext2D, lines: string[]) {
  ctx.save()
  const wrappedLines = lines.flatMap((line) => {
    ctx.font = '900 52px "Cute Font", "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
    return splitTextForWidth(ctx, line, 920)
  }).slice(0, 4)
  const lineHeight = wrappedLines.length > 2 ? 48 : 58
  const fontSize = wrappedLines.length > 2 ? 42 : 50
  const startY = 1265 - ((wrappedLines.length - 1) * lineHeight) / 2
  wrappedLines.forEach((line, index) => {
    drawCenteredSansText(ctx, line, 540, startY + index * lineHeight, fontSize, '#2d241d', '900')
  })
  ctx.restore()
}
