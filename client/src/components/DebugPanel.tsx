import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bug, RefreshCw, Trash2, ChevronDown, ChevronUp, TestTube, AlertCircle, CheckCircle } from 'lucide-react'
import { API_URL } from '../config'

interface DebugLog {
  timestamp: string
  type: 'request' | 'response' | 'error'
  data: unknown
}

interface EnvCheck {
  hasApiKey: boolean
  apiKeyPreview: string
  nodeEnv: string
}

export default function DebugPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [logs, setLogs] = useState<DebugLog[]>([])
  const [envCheck, setEnvCheck] = useState<EnvCheck | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [testResults, setTestResults] = useState<Record<string, unknown> | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  const fetchLogs = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/debug/logs`)
      const data = await response.json()
      setLogs(data.logs || [])
      setEnvCheck(data.envCheck || null)
    } catch (e) {
      console.error('Failed to fetch logs:', e)
    } finally {
      setIsLoading(false)
    }
  }

  const clearLogs = async () => {
    try {
      await fetch(`${API_URL}/api/debug/logs`, { method: 'DELETE' })
      setLogs([])
    } catch (e) {
      console.error('Failed to clear logs:', e)
    }
  }

  const testApi = async () => {
    setIsTesting(true)
    setTestResults(null)
    try {
      const response = await fetch(`${API_URL}/api/debug/test-api`, { method: 'POST' })
      const data = await response.json()
      setTestResults(data.results)
      await fetchLogs() // Refresh logs after test
    } catch (e) {
      console.error('Failed to test API:', e)
      setTestResults({ error: String(e) })
    } finally {
      setIsTesting(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchLogs()
    }
  }, [isOpen])

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'request': return 'text-blue-400'
      case 'response': return 'text-green-400'
      case 'error': return 'text-red-400'
      default: return 'text-gray-400'
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="absolute bottom-4 right-4 p-3 bg-forge-surface border border-forge-border rounded-full hover:border-forge-muted transition-colors shadow-lg"
        title="Debug Panel"
      >
        <Bug className="w-5 h-5 text-forge-text-muted" />
      </button>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-forge-surface border-t border-forge-border shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-forge-border">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Bug className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-medium text-forge-text">Debug Panel</span>
                </div>
                
                {/* Environment Status */}
                {envCheck && (
                  <div className="flex items-center gap-2 text-xs">
                    {envCheck.hasApiKey ? (
                      <span className="flex items-center gap-1 text-green-400">
                        <CheckCircle className="w-3 h-3" />
                        API Key: {envCheck.apiKeyPreview}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-400">
                        <AlertCircle className="w-3 h-3" />
                        API Key: NOT SET
                      </span>
                    )}
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={testApi}
                  disabled={isTesting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-violet-500/20 text-violet-300 rounded-lg hover:bg-violet-500/30 transition-colors disabled:opacity-50"
                >
                  <TestTube className="w-3 h-3" />
                  {isTesting ? 'Testing...' : 'Test API Endpoints'}
                </button>
                <button
                  onClick={fetchLogs}
                  disabled={isLoading}
                  className="p-1.5 text-forge-text-muted hover:text-forge-text transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={clearLogs}
                  className="p-1.5 text-forge-text-muted hover:text-red-400 transition-colors"
                  title="Clear Logs"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-forge-text-muted hover:text-forge-text transition-colors"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="max-h-80 overflow-y-auto">
              {/* API Test Results */}
              {testResults && (
                <div className="p-4 border-b border-forge-border bg-forge-bg/50">
                  <h3 className="text-xs font-medium text-forge-text-muted uppercase tracking-wider mb-2">
                    API Endpoint Test Results
                  </h3>
                  <div className="space-y-2 text-xs font-mono">
                    {Object.entries(testResults).map(([endpoint, result]) => (
                      <div key={endpoint} className="p-2 bg-forge-surface rounded border border-forge-border">
                        <div className="text-violet-400 mb-1 break-all">{endpoint}</div>
                        <pre className="text-forge-text-muted overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(result, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Logs */}
              <div className="p-4">
                <h3 className="text-xs font-medium text-forge-text-muted uppercase tracking-wider mb-2">
                  Request/Response Logs ({logs.length})
                </h3>
                
                {logs.length === 0 ? (
                  <p className="text-sm text-forge-text-muted text-center py-4">
                    No logs yet. Try generating an image.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {logs.map((log, i) => (
                      <details key={i} className="group">
                        <summary className="flex items-center gap-2 cursor-pointer p-2 bg-forge-bg rounded border border-forge-border hover:border-forge-muted transition-colors">
                          <ChevronUp className="w-3 h-3 text-forge-text-muted group-open:rotate-180 transition-transform" />
                          <span className={`text-xs font-medium uppercase ${getTypeColor(log.type)}`}>
                            {log.type}
                          </span>
                          <span className="text-xs text-forge-text-muted">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </summary>
                        <pre className="mt-1 p-2 bg-forge-bg/50 rounded text-xs text-forge-text-muted overflow-x-auto font-mono">
                          {JSON.stringify(log.data, null, 2)}
                        </pre>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Help */}
            <div className="px-4 py-2 border-t border-forge-border bg-forge-bg/50">
              <p className="text-xs text-forge-text-muted">
                <strong>Tip:</strong> If you see "API returned HTML" errors, the API endpoint might be incorrect. 
                Check your Krea API documentation for the correct endpoint URL.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
