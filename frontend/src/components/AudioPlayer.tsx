interface AudioPlayerProps {
  viewerToken: string
}

export default function AudioPlayer({ viewerToken }: AudioPlayerProps) {
  const audioUrl = `/api/viewer/${viewerToken}/artifact/audio`

  return (
    <div className="audio-player">
      <h3>🎵 Mixed Timeline Audio</h3>
      
      <audio controls style={{ width: '100%', maxWidth: '600px', margin: '20px 0' }}>
        <source src={audioUrl} type="audio/ogg" />
        Your browser does not support the audio element.
      </audio>

      <div style={{ marginTop: '20px' }}>
        <a href={audioUrl} download="mixed_timeline.ogg" className="download-button">
          ⬇️ Download Audio
        </a>
      </div>

      <div style={{ marginTop: '20px', fontSize: '14px', color: 'var(--text-secondary)' }}>
        <p>This is the mixed timeline containing all participants' audio merged together.</p>
      </div>
    </div>
  )
}