const LAYOUT_HORIZONTAL = 'horizontal'
const LAYOUT_VERTICAL = 'vertical'

export default {
    name: 'multipane',

    props: {
        layout: {
            type: String,
            default: LAYOUT_VERTICAL,
        },
    },

    data() {
        return {
            isResizing: false,
        }
    },

    computed: {
        classnames() {
            return ['multipane', 'layout-' + this.layout.slice(0, 1), this.isResizing ? 'is-resizing' : '']
        },
        cursor() {
            return this.isResizing ? (this.layout == LAYOUT_VERTICAL ? 'col-resize' : 'row-resize') : ''
        },
        userSelect() {
            return this.isResizing ? 'none' : ''
        },
    },

    methods: {
        onMouseDown({ target: resizer, pageX: initialPageX, pageY: initialPageY }) {
            if (typeof resizer.className !== 'string' || !resizer.className.match('multipane-resizer')) return
            const resizeNext = resizer.className.match('resize-next')
            let self = this
            let { $el: container, layout } = self

            let pane = resizeNext ? resizer.nextElementSibling : resizer.previousElementSibling

            let { offsetWidth: initialPaneWidth, offsetHeight: initialPaneHeight } = pane

            let usePercentage = !!(pane.style.width + '').match('%')

            const { addEventListener, removeEventListener } = window

            const resize = (initialSize?, offset = 0) => {
                if (layout == LAYOUT_VERTICAL) {
                    let containerWidth = container.clientWidth
                    let paneWidth = initialSize + (resizeNext ? -offset : offset)

                    return (pane.style.width = usePercentage
                        ? (paneWidth / containerWidth) * 100 + '%'
                        : paneWidth + 'px')
                }

                if (layout == LAYOUT_HORIZONTAL) {
                    let containerHeight = container.clientHeight
                    let paneHeight = initialSize + (resizeNext ? -offset : offset)

                    return (pane.style.height = usePercentage
                        ? (paneHeight / containerHeight) * 100 + '%'
                        : paneHeight + 'px')
                }
            }

            // This adds is-resizing class to container
            self.isResizing = true

            // Resize once to get current computed size
            let size = resize()

            // Trigger paneResizeStart event
            self.$emit('paneResizeStart', pane, resizer, size)

            const onMouseMove = function ({ pageX, pageY }) {
                size =
                    layout == LAYOUT_VERTICAL
                        ? resize(initialPaneWidth, pageX - initialPageX)
                        : resize(initialPaneHeight, pageY - initialPageY)

                self.$emit('paneResize', pane, resizer, size)
            }

            const onMouseUp = function () {
                // Run resize one more time to set computed width/height.
                size = layout == LAYOUT_VERTICAL ? resize(pane.clientWidth) : resize(pane.clientHeight)

                // This removes is-resizing class to container
                self.isResizing = false

                removeEventListener('mousemove', onMouseMove)
                removeEventListener('mouseup', onMouseUp)

                self.$emit('paneResizeStop', pane, resizer, size)
            }

            addEventListener('mousemove', onMouseMove)
            addEventListener('mouseup', onMouseUp)
        },
    },
}
