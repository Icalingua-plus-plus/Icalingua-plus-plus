const video = document.querySelector('video')

video.addEventListener('error', () => {
    video.hidden = true
    document.getElementById('error').hidden = false
})

video.src = new URLSearchParams(location.hash.slice(1)).get('url')
