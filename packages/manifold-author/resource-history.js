// Control-side resource compatibility. PCM comparison never runs in audio.
export function resourceTransfers(previous, next, identity) {
  if (!previous) return [];
  const effectiveAssets = project => {
    const assets = new Map((project.assets ?? []).map(asset => [asset.nodeId, asset]));
    for (const binding of project.sampleBindings ?? []) assets.set(binding.nodeId, assets.get(binding.sourceNodeId));
    return assets;
  };
  const oldAssets = effectiveAssets(previous), newAssets = effectiveAssets(next);
  return identity.filter(pair => {
    const node = next.signal.nodes.find(node => node.id === pair.nextId);
    if (node.type === 'phase-vocoder' || node.type === 'sample-instrument' || node.type === 'granulator') return true; // Rust also checks capture size and upstream audio identity.
    if (!['sample-region', 'sample-instrument'].includes(node.type)) return false;
    if (node.type === 'sample-region' && next.signal.initialParameters.some(p => p.nodeId === pair.nextId && p.id === 7 && p.value >= .5)) return false;
    const old = oldAssets.get(pair.previousId), asset = newAssets.get(pair.nextId);
    return Boolean(old) === Boolean(asset) && (!asset || old.sourceRate === asset.sourceRate
      && old.frames === asset.frames && old.pcmF32Base64 === asset.pcmF32Base64);
  });
}
