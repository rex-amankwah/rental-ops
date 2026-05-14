import { Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function UnauthorizedPage() {
  const navigate = useNavigate()
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Lock className="w-7 h-7 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-2">Access Restricted</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs text-center">
        You don't have permission to access this page. Contact your administrator if you need access.
      </p>
      <button onClick={() => navigate(-1)} className="btn-secondary">Go Back</button>
    </div>
  )
}
