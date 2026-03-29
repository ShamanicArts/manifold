import { useState, useMemo } from 'react';
import type { RackModule } from '@/types/modules';
import { moduleCategories, mockModules } from '@/types/modules';
import { Search, ChevronRight, Command, CornerDownLeft, Hash, ArrowUpDown } from 'lucide-react';

export default function Mockup5_MinimalistList() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'category'>('name');
  const [selectedModule, setSelectedModule] = useState<RackModule | null>(null);

  const filteredModules = useMemo(() => {
    let modules = [...mockModules];
    
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
    
    modules.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return a.category.localeCompare(b.category);
    });
    
    return modules;
  }, [searchQuery, selectedCategory, sortBy]);

  const groupedModules = useMemo(() => {
    const grouped: Record<string, RackModule[]> = {};
    filteredModules.forEach(m => {
      const key = sortBy === 'category' ? m.category : m.name[0].toUpperCase();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    });
    return grouped;
  }, [filteredModules, sortBy]);

  const getCategoryName = (id: string) => {
    return moduleCategories.find(c => c.id === id)?.name || id;
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Top Bar */}
      <div className="h-14 border-b border-gray-200 flex items-center px-6">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-black rounded-md flex items-center justify-center">
            <span className="text-white text-xs font-bold">M</span>
          </div>
          <span className="text-gray-900 font-semibold">manifold</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <button className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition-colors">
            <div className="w-2.5 h-2.5 bg-red-500 rounded-full" />
          </button>
          <button className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition-colors">
            <div className="w-0 h-0 border-l-[8px] border-l-gray-700 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent ml-0.5" />
          </button>
          <button className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition-colors">
            <div className="w-2.5 h-2.5 bg-gray-700" />
          </button>
        </div>
        <div className="flex-1" />
        <div className="text-gray-500 text-sm font-mono">120 BPM</div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-64 border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search modules..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}

                className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 transition-colors"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <Command className="w-3 h-3 text-gray-400" />
                <span className="text-xs text-gray-400">K</span>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            <div className="text-gray-400 text-xs font-medium uppercase tracking-wider px-3 mb-2">Categories</div>
            <button
              onClick={() => setSelectedCategory(null)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedCategory === null ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span>All Modules</span>
              <span className={`text-xs ${selectedCategory === null ? 'text-gray-400' : 'text-gray-400'}`}>
                {mockModules.length}
              </span>
            </button>
            
            {moduleCategories.map(cat => {
              const count = mockModules.filter(m => m.category === cat.id).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id === selectedCategory ? null : cat.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedCategory === cat.id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span>{cat.name}</span>
                  </div>
                  <span className={`text-xs ${selectedCategory === cat.id ? 'text-gray-400' : 'text-gray-400'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="p-3 border-t border-gray-200">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <CornerDownLeft className="w-3 h-3" />
              <span>to add module</span>
            </div>
          </div>
        </div>

        {/* Module List */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="h-12 border-b border-gray-200 flex items-center px-4 gap-4">
            <button 
              onClick={() => setSortBy('name')}
              className={`flex items-center gap-1.5 text-sm transition-colors ${sortBy === 'name' ? 'text-gray-900 font-medium' : 'text-gray-500'}`}
            >
              <Hash className="w-4 h-4" />
              Name
            </button>
            <button 
              onClick={() => setSortBy('category')}
              className={`flex items-center gap-1.5 text-sm transition-colors ${sortBy === 'category' ? 'text-gray-900 font-medium' : 'text-gray-500'}`}
            >
              <ArrowUpDown className="w-4 h-4" />
              Category
            </button>
            <div className="flex-1" />
            <span className="text-gray-400 text-sm">{filteredModules.length} results</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {Object.entries(groupedModules).map(([group, modules]) => (
              <div key={group}>
                <div className="sticky top-0 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-100">
                  {sortBy === 'category' ? getCategoryName(group) : group}
                </div>
                <div className="divide-y divide-gray-100">
                  {modules.map(module => (
                    <div
                      key={module.id}
                      onClick={() => setSelectedModule(module)}
                      className={`group flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50 ${
                        selectedModule?.id === module.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div 
                        className="w-1 h-8 rounded-full"
                        style={{ backgroundColor: module.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-900 font-medium">{module.name}</span>
                          <span className="text-gray-400 text-sm">{getCategoryName(module.category)}</span>
                        </div>
                        <div className="text-gray-500 text-sm truncate">{module.description}</div>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {module.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel - Details */}
        <div className="w-80 border-l border-gray-200 bg-gray-50 p-6 overflow-y-auto">
          {selectedModule ? (
            <div>
              <div 
                className="w-16 h-16 rounded-2xl mb-4 flex items-center justify-center"
                style={{ backgroundColor: `${selectedModule.color}15` }}
              >
                <div 
                  className="w-8 h-8 rounded-lg"
                  style={{ backgroundColor: selectedModule.color }}
                />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-1">{selectedModule.name}</h2>
              <p className="text-gray-500 text-sm mb-6">{selectedModule.description}</p>
              
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Category</div>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: selectedModule.color }}
                    />
                    <span className="text-gray-700">{getCategoryName(selectedModule.category)}</span>
                  </div>
                </div>
                
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Inputs</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedModule.inputs.map(i => (
                      <span key={i} className="text-sm px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg">
                        {i}
                      </span>
                    ))}
                  </div>
                </div>
                
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Outputs</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedModule.outputs.map(o => (
                      <span key={o} className="text-sm px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg">
                        {o}
                      </span>
                    ))}
                  </div>
                </div>
                
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Tags</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedModule.tags.map(t => (
                      <span key={t} className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              
              <button className="w-full mt-6 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors">
                Add to Rack
              </button>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <div className="w-12 h-12 rounded-xl bg-gray-200 mb-3" />
              <p className="text-sm">Select a module to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Rack Preview */}
      <div className="h-24 border-t border-gray-200 bg-gray-50 p-3">
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Rack</div>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="w-20 h-12 bg-white border border-gray-200 rounded-lg border-dashed" />
          ))}
        </div>
      </div>

      {/* Keyboard */}
      <div className="h-14 bg-white border-t border-gray-200 flex">
        {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C'].map((note, i) => (
          <div
            key={i}
            className={`flex-1 ${note.includes('#') ? 'bg-gray-900 h-10 -mx-2 z-10' : 'bg-white border-r border-gray-200'}`}
          />
        ))}
      </div>
    </div>
  );
}
