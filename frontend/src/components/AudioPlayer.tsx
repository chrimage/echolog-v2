import { useState, useRef, useEffect } from 'react'

interface AudioPlayerProps {
  sessionId: string
}

export default function AudioPlayer({ sessionId }: AudioPlayerProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState<number>(0)
  const [currentTime, setCurrentTime] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  const audioUrl = `/api/artifact/${sessionId}/audio`

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
      setLoading(false)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => setIsPlaying(false)

    const handleError = () => {
      setError('Failed to load audio file')
      setLoading(false)
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
    }
  }, [])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handlePlayPause = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio) return

    const newTime = (parseFloat(e.target.value) / 100) * duration
    audio.currentTime = newTime
    setCurrentTime(newTime)
  }

  const handleDownload = () => {
    // Create a temporary link to trigger download
    const link = document.createElement('a')
    link.href = audioUrl
    link.download = 'mixed_timeline.ogg'
    link.click()
  }

  if (loading) {
    return (
      <div className="audio-player">
        <div className="loading">Loading audio...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="audio-player">
        <div className="error">{error}</div>
      </div>
    )
  }

  return (
    <div className="audio-player">
      <h3>🎵 Mixed Timeline Audio</h3>
      
      <audio ref={audioRef} preload="metadata">
        <source src={audioUrl} type="audio/ogg" />
        Your browser does not support the audio element.
      </audio>

      <div className="audio-controls">
        <button 
          onClick={handlePlayPause}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            marginBottom: '15px'
          }}
        >
          {isPlaying ? '⏸️ Pause' : '▶️ Play'}
        </button>

        <div style={{ margin: '15px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ minWidth: '50px', fontSize: '14px' }}>
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min="0"
            max="100"
            value={duration > 0 ? (currentTime / duration) * 100 : 0}
            onChange={handleSeek}
            style={{ flex: 1, height: '6px' }}
          />
          <span style={{ minWidth: '50px', fontSize: '14px' }}>
            {formatTime(duration)}
          </span>
        </div>

        <div style={{ marginTop: '20px' }}>
          <button onClick={handleDownload} className="download-button">
            ⬇️ Download Audio
          </button>
        </div>
      </div>

      <div style={{ marginTop: '20px', fontSize: '14px', color: '#666' }}>
        <p>This is the mixed timeline containing all participants' audio merged together.</p>
      </div>
    </div>
  )
}