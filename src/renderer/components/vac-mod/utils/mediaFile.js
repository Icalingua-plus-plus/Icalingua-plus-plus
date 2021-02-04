import { IMAGE_TYPES, VIDEO_TYPES } from './constants'

export function isImageFile(file) {
	if (!file) return
	const { type } = file
	return IMAGE_TYPES.some(t => type.toLowerCase().includes(t))
}

export function isVideoFile(file) {
	if (!file) return
	const { type } = file
	return VIDEO_TYPES.some(t => type.toLowerCase().includes(t))
}
