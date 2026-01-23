import { useState, useEffect, useCallback } from 'react'
import { Loader2, Users, Flame, Gem, Calendar, Clock, BarChart3, ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { API_URL } from './config'
import { Panel, PanelHeader, PanelBody } from './components'

interface Stats {
  totals: {
    generations: number
    users: number
    today: number
    thisWeek: number
  }
  byModel: { model: string; count: number }[]
  byMode: { mode: string; count: number }[]
  byResolution: { resolution: string; count: number }[]
  byAspectRatio: { ratio: string; count: number }[]
  daily: { date: string; count: number }[]
  hourly: { hour: number; count: number }[]
}

interface UserStats {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  createdAt: string
  lastLogin: string
  generationCount: number
  lastGeneration: string | null
}

interface RecentGeneration {
  id: string
  prompt: string
  model: string
  resolution: string
  aspectRatio: string
  mode: string
  createdAt: string
  thumbnailUrl: string | null
  imageUrls: string[]
  user: {
    email: string
    name: string | null
    avatarUrl: string | null
  } | null
}

interface DashboardProps {
  onBack: () => void
}

export function Dashboard({ onBack }: DashboardProps) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [users, setUsers] = useState<UserStats[]>([])
  const [recent, setRecent] = useState<RecentGeneration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [userGenerations, setUserGenerations] = useState<Record<string, RecentGeneration[]>>({})

  // Fetch dashboard data
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [statsRes, usersRes, recentRes] = await Promise.all([
        fetch(`${API_URL}/api/dashboard/stats`),
        fetch(`${API_URL}/api/dashboard/users?limit=50`),
        fetch(`${API_URL}/api/dashboard/recent?limit=20`),
      ])
      
      if (!statsRes.ok || !usersRes.ok || !recentRes.ok) {
        throw new Error('Failed to fetch dashboard data')
      }
      
      const [statsData, usersData, recentData] = await Promise.all([
        statsRes.json(),
        usersRes.json(),
        recentRes.json(),
      ])
      
      setStats(statsData)
      setUsers(usersData.users)
      setRecent(recentData.generations)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Fetch user's generations when expanded
  const fetchUserGenerations = async (userId: string) => {
    if (userGenerations[userId]) return // Already loaded
    
    try {
      const res = await fetch(`${API_URL}/api/dashboard/users/${userId}/generations?limit=10`)
      if (res.ok) {
        const data = await res.json()
        setUserGenerations(prev => ({ ...prev, [userId]: data.generations }))
      }
    } catch (err) {
      console.error('Failed to fetch user generations:', err)
    }
  }

  const toggleUserExpanded = (userId: string) => {
    if (expandedUser === userId) {
      setExpandedUser(null)
    } else {
      setExpandedUser(userId)
      fetchUserGenerations(userId)
    }
  }

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  // Calculate max for chart scaling
  const maxDaily = stats ? Math.max(...stats.daily.map(d => d.count), 1) : 1

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dashboard-loading">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p>Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard">
        <div className="dashboard-error">
          <p>Error: {error}</p>
          <button className="btn btn-dark" onClick={fetchData}>Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <button className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
          Back to Forge
        </button>
        <h1>Operations Dashboard</h1>
      </div>

      {/* Stats Cards */}
      <div className="dashboard-cards">
        <Panel className="stat-card">
          <div className="stat-card-content">
            <div className="stat-icon"><Flame className="w-6 h-6" /></div>
            <div className="stat-info">
              <div className="stat-value">{stats?.totals.generations.toLocaleString()}</div>
              <div className="stat-label">Total Generations</div>
            </div>
          </div>
        </Panel>
        
        <Panel className="stat-card">
          <div className="stat-card-content">
            <div className="stat-icon"><Users className="w-6 h-6" /></div>
            <div className="stat-info">
              <div className="stat-value">{stats?.totals.users.toLocaleString()}</div>
              <div className="stat-label">Total Users</div>
            </div>
          </div>
        </Panel>
        
        <Panel className="stat-card">
          <div className="stat-card-content">
            <div className="stat-icon"><Calendar className="w-6 h-6" /></div>
            <div className="stat-info">
              <div className="stat-value">{stats?.totals.today.toLocaleString()}</div>
              <div className="stat-label">Today</div>
            </div>
          </div>
        </Panel>
        
        <Panel className="stat-card">
          <div className="stat-card-content">
            <div className="stat-icon"><BarChart3 className="w-6 h-6" /></div>
            <div className="stat-info">
              <div className="stat-value">{stats?.totals.thisWeek.toLocaleString()}</div>
              <div className="stat-label">This Week</div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="dashboard-grid">
        {/* Daily Chart */}
        <Panel className="dashboard-panel chart-panel">
          <PanelHeader>
            <BarChart3 className="w-4 h-4" />
            Generations (Last 30 Days)
          </PanelHeader>
          <PanelBody>
            <div className="chart-container">
              {stats?.daily.map((day, i) => (
                <div key={i} className="chart-bar-wrapper" title={`${formatDate(day.date)}: ${day.count}`}>
                  <div 
                    className="chart-bar" 
                    style={{ height: `${(day.count / maxDaily) * 100}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="chart-labels">
              <span>{stats?.daily[0] ? formatDate(stats.daily[0].date) : ''}</span>
              <span>{stats?.daily[stats.daily.length - 1] ? formatDate(stats.daily[stats.daily.length - 1].date) : ''}</span>
            </div>
          </PanelBody>
        </Panel>

        {/* Breakdown Stats */}
        <Panel className="dashboard-panel">
          <PanelHeader>
            <BarChart3 className="w-4 h-4" />
            Usage Breakdown
          </PanelHeader>
          <PanelBody>
            <div className="breakdown-section">
              <h4>By Model</h4>
              <div className="breakdown-list">
                {stats?.byModel.map(item => (
                  <div key={item.model} className="breakdown-item">
                    <span className="breakdown-label">
                      <Gem className="w-3 h-3" />
                      {item.model || 'Pro'}
                    </span>
                    <span className="breakdown-value">{item.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="breakdown-section">
              <h4>By Mode</h4>
              <div className="breakdown-list">
                {stats?.byMode.map(item => (
                  <div key={item.mode} className="breakdown-item">
                    <span className="breakdown-label">{item.mode === 'edit' ? 'Refine' : 'Create'}</span>
                    <span className="breakdown-value">{item.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="breakdown-section">
              <h4>By Resolution</h4>
              <div className="breakdown-list">
                {stats?.byResolution.map(item => (
                  <div key={item.resolution} className="breakdown-item">
                    <span className="breakdown-label">{item.resolution || 'Default'}</span>
                    <span className="breakdown-value">{item.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Users List */}
        <Panel className="dashboard-panel users-panel">
          <PanelHeader>
            <Users className="w-4 h-4" />
            Users ({users.length})
          </PanelHeader>
          <PanelBody>
            <div className="users-list">
              {users.map(user => (
                <div key={user.id} className="user-row-wrapper">
                  <div 
                    className={`user-row ${expandedUser === user.id ? 'expanded' : ''}`}
                    onClick={() => toggleUserExpanded(user.id)}
                  >
                    <div className="user-avatar">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt="" />
                      ) : (
                        <div className="user-avatar-placeholder">
                          {(user.name || user.email)[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="user-info">
                      <div className="user-name">{user.name || user.email.split('@')[0]}</div>
                      <div className="user-email">{user.email}</div>
                    </div>
                    <div className="user-stats">
                      <span className="user-gen-count">{user.generationCount}</span>
                      <span className="user-gen-label">gens</span>
                    </div>
                    {expandedUser === user.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                  
                  <AnimatePresence>
                    {expandedUser === user.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="user-generations"
                      >
                        {userGenerations[user.id] ? (
                          userGenerations[user.id].length > 0 ? (
                            <div className="user-gen-grid">
                              {userGenerations[user.id].map(gen => (
                                <div key={gen.id} className="user-gen-item" title={gen.prompt}>
                                  {gen.thumbnailUrl ? (
                                    <img src={`${API_URL}${gen.thumbnailUrl}`} alt="" />
                                  ) : gen.imageUrls[0] ? (
                                    <img src={`${API_URL}${gen.imageUrls[0]}`} alt="" />
                                  ) : (
                                    <div className="user-gen-placeholder" />
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="user-gen-empty">No generations yet</div>
                          )
                        ) : (
                          <div className="user-gen-loading">
                            <Loader2 className="w-4 h-4 animate-spin" />
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </PanelBody>
        </Panel>

        {/* Recent Generations */}
        <Panel className="dashboard-panel recent-panel">
          <PanelHeader>
            <Clock className="w-4 h-4" />
            Recent Generations
          </PanelHeader>
          <PanelBody>
            <div className="recent-list">
              {recent.map(gen => (
                <div key={gen.id} className="recent-item">
                  <div className="recent-thumb">
                    {gen.thumbnailUrl ? (
                      <img src={`${API_URL}${gen.thumbnailUrl}`} alt="" />
                    ) : gen.imageUrls[0] ? (
                      <img src={`${API_URL}${gen.imageUrls[0]}`} alt="" />
                    ) : (
                      <div className="recent-thumb-placeholder" />
                    )}
                  </div>
                  <div className="recent-info">
                    <div className="recent-prompt">{gen.prompt}</div>
                    <div className="recent-meta">
                      <span className="recent-user">
                        {gen.user ? (gen.user.name || gen.user.email.split('@')[0]) : 'Anonymous'}
                      </span>
                      <span className="recent-sep">·</span>
                      <span>Pro</span>
                      <span className="recent-sep">·</span>
                      <span>{formatDate(gen.createdAt)} {formatTime(gen.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </PanelBody>
        </Panel>
      </div>
    </div>
  )
}
