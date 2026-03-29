import { useState, useMemo } from 'react';
import type { RackModule } from '@/types/modules';
import { moduleCategories, mockModules } from '@/types/modules';
import { Search, Sparkles, Zap, Waves, Box, Layers, Sliders, Music, Settings } from 'lucide-react';

const iconMap: Record<string, React.ElementType> = {
  wave: Waves,
  filter: Sliders,
  envelope: Box,
  pulse: Zap,
  sparkles: Sparkles,
  sliders: Sliders,
  list: Layers,
  settings: Settings,
  music: Music,
};

export default function Mockup3_TagCloud() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [hoveredModule, setHoveredModule] = useState<RackModule | null>(null);
  const [recentModules, setRecentModules] = useState<string[]>([]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    mockModules.forEach(m => m.tags.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, []);

  const filteredModules = useMemo(() => {
    let modules = mockModules;
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      modules = modules.filter(m => 
        m.name.toLowerCase().includes(q) || 
        m.description.toLowerCase().includes(q)
      );
    }
    
    if (selectedTags.size > 0) {
      modules = modules.filter(m => 
        Array.from(selectedTags).some(tag => m.tags.includes(tag))
      );
    }
    
    return modules;
  }, [searchQuery, selectedTags]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const addToRecent = (moduleId: string) => {
    setRecentModules(prev => {
      const next = [moduleId, ...prev.filter(id => id !== moduleId)].slice(0, 5);
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-[#1a1a2e] to-[#16213e]">
      {/* Top Bar */}
      <div className="h-14 bg-[#0f0f23]/80 backdrop-blur border-b border-white/10 flex items-center px-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">Manifold</span>
        </div>
        <div className="flex-1" />
        <div className="flex gap-3">
          <button className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center hover:bg-red-500/30 transition-colors">
            <div className="w-3 h-3 bg-red-500 rounded-full" />
          </button>
          <button className="w-10 h-10 rounded-full bg-green-500/20 border border-green-500/50 flex items-center justify-center hover:bg-green-500/30 transition-colors">
            <div className="w-0 h-0 border-l-[10px] border-l-green-500 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent ml-1" />
          </button>
          <button className="w-10 h-10 rounded-full bg-gray-500/20 border border-gray-500/50 flex items-center justify-center hover:bg-gray-500/30 transition-colors">
            <div className="w-3 h-3 bg-gray-400" />
          </button>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-4 text-white/60 text-sm">
          <span>120 BPM</span>
          <span>4/4</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Tag Cloud */}
        <div className="w-72 bg-[#0f0f23]/50 backdrop-blur border-r border-white/10 p-4 overflow-y-auto">
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                placeholder="Find modules..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/40 outline-none focus:border-violet-500/50 transition-colors"
              />
            </div>
          </div>

          <div className="mb-6">
            <div className="text-white/40 text-xs uppercase tracking-wider mb-3">Categories</div>
            <div className="flex flex-wrap gap-2">
              {moduleCategories.map(cat => {
                const Icon = iconMap[cat.icon] || Box;
                return (
                  <button
                    key={cat.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all text-xs text-white/70"
                  >
                    <Icon className="w-3 h-3" style={{ color: cat.color }} />
                    {cat.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-white/40 text-xs uppercase tracking-wider mb-3">Tags</div>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map(tag => {
                const isSelected = selectedTags.has(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-2.5 py-1 rounded-full text-[11px] transition-all ${
                      isSelected 
                        ? 'bg-violet-500 text-white' 
                        : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {recentModules.length > 0 && (
            <div className="mt-6">
              <div className="text-white/40 text-xs uppercase tracking-wider mb-3">Recent</div>
              <div className="space-y-1">
                {recentModules.map(id => {
                  const m = mockModules.find(mod => mod.id === id);
                  if (!m) return null;
                  return (
                    <div key={id} className="flex items-center gap-2 p-2 rounded-lg bg-white/5 text-xs text-white/60">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                      {m.name}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Center - Module Tiles */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="grid grid-cols-4 gap-4">
            {filteredModules.map(module => (
              <div
                key={module.id}
                onMouseEnter={() => setHoveredModule(module)}
                onMouseLeave={() => setHoveredModule(null)}
                onClick={() => addToRecent(module.id)}
                className="group relative aspect-square rounded-2xl bg-white/5 border border-white/10 hover:border-white/30 hover:bg-white/10 transition-all cursor-pointer overflow-hidden"
              >
                <div 
                  className="absolute top-0 left-0 right-0 h-1"
                  style={{ backgroundColor: module.color }}
                />
                <div className="p-4 h-full flex flex-col">
                  <div className="flex items-start justify-between mb-2">
                    <div 
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${module.color}20` }}
                    >
                      <Box className="w-4 h-4" style={{ color: module.color }} />
                    </div>
                  </div>
                  <div className="mt-auto">
                    <div className="text-white text-sm font-medium mb-1">{module.name}</div>
                    <div className="text-white/40 text-xs line-clamp-2">{module.description}</div>
                  </div>
                </div>
                
                {/* Hover Preview */}
                {hoveredModule?.id === module.id && (
                  <div className="absolute inset-0 bg-[#1a1a2e]/95 backdrop-blur p-3 flex flex-col justify-center">
                    <div className="text-white text-xs font-medium mb-2">{module.name}</div>
                    <div className="flex gap-1 flex-wrap mb-2">
                      {module.inputs.map(i => (
                        <span key={i} className="text-[9px] px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded">{i}</span>
                      ))}
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {module.outputs.map(o => (
                        <span key={o} className="text-[9px] px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded">{o}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel - Preview */}
        <div className="w-64 bg-[#0f0f23]/50 backdrop-blur border-l border-white/10 p-4">
          {hoveredModule ? (
            <div>
              <div 
                className="w-full aspect-video rounded-xl mb-4 flex items-center justify-center"
                style={{ backgroundColor: `${hoveredModule.color}15` }}
              >
                <Box className="w-12 h-12" style={{ color: hoveredModule.color, opacity: 0.5 }} />
              </div>
              <div className="text-white font-medium mb-1">{hoveredModule.name}</div>
              <div className="text-white/50 text-sm mb-4">{hoveredModule.description}</div>
              <div className="space-y-3">
                <div>
                  <div className="text-white/30 text-xs uppercase mb-1">Inputs</div>
                  <div className="flex flex-wrap gap-1">
                    {hoveredModule.inputs.map(i => (
                      <span key={i} className="text-xs px-2 py-1 bg-white/10 text-cyan-400 rounded">{i}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-white/30 text-xs uppercase mb-1">Outputs</div>
                  <div className="flex flex-wrap gap-1">
                    {hoveredModule.outputs.map(o => (
                      <span key={o} className="text-xs px-2 py-1 bg-white/10 text-orange-400 rounded">{o}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-white/30 text-xs uppercase mb-1">Tags</div>
                  <div className="flex flex-wrap gap-1">
                    {hoveredModule.tags.map(t => (
                      <span key={t} className="text-xs px-2 py-1 bg-violet-500/20 text-violet-400 rounded">{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-white/30 text-sm">
              Hover a module for details
            </div>
          )}
        </div>
      </div>

      {/* Rack Strip */}
      <div className="h-24 bg-[#0f0f23]/80 backdrop-blur border-t border-white/10 p-3">
        <div className="text-white/30 text-xs uppercase mb-2">Active Rack</div>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="w-24 h-14 rounded-lg bg-white/5 border border-white/10 border-dashed" />
          ))}
        </div>
      </div>

      {/* Keyboard */}
      <div className="h-16 bg-[#0a0a1a] flex relative">
        {['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'].map((note) => (
          <div key={note} className="flex-1 bg-white border-r border-gray-300" />
        ))}
        {['C#', 'D#', 'F#', 'G#', 'A#'].map((note, i) => {
          const positions = ['12.5%', '25%', '50%', '62.5%', '75%'];
          return (
            <div
              key={note}
              className="absolute w-6 h-10 bg-black"
              style={{ left: positions[i] }}
            />
          );
        })}
      </div>
    </div>
  );
}
