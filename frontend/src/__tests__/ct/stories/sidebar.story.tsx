import { MemoryRouter } from 'react-router-dom'
import Sidebar from '@/components/layout/Sidebar'

export function SidebarStory() {
  return (
    <MemoryRouter initialEntries={['/dashboard']}>
      <div className="flex h-screen">
        <Sidebar />
      </div>
    </MemoryRouter>
  )
}
