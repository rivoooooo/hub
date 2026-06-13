import { createFileRoute } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import Versions from '@renderer/components/Versions'

export const Route = createFileRoute('/')({
  component: function Dashboard(): React.JSX.Element {
    return (
      <div className="dashboard">
        <h1 className="dashboard-title">Dev Browser</h1>
        <p className="dashboard-subtitle">Development browser tools at your fingertips</p>

        <div className="dashboard-cards">
          <Link to="/browser" className="dashboard-card dashboard-card--primary">
            <span className="card-icon">🌐</span>
            <span className="card-label">Browser Control</span>
            <span className="card-desc">Open and control a developer browser window</span>
          </Link>
        </div>

        <Versions />
      </div>
    )
  }
})
