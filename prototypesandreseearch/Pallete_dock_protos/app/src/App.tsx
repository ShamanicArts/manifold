import { useState } from 'react';
import Mockup1_ClassicGrid from '@/sections/Mockup1_ClassicGrid';
import Mockup2_SidebarNav from '@/sections/Mockup2_SidebarNav';
import Mockup3_TagCloud from '@/sections/Mockup3_TagCloud';
import Mockup4_ModularShelf from '@/sections/Mockup4_ModularShelf';
import Mockup5_MinimalistList from '@/sections/Mockup5_MinimalistList';

const mockups = [
  { id: 1, name: 'Classic Grid', component: Mockup1_ClassicGrid, description: 'Traditional card grid with category tabs' },
  { id: 2, name: 'Sidebar Navigator', component: Mockup2_SidebarNav, description: 'Collapsible tree navigation with details panel' },
  { id: 3, name: 'Tag Cloud Explorer', component: Mockup3_TagCloud, description: 'Visual tag-based discovery with hover previews' },
  { id: 4, name: 'Modular Shelf', component: Mockup4_ModularShelf, description: 'Physical shelf metaphor with drag-and-drop' },
  { id: 5, name: 'Minimalist List', component: Mockup5_MinimalistList, description: 'Clean list view with keyboard shortcuts' },
];

function App() {
  const [activeMockup, setActiveMockup] = useState(1);

  const ActiveComponent = mockups.find(m => m.id === activeMockup)?.component || mockups[0].component;

  return (
    <div className="h-screen w-screen bg-black flex flex-col overflow-hidden">
      {/* Mockup Display Area */}
      <div className="flex-1 overflow-hidden">
        <ActiveComponent />
      </div>

      {/* Mockup Selector Pills */}
      <div className="h-16 bg-[#0a0f1a] border-t border-gray-800 flex items-center justify-center gap-2 px-4">
        <div className="flex items-center gap-1 bg-[#1a2332] rounded-xl p-1.5">
          {mockups.map(mockup => (
            <button
              key={mockup.id}
              onClick={() => setActiveMockup(mockup.id)}
              className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeMockup === mockup.id
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/25'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
              title={mockup.description}
            >
              <span className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  activeMockup === mockup.id ? 'bg-white' : 'bg-gray-600'
                }`} />
                {mockup.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Info Bar */}
      <div className="h-8 bg-[#0d1117] border-t border-gray-800 flex items-center justify-between px-4 text-xs text-gray-500">
        <div className="flex items-center gap-4">
          <span>Manifold Module Browser Mockups</span>
          <span className="text-gray-700">|</span>
          <span>{mockups.find(m => m.id === activeMockup)?.description}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-cyan-600">Interactive</span>
          <span>•</span>
          <span>Try search, categories, and drag-drop</span>
        </div>
      </div>
    </div>
  );
}

export default App;
