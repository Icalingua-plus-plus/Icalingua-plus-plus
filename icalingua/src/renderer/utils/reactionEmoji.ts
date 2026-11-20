import path from 'path'
import faceNames from '../../../static/faceNames'

declare const __static: string

const faces: readonly (readonly [name: string, id: string, nonstandard?: boolean])[] = faceNames
const faceLabels = new Map(faces.map(([name, id]) => [id, name]))

export const qqReactionFaceIds = Array.from(
    new Set(
        faces.filter(([, id, nonstandard]) => /^\d{3}$/.test(id) && !nonstandard).map(([, id]) => String(Number(id))),
    ),
)

// Type 2 IDs from the QQ emoji list.
export const unicodeReactionIds = [
    9728, 9749, 9786, 10024, 10060, 10068, 127801, 127817, 127822, 127827, 127836, 127838, 127847, 127866, 127867,
    127881, 128027, 128046, 128051, 128053, 128074, 128076, 128077, 128079, 128089, 128102, 128104, 128147, 128157,
    128164, 128166, 128168, 128170, 128235, 128293, 128513, 128514, 128516, 128522, 128524, 128527, 128530, 128531,
    128532, 128536, 128538, 128540, 128541, 128557, 128560, 128563,
].map(String)

export function describeReaction(id: string, type: number): { label: string; url?: string } {
    if (type === 1 && /^\d+$/.test(id)) {
        const face = String(Number(id)).padStart(3, '0')
        return {
            label: faceLabels.get(face) || 'QQ 表情 ' + id,
            url: 'file://' + path.join(__static, 'face', face),
        }
    }

    const code = Number(id)
    const label =
        type === 2 && /^\d+$/.test(id) && code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
            ? String.fromCodePoint(code)
            : id
    return { label }
}
