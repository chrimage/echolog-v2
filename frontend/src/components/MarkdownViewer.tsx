import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { ArtifactResponse } from '../types'

interface MarkdownViewerProps {
  viewerToken: string
  type: 'transcript' | 'summary'
  title: string
}

export default function MarkdownViewer({ viewerToken, type, title }: MarkdownViewerProps) {
  const [content, setContent] = useState<string>('')
  const [downloadUrl, setDownloadUrl] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/viewer/${viewerToken}/artifact/${type}`)
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`)
        }
        return res.json()
      })
      .then((data: ArtifactResponse) => {
        setContent(data.content)
        setDownloadUrl(data.downloadUrl)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [viewerToken, type])

  const handleDownload = () => {
    if (downloadUrl) {
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = `${type}.md`
      link.click()
    }
  }

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(content)
      // Simple visual feedback - could be improved with a toast notification
      const button = document.getElementById(`copy-${type}`)
      if (button) {
        const originalText = button.textContent
        button.textContent = '✅ Copied!'
        setTimeout(() => {
          button.textContent = originalText
        }, 2000)
      }
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = content
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      
      const button = document.getElementById(`copy-${type}`)
      if (button) {
        const originalText = button.textContent
        button.textContent = '✅ Copied!'
        setTimeout(() => {
          button.textContent = originalText
        }, 2000)
      }
    }
  }

  if (loading) {
    return (
      <div className="loading">
        Loading {type}...
      </div>
    )
  }

  if (error) {
    return (
      <div className="error">
        <h3>Error Loading {title}</h3>
        <p>{error}</p>
      </div>
    )
  }

  if (!content) {
    return (
      <div className="error">
        <h3>{title} Not Available</h3>
        <p>The {type} file was not found or is empty.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="markdown-viewer-header" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '20px',
        paddingBottom: '15px',
        borderBottom: '1px solid var(--border-color)'
      }}>
        <h3>{title}</h3>
        <div className="markdown-viewer-buttons" style={{ display: 'flex', gap: '10px' }}>
          <button 
            id={`copy-${type}`}
            onClick={handleCopyToClipboard} 
            className="download-button copy-button"
          >
            📋 Copy to Clipboard
          </button>
          {downloadUrl && (
            <button onClick={handleDownload} className="download-button">
              ⬇️ Download {type === 'transcript' ? 'Transcript' : 'Summary'}
            </button>
          )}
        </div>
      </div>

      <div className="markdown-content">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>

      {type === 'transcript' && (
        <div style={{ 
          marginTop: '30px', 
          padding: '15px', 
          backgroundColor: '#f8f9fa', 
          borderRadius: '6px',
          fontSize: '14px',
          color: '#666'
        }}>
          <p><strong>About this transcript:</strong> This transcript was automatically generated from the audio recording. It may contain inaccuracies, especially for proper names, technical terms, or when multiple people speak simultaneously.</p>
        </div>
      )}

      {type === 'summary' && (
        <div style={{ 
          marginTop: '30px', 
          padding: '15px', 
          backgroundColor: '#f8f9fa', 
          borderRadius: '6px',
          fontSize: '14px',
          color: '#666'
        }}>
          <p><strong>About this summary:</strong> This summary was automatically generated from the transcript using AI. It aims to capture the key points and decisions from the conversation.</p>
        </div>
      )}
    </div>
  )
}