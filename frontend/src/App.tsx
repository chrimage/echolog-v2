import { useEffect, useState } from 'react'
import { SessionData } from './types'
import SessionViewer from './components/SessionViewer'

function App() {
  const [sessionData, setSessionData] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Extract viewer token from URL path (/viewer/{token})
    const pathParts = window.location.pathname.split('/')
    const viewerToken = pathParts[pathParts.length - 1]
    
    if (!viewerToken || pathParts[pathParts.length - 2] !== 'viewer') {
      setError('Invalid viewer URL')
      setLoading(false)
      return
    }

    // Fetch session data using viewer token
    fetch(`/api/viewer/${viewerToken}`)
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`)
        }
        return res.json()
      })
      .then((data: SessionData) => {
        setSessionData(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading session data...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container">
        <div className="error">
          <h2>Error Loading Session</h2>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  if (!sessionData) {
    return (
      <div className="container">
        <div className="error">
          <h2>Session Not Found</h2>
          <p>The requested session could not be found or has expired.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <SessionViewer sessionData={sessionData} />
    </div>
  )
}

export default App