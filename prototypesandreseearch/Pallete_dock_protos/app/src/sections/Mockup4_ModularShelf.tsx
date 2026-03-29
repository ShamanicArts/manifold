import { useState, useMemo } from 'react';
import type { RackModule } from '@/types/modules';
import { moduleCategories, mockModules } from '@/types/modules';
import { Search, Folder, FolderOpen, Plus, GripVertical, MoreHorizontal } from 'lucide-react';

export default function Mockup4_ModularShelf() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [draggedModule, setDraggedModule] = useState<RackModule | null>(null);
  const [rackSlots, setRackSlots] = useState<(RackModule | null)[]>([null, null, null, null, null, null]);

  const filteredModules = useMemo(() => {
    let modules = mockModules;
    
    if (activeFolder) {
      modules = modules.filter(m => m.category === activeFolder);
    }
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      modules = modules.filter(m => 
        m.name.toLowerCase().includes(q) || 
        m.description.toLowerCase().includes(q)
      );
    }
    
    return modules;
  }, [searchQuery, activeFolder]);

  const handleDragStart = (module: RackModule) => {
    setDraggedModule(module);
  };

  const handleDrop = (slotIndex: number) => {
    if (draggedModule) {
      const newSlots = [...rackSlots];
      newSlots[slotIndex] = draggedModule;
      setRackSlots(newSlots);
      setDraggedModule(null);
    }
  };

  const clearSlot = (index: number) => {
    const newSlots = [...rackSlots];
    newSlots[index] = null;
    setRackSlots(newSlots);
  };

  return (
    <div className="h-full flex flex-col bg-[#1e1e24]">
      {/* Top Bar */}
      <div className="h-14 bg-[#2a2a32] border-b border-gray-700 flex items-center px-4 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg shadow-lg shadow-orange-500/20" />
          <span className="text-gray-200 font-bold text-lg">Manifold</span>
        </div>
        <div className="flex-1" />
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg shadow-lg shadow-red-600/20 transition-colors flex items-center gap-2">
            <div className="w-2 h-2 bg-white rounded-full" />
            REC
          </button>
          <button className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg shadow-lg shadow-green-600/20 transition-colors flex items-center gap-2">
            <div className="w-0 h-0 border-l-[8px] border-l-white border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent" />
            PLAY
          </button>
          <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors">
            STOP
          </button>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-4">
          <div className="text-gray-400 text-sm">120 BPM</div>
          <div className="w-px h-6 bg-gray-700" />
          <div className="text-gray-400 text-sm">CPU: 12%</div>
        </div>
      </div>

      {/* Rack Area */}
      <div className="h-48 bg-[#25252c] border-b border-gray-700 p-4">
        <div className="text-gray-500 text-xs uppercase mb-3">Rack Slots - Drag modules here</div>
        <div className="flex gap-3 h-full">
          {rackSlots.map((slot, i) => (
            <div
              key={i}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(i)}
              className={`flex-1 rounded-xl border-2 border-dashed transition-all ${
                slot 
                  ? 'border-transparent bg-[#2a2a32]' 
                  : 'border-gray-700 bg-[#1e1e24] hover:border-gray-600'
              }`}
            >
              {slot ? (
                <div className="h-full p-3 relative group">
                  <div 
                    className="absolute top-0 left-0 right-0 h-1 rounded-t-xl"
                    style={{ backgroundColor: slot.color }}
                  />
                  <button
                    onClick={() => clearSlot(i)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
                  >
                    <span className="text-lg">×</span>
                  </button>
                  <div className="mt-3">
                    <div className="text-gray-200 text-sm font-medium">{slot.name}</div>
                    <div className="text-gray-500 text-xs mt-1">{slot.description}</div>
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {slot.inputs.slice(0, 2).map(inp => (
                        <span key={inp} className="text-[9px] px-1.5 py-0.5 bg-cyan-900/50 text-cyan-400 rounded">{inp}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-600 text-sm">
                  Slot {i + 1}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Browser Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Folder Sidebar */}
        <div className="w-56 bg-[#2a2a32] border-r border-gray-700 flex flex-col">
          <div className="p-3 border-b border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1e1e24] border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-amber-500/50 transition-colors"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2">
            <div className="text-gray-500 text-xs uppercase px-2 mb-2">Categories</div>
            <button
              onClick={() => setActiveFolder(null)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeFolder === null ? 'bg-amber-500/20 text-amber-400' : 'text-gray-400 hover:bg-gray-700/50'
              }`}
            >
              {activeFolder === null ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
              All Modules
            </button>
            
            {moduleCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveFolder(cat.id === activeFolder ? null : cat.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeFolder === cat.id ? 'text-white' : 'text-gray-400 hover:bg-gray-700/50'
                }`}
                style={{ backgroundColor: activeFolder === cat.id ? `${cat.color}30` : undefined }}
              >
                {activeFolder === cat.id ? <FolderOpen className="w-4 h-4" style={{ color: cat.color }} /> : <Folder className="w-4 h-4" style={{ color: cat.color }} />}
                <span className="flex-1 text-left">{cat.name}</span>
                <span className="text-xs text-gray-500">
                  {mockModules.filter(m => m.category === cat.id).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Module Shelf */}
        <div className="flex-1 bg-[#25252c] p-4 overflow-y-auto">
          <div className="grid grid-cols-5 gap-3">
            {filteredModules.map(module => (
              <div
                key={module.id}
                draggable
                onDragStart={() => handleDragStart(module)}
                className="group relative bg-gradient-to-b from-[#3a3a42] to-[#2a2a32] rounded-lg border border-gray-700 hover:border-gray-500 cursor-grab active:cursor-grabbing transition-all hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5"
              >
                {/* Shelf shadow */}
                <div className="absolute -bottom-1 left-2 right-2 h-2 bg-black/30 rounded-full blur-sm" />
                
                {/* Module card */}
                <div className="relative">
                  <div 
                    className="h-2 rounded-t-lg"
                    style={{ backgroundColor: module.color }}
                  />
                  <div className="p-3">
                    <div className="flex items-start justify-between mb-2">
                      <GripVertical className="w-4 h-4 text-gray-600" />
                      <button className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-300 transition-opacity">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="text-gray-200 text-sm font-medium mb-1">{module.name}</div>
                    <div className="text-gray-500 text-xs line-clamp-2">{module.description}</div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex gap-1">
                        {module.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="text-[9px] px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <button className="w-6 h-6 rounded bg-gray-700 hover:bg-amber-600 flex items-center justify-center transition-colors">
                        <Plus className="w-3 h-3 text-gray-300" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {filteredModules.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <Folder className="w-12 h-12 mb-3 opacity-30" />
              <p>No modules found</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Info Bar */}
      <div className="h-8 bg-[#2a2a32] border-t border-gray-700 flex items-center px-4 text-xs text-gray-500">
        <span>{filteredModules.length} modules</span>
        <div className="flex-1" />
        <span>Drag modules to rack slots</span>
      </div>

      {/* Keyboard */}
      <div className="h-16 bg-[#1a1a20] flex relative">
        {['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'].map((note) => (
          <div key={note} className="flex-1 bg-[#f5f5f5] border-r border-gray-300 hover:bg-gray-100 transition-colors" />
        ))}
        {['C#', 'D#', 'F#', 'G#', 'A#'].map((note, i) => {
          const positions = ['12.5%', '25%', '50%', '62.5%', '75%'];
          return (
            <div
              key={note}
              className="absolute w-6 h-10 bg-[#1a1a20] rounded-b"
              style={{ left: positions[i] }}
            />
          );
        })}
      </div>
    </div>
  );
}
