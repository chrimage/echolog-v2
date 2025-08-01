import { useState } from 'react'
import { SessionData, TabType } from '../types'
import AudioPlayer from './AudioPlayer'
import MarkdownViewer from './MarkdownViewer'
import ThemeToggle from './ThemeToggle'

interface SessionViewerProps {
  sessionData: SessionData
  viewerToken: string
}

export default function SessionViewer({ sessionData, viewerToken }: SessionViewerProps) {
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    // Auto-select first available tab
    if (sessionData.files.mixedTimeline) return 'audio'
    if (sessionData.files.transcript) return 'transcript'
    if (sessionData.files.summary) return 'summary'
    return 'audio'
  })

  const tabs = [
    { id: 'audio' as TabType, label: '🎵 Audio Player', available: sessionData.files.mixedTimeline },
    { id: 'transcript' as TabType, label: '📝 Transcript', available: sessionData.files.transcript },
    { id: 'summary' as TabType, label: '📄 Summary', available: sessionData.files.summary }
  ].filter(tab => tab.available)

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  return (
    <div>
      <div className="header">
        <ThemeToggle />
        <h1>🎧 Session: {sessionData.sessionName}</h1>
        <div className="session-info">
          <div className="info-item">
            <div className="info-label">Duration</div>
            <div className="info-value">{sessionData.duration}</div>
          </div>
          <div className="info-item">
            <div className="info-label">Participants</div>
            <div className="info-value">{sessionData.participantCount}</div>
          </div>
          <div className="info-item">
            <div className="info-label">Started</div>
            <div className="info-value">{formatDate(sessionData.startTime)}</div>
          </div>
          <div className="info-item">
            <div className="info-label">Ended</div>
            <div className="info-value">{formatDate(sessionData.endTime)}</div>
          </div>
        </div>
      </div>

      {tabs.length > 0 ? (
        <>
          <div className="tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="tab-content">
            {activeTab === 'audio' && sessionData.files.mixedTimeline && (
              <AudioPlayer viewerToken={viewerToken} />
            )}
            {activeTab === 'transcript' && sessionData.files.transcript && (
              <MarkdownViewer 
                viewerToken={viewerToken} 
                type="transcript" 
                title="📝 Session Transcript"
              />
            )}
            {activeTab === 'summary' && sessionData.files.summary && (
              <MarkdownViewer 
                viewerToken={viewerToken} 
                type="summary" 
                title="📄 Session Summary"
              />
            )}
          </div>
        </>
      ) : (
        <div className="error">
          <h2>No Artifacts Available</h2>
          <p>This session doesn't have any processed artifacts yet. The recording may still be processing, or there might have been an error during processing.</p>
        </div>
      )}
    </div>
  )
}