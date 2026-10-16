// Compare drawing samples against the actual read-only legacy Lua helper.
import {execFileSync} from 'node:child_process';
import {oscillatorPreviewCurves} from '../packages/manifold-author/examples/oscillator-preview.mjs';
const cases=[];for(let waveform=0;waveform<8;waveform++)for(let renderMode=0;renderMode<2;renderMode++)for(let driveShape=0;driveShape<4;driveShape++)cases.push({waveform,renderMode,driveShape,drive:7,driveBias:.4,pulseWidth:.31,additivePartials:8,additiveTilt:.3,additiveDrift:.5});
const state=c=>`{waveformType=${c.waveform},renderMode=${c.renderMode},driveAmount=${c.drive},driveShape=${c.driveShape},driveBias=${c.driveBias},pulseWidth=${c.pulseWidth},additivePartials=${c.additivePartials},additiveTilt=${c.additiveTilt},additiveDrift=${c.additiveDrift}}`;
// Stock Lua 5.x lacks tanh; supply the standard identity used by Lua math libraries.
const lua=`math.tanh=math.tanh or function(x) local e=math.exp(2*x) return (e-1)/(e+1) end\nlocal P=dofile('/home/shamanic/dev/my-plugin/UserScripts/projects/Main/lib/ui/oscillator_preview.lua')\nlocal cases={${cases.map(state).join(',')}}\nfor index,state in ipairs(cases) do for _,d in ipairs(P.buildWaveDisplay(state,200,132)) do if d.cmd=='drawLine' and (d.color >> 24)==64 then print(index,d.x2,d.y2) end end end\n`;
const rows=execFileSync('lua',['-'],{input:lua,encoding:'utf8'}).trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
const models=cases.map(oscillatorPreviewCurves),indices=cases.map(()=>1);let maxPixelError=0;
for(const [index,x,y] of rows){const p=models[index-1].wave[indices[index-1]++];if(!p)throw Error('Legacy drawing count mismatch');const error=Math.max(Math.abs(Math.floor(p[0]*200)-x),Math.abs(Math.floor(p[1]*132)-y));maxPixelError=Math.max(error,maxPixelError);if(error>1)throw Error(`Legacy preview mismatch ${index}: ${error} pixels`);}
for(let i=0;i<models.length;i++)if(indices[i]!==models[i].wave.length)throw Error('Missing legacy points');
console.log(JSON.stringify({legacy:'/Main/lib/ui/oscillator_preview.lua',cases:cases.length,comparedSegments:rows.length,maxPixelError,scope:'static waveform, additive recipes, drive shapes/bias; visual only, no audio parity claim'}));
