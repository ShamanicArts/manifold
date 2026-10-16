import {GraphWorkspace} from '../index.js';
import {Component, PaintUI, LiveSnapshot} from '../live-project.js';
export default function createProject(): {graph:GraphWorkspace; view?:Component[]; paint?:(ui:PaintUI, accepted:LiveSnapshot)=>void};
