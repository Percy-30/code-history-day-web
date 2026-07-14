/**
 * bot/utils/text.js — Funciones de texto reutilizables
 */
const path = require('path')

/** Cortar texto en la última palabra antes del límite */
function truncateAtWord(text, maxLength) {
  if (text.length <= maxLength) return text
  let truncated = text.substring(0, maxLength)
  const lastSpaceIndex = truncated.lastIndexOf(' ')
  if (lastSpaceIndex > 0) return truncated.substring(0, lastSpaceIndex)
  return truncated
}

/** Detectar número de frame desde nombre de archivo: F1.mp3, f01.ogg, audio_F5.m4a, etc. */
function detectFrameNumber(filename) {
  const base = path.basename(filename, path.extname(filename))
  const match = base.match(/[fF](\d+)/)
  if (match) return parseInt(match[1], 10)
  const numMatch = base.match(/(\d+)/)
  if (numMatch) return parseInt(numMatch[1], 10)
  return null
}

/** Escapar HTML para Telegram */
function escapeHTML(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

module.exports = { truncateAtWord, detectFrameNumber, escapeHTML }
