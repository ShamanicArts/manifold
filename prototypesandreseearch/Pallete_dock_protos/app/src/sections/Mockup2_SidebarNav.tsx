import { useState, useMemo } from 'react';
import type { RackModule } from '@/types/modules';
import { moduleCategories, mockModules } from '@/types/modules';
import { Search, ChevronRight, ChevronDown, Plus, Star } from 'lucide-react';

export default function Mockup2_SidebarNav() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['osc']));
  const [selectedModule, setSelectedModule] = useState<RackModule | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const toggleCategory = (catId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const filteredModules = useMemo(() => {
    if (!searchQuery) return mockModules;
    const q = searchQuery.toLowerCase();
    return mockModules.filter(m => 
      m.name.toLowerCase().includes(q) || 
      m.description.toLowerCase().includes(q) ||
      m.tags.some(t => t.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const modulesByCategory = useMemo(() => {
    const grouped: Record<string, RackModule[]> = {};
    moduleCategories.forEach(cat => {
      grouped[cat.id] = filteredModules.filter(m => m.category === cat.id);
    });
    return grouped;
  }, [filteredModules]);

  const toggleFavorite = (id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col bg-[#0d1117]">
      {/* Top Bar */}
      <div className="h-12 bg-[#161b22] border-b border-gray-800 flex items-center px-4 gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gradient-to-br from-cyan-500 to-blue-600 rounded" />
          <span className="text-white font-bold">Manifold</span>
        </div>
        <div className="flex-1" />
        <div className="flex gap-2">
          <button className="w-8 h-8 rounded bg-red-600 flex items-center justify-center">
            <div className="w-2 h-2 bg-white rounded-full" />
          </button>
          <button className="w-8 h-8 rounded bg-green-600 flex items-center justify-center">
            <div className="w-0 h-0 border-l-[8px] border-l-white border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent ml-0.5" />
          </button>
          <button className="w-8 h-8 rounded bg-gray-700 flex items-center justify-center">
            <div className="w-2 h-2 bg-white" />
          </button>
        </div>
        <div className="flex-1" />
        <div className="text-gray-400 text-sm font-mono">120.00 BPM</div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Rack Area */}
        <div className="flex-1 bg-[#0d1117] p-4">
          <div className="grid grid-cols-2 gap-3">
            {[1, 2].map(i => (
              <div key={i} className="bg-[#161b22] rounded-lg border border-gray-800 h-40 flex items-center justify-center">
                <span className="text-gray-600 text-sm">Empty Rack Slot</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar Browser */}
        <div className="w-80 bg-[#161b22] border-l border-gray-800 flex flex-col">
          <div className="p-3 border-b border-gray-800">
            <div className="flex items-center gap-2 bg-[#0d1117] rounded-lg px-3 py-2">
              <Search className="w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search modules..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-sm text-white placeholder-gray-500 outline-none flex-1"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {moduleCategories.map(cat => {
              const modules = modulesByCategory[cat.id] || [];
              const isExpanded = expandedCategories.has(cat.id);
              
              return (
                <div key={cat.id} className="border-b border-gray-800">
                  <button
                    onClick={() => toggleCategory(cat.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#21262d] transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                    )}
                    <div 
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-gray-300 text-sm flex-1 text-left">{cat.name}</span>
                    <span className="text-gray-500 text-xs">{modules.length}</span>
                  </button>
                  
                  {isExpanded && modules.length > 0 && (
                    <div className="pl-8 pr-2 pb-2 space-y-0.5">
                      {modules.map(module => (
                        <div
                          key={module.id}
                          onClick={() => setSelectedModule(module)}
                          className={`group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                            selectedModule?.id === module.id ? 'bg-[#1f6feb]' : 'hover:bg-[#21262d]'
                          }`}
                        >
                          <span className={`text-xs truncate flex-1 ${selectedModule?.id === module.id ? 'text-white' : 'text-gray-400'}`}>
                            {module.name}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(module.id); }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Star className={`w-3 h-3 ${favorites.has(module.id) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-500'}`} />
                          </button>
                          <Plus className={`w-3 h-3 ${selectedModule?.id === module.id ? 'text-white' : 'text-gray-500'}`} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Module Details */}
          {selectedModule && (
            <div className="p-3 border-t border-gray-800 bg-[#0d1117]">
              <div className="flex items-start gap-2 mb-2">
                <div 
                  className="w-4 h-4 rounded mt-0.5"
                  style={{ backgroundColor: selectedModule.color }}
                />
                <div>
                  <div className="text-white text-sm font-medium">{selectedModule.name}</div>
                  <div className="text-gray-500 text-xs">{selectedModule.description}</div>
                </div>
              </div>
              <div className="flex gap-1 flex-wrap mb-2">
                {selectedModule.tags.map(tag => (
                  <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-[#21262d] text-gray-400 rounded">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="flex gap-2 text-xs">
                <div className="flex-1">
                  <div className="text-gray-500 mb-1">Inputs</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedModule.inputs.map(i => (
                      <span key={i} className="px-1.5 py-0.5 bg-cyan-900/50 text-cyan-400 rounded text-[10px]">{i}</span>
                    ))}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-gray-500 mb-1">Outputs</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedModule.outputs.map(o => (
                      <span key={o} className="px-1.5 py-0.5 bg-orange-900/50 text-orange-400 rounded text-[10px]">{o}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Panel */}
      <div className="h-48 bg-[#161b22] border-t border-gray-800 flex">
        <div className="flex-1 p-3">
          <div className="text-gray-500 text-xs uppercase mb-2">Rack View</div>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="w-20 h-32 bg-[#0d1117] rounded border border-gray-800" />
            ))}
          </div>
        </div>
        <div className="w-64 border-l border-gray-800 p-3">
          <div className="text-gray-500 text-xs uppercase mb-2">Quick Add</div>
          <div className="space-y-1">
            {mockModules.slice(0, 4).map(m => (
              <div key={m.id} className="flex items-center gap-2 p-1.5 hover:bg-[#21262d] rounded cursor-pointer">
                <div className="w-2 h-2 rounded" style={{ backgroundColor: m.color }} />
                <span className="text-gray-400 text-xs truncate flex-1">{m.name}</span>
                <Plus className="w-3 h-3 text-gray-500" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Keyboard */}
      <div className="h-16 bg-[#0a0f1a] flex">
        {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C'].map((note, i) => (
          <div
            key={i}
            className={`flex-1 ${note.includes('#') ? 'bg-black h-12 -mx-1.5 z-10' : 'bg-white border-r border-gray-300'}`}
          />
        ))}
      </div>
    </div>
  );
}
