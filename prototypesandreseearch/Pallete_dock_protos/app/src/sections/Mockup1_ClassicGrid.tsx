import { useState, useMemo } from 'react';
import { moduleCategories, mockModules } from '@/types/modules';
import { Search, Star, Grid3X3, List } from 'lucide-react';

export default function Mockup1_ClassicGrid() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const filteredModules = useMemo(() => {
    let modules = mockModules;
    
    if (selectedCategory) {
      modules = modules.filter(m => m.category === selectedCategory);
    }
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      modules = modules.filter(m => 
        m.name.toLowerCase().includes(q) || 
        m.description.toLowerCase().includes(q) ||
        m.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    
    return modules;
  }, [searchQuery, selectedCategory]);

  const toggleFavorite = (id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col bg-[#0a0f1a]">
      {/* Top Bar */}
      <div className="h-12 bg-[#111827] border-b border-gray-800 flex items-center px-4 gap-4">
        <div className="text-cyan-400 font-bold text-lg">MANIFOLD</div>
        <div className="flex-1" />
        <div className="flex gap-2">
          <button className="px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded">REC</button>
          <button className="px-4 py-1.5 bg-green-600 text-white text-xs font-bold rounded flex items-center gap-1">
            <span className="w-0 h-0 border-l-[6px] border-l-white border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent" />
            PLAY
          </button>
          <button className="px-4 py-1.5 bg-gray-700 text-white text-xs font-bold rounded">STOP</button>
        </div>
        <div className="flex-1" />
        <div className="text-gray-400 text-sm">120 BPM</div>
      </div>

      {/* Rack Area */}
      <div className="flex-1 bg-[#0d1321] p-4 overflow-auto">
        <div className="grid grid-cols-3 gap-4 min-h-[200px]">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-[#1a2332] rounded border border-gray-700 h-32 flex items-center justify-center text-gray-600">
              Rack Slot {i}
            </div>
          ))}
        </div>
      </div>

      {/* Palette Header */}
      <div className="bg-[#111827] border-t border-gray-800">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800">
          <span className="text-gray-400 text-xs uppercase tracking-wider">Module Palette</span>
          <div className="flex-1" />
          <div className="flex items-center gap-2 bg-[#1a2332] rounded-lg px-3 py-1.5">
            <Search className="w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search modules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-sm text-white placeholder-gray-500 outline-none w-48"
            />
          </div>
          <div className="flex gap-1">
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-cyan-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-cyan-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-1 px-4 py-2 overflow-x-auto">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
              selectedCategory === null ? 'bg-white text-black' : 'bg-[#1a2332] text-gray-400 hover:text-white'
            }`}
          >
            All
          </button>
          {moduleCategories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id === selectedCategory ? null : cat.id)}
              className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                selectedCategory === cat.id ? 'text-black' : 'bg-[#1a2332] text-gray-400 hover:text-white'
              }`}
              style={{ backgroundColor: selectedCategory === cat.id ? cat.color : undefined }}
            >
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
              {cat.name}
            </button>
          ))}
        </div>

        {/* Module Grid */}
        <div className="px-4 pb-4 max-h-[280px] overflow-y-auto">
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-6 gap-2">
              {filteredModules.map(module => (
                <div
                  key={module.id}
                  className="group relative bg-[#1a2332] rounded border border-gray-700 hover:border-gray-500 transition-all cursor-pointer overflow-hidden"
                >
                  <div 
                    className="h-1.5"
                    style={{ backgroundColor: module.color }}
                  />
                  <div className="p-3">
                    <div className="flex items-start justify-between mb-1">
                      <span className="text-white text-xs font-medium truncate">{module.name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(module.id); }}
                        className="text-gray-500 hover:text-yellow-400 transition-colors"
                      >
                        <Star className={`w-3 h-3 ${favorites.has(module.id) ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                      </button>
                    </div>
                    <p className="text-gray-500 text-[10px] line-clamp-2">{module.description}</p>
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {module.tags.slice(0, 2).map(tag => (
                        <span key={tag} className="text-[9px] px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredModules.map(module => (
                <div
                  key={module.id}
                  className="group flex items-center gap-3 p-2 bg-[#1a2332] rounded border border-gray-700 hover:border-gray-500 transition-all cursor-pointer"
                >
                  <div 
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: module.color }}
                  />
                  <span className="text-white text-sm font-medium w-32">{module.name}</span>
                  <span className="text-gray-500 text-xs flex-1">{module.description}</span>
                  <div className="flex gap-1">
                    {module.inputs.map(i => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 bg-gray-800 text-cyan-400 rounded">{i}</span>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    {module.outputs.map(o => (
                      <span key={o} className="text-[9px] px-1.5 py-0.5 bg-gray-800 text-orange-400 rounded">{o}</span>
                    ))}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(module.id); }}
                    className="text-gray-500 hover:text-yellow-400 transition-colors"
                  >
                    <Star className={`w-4 h-4 ${favorites.has(module.id) ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {filteredModules.length === 0 && (
            <div className="text-center py-8 text-gray-500 text-sm">
              No modules found matching your search
            </div>
          )}
        </div>
      </div>

      {/* Piano Keys */}
      <div className="h-20 bg-[#0a0f1a] flex">
        {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C2'].map((note) => (
          <div
            key={note}
            className={`flex-1 ${note.includes('#') ? 'bg-black h-14 z-10 -mx-2' : 'bg-white border border-gray-300'} relative`}
          />
        ))}
      </div>
    </div>
  );
}
