const linkify = require('linkifyjs')

export default (text, doLinkify) => {
	const json = compileToJSON(text)

	const html = compileToHTML(json)

	const flatten = flattenResult(html)

	const result = [].concat.apply([], flatten)

	markdownResult(result)

	if (doLinkify) linkifyResult(result)

	return result
}

const typeMarkdown = {
	bold: '*',
	italic: '_',
	strike: '~',
	underline: '°'
}

const pseudoMarkdown = {
	'[Face: ': {
		end: ']',
		allowed_chars: '\\d',
		type: 'face'
	},
	'[Forward: ': {
		end: ']',
		allowed_chars: '.',
		type: 'forward'
	},
	'||': {
		end: '\\|\\|',
		allowed_chars: '.',
		type: 'spoiler'
	},
	'\n':{
		type: 'breakLine'
	}
}

function compileToJSON(str) {
	let result = []
	let minIndexOf = -1
	let minIndexOfKey = null

	let links = linkify.find(str)
	let minIndexFromLink = false

	if (links.length > 0) {
		minIndexOf = str.indexOf(links[0].value)
		minIndexFromLink = true
	}

	Object.keys(pseudoMarkdown).forEach(startingValue => {
		const io = str.indexOf(startingValue)
		if (io >= 0 && (minIndexOf < 0 || io < minIndexOf)) {
			minIndexOf = io
			minIndexOfKey = startingValue
			minIndexFromLink = false
		}
	})

	if (minIndexFromLink && minIndexOfKey !== -1) {
		let strLeft = str.substr(0, minIndexOf)
		let strLink = str.substr(minIndexOf, links[0].value.length)
		let strRight = str.substr(minIndexOf + links[0].value.length)
		result.push(strLeft)
		result.push(strLink)
		result = result.concat(compileToJSON(strRight))
		return result
	}

	if (minIndexOfKey) {
		let strLeft = str.substr(0, minIndexOf)
		const char = minIndexOfKey
		let strRight = str.substr(minIndexOf + char.length)

		if (str.replace(/\s/g, '').length === char.length * 2) {
			return [str]
		}

		const match = strRight.match(
			new RegExp(
				'^(' +
				(pseudoMarkdown[char].allowed_chars || '.') +
				'*' +
				(pseudoMarkdown[char].end ? '?' : '') +
				')' +
				(pseudoMarkdown[char].end
					? '(' + pseudoMarkdown[char].end + ')'
					: ''),
				'm'
			)
		)
		if (!match) {
			strLeft = strLeft + char
			result.push(strLeft)
		} else {
			if (strLeft) {
				result.push(strLeft)
			}
			const object = {
				start: char,
				content: compileToJSON(match[1]),
				end: match[2],
				type: pseudoMarkdown[char].type
			}
			result.push(object)
			strRight = strRight.substr(match[0].length)
		}
		result = result.concat(compileToJSON(strRight))
		return result
	} else {
		if (str) {
			return [str]
		} else {
			return []
		}
	}
}

function compileToHTML(json) {
	const result = []

	json.forEach(item => {
		if (typeof item === 'string') {
			result.push({ types: [], value: item })
		} else {
			if (pseudoMarkdown[item.start]) {
				result.push(parseContent(item))
			}
		}
	})

	return result
}

function parseContent(item) {
	const result = []

	item.content.forEach(it => {
		if (typeof it === 'string') {
			result.push({
				types: [item.type],
				value: it
			})
		} else {
			it.content.forEach(i => {
				if (typeof i === 'string') {
					result.push({
						types: [it.type].concat([item.type]),
						value: i
					})
				} else {
					result.push({
						types: [i.type].concat([it.type]).concat([item.type]),
						value: parseContent(i)
					})
				}
			})
		}
	})

	return result
}

function flattenResult(array, types = []) {
	const result = []

	array.forEach(arr => {
		if (typeof arr.value === 'string') {
			arr.types = arr.types.concat(types)
			result.push(arr)
		} else {
			arr.forEach(a => {
				if (typeof a.value === 'string') {
					a.types = a.types.concat(types)
					result.push(a)
				} else {
					result.push(flattenResult(a.value, a.types))
				}
			})
		}
	})

	return result
}

function markdownResult(array) {
	for (let i = 0; i < array.length; i) {
		if (array[i - 1]) {
			const isInline =
				array[i].types.indexOf('inline-code') !== -1 &&
				array[i - 1].types.indexOf('inline-code') !== -1

			const isMultiline =
				array[i].types.indexOf('multiline-code') !== -1 &&
				array[i - 1].types.indexOf('multiline-code') !== -1

			if (isInline || isMultiline) {
				let value = array[i].value
				array[i].types.forEach(type => {
					const markdown = typeMarkdown[type] || ''
					value = markdown + value + markdown
				})

				array[i - 1].value = array[i - 1].value + value

				array.splice(i, 1)
			} else {
				i++
			}
		} else {
			i++
		}
	}
}

function linkifyResult(array) {
	const result = []

	array.forEach(arr => {
		const links = linkify.find(arr.value)

		if (links.length) {
			const spaces = arr.value.replace(links[0].value, '')
			result.push({ types: arr.types, value: spaces })

			arr.types = ['url'].concat(arr.types)
			arr.href = links[0].href
			arr.value = links[0].value
		}

		result.push(arr)
	})

	return result
}
