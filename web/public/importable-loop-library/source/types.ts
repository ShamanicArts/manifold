import {BrowserGraphHost} from '@manifold/author/browser';
import {createProject} from '@manifold/author/examples/loop-authoring';
declare const host:BrowserGraphHost;
const project=createProject(host);project.layers.record(1,true);project.snapshot();host.captureCursor(80);
// @ts-expect-error four layers only
project.layers.play(5,true);
