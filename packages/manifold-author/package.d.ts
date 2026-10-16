import type { GraphWorkspaceProject, ParameterEdit, PreparedRoute } from './index.js';
import type { GraphEvent, EventAdmission } from './browser.js';

export interface ProjectPackage {
  readonly format: 'manifold.package';
  readonly schemaVersion: 1;
  readonly packageId: string;
  readonly packageVersion: string;
  readonly control: Readonly<{
    language: 'javascript';
    format: 'iife';
    bundle: string;
    sha256: string;
  }>;
  readonly state: GraphWorkspaceProject;
}

export interface PackageHost {
  readPublishedParameters?(): readonly ParameterEdit[] | Promise<readonly ParameterEdit[]>;
  setParameter(edit: ParameterEdit): Promise<void | boolean> | void | boolean;
  setRoute(route: PreparedRoute): Promise<void | boolean> | void | boolean;
  replaceGraph?(project: GraphWorkspaceProject): Promise<void | boolean> | void | boolean;
  setParameterBatch?(edits: readonly ParameterEdit[]): Promise<void | boolean> | void | boolean;
  sendEvent?(event: GraphEvent): void | Promise<EventAdmission | void>;
}

export interface PackageController {
  synchronizeParameters?(): Promise<GraphWorkspaceProject>;
  adoptPublishedParameters?(edits: readonly ParameterEdit[]): Promise<GraphWorkspaceProject>;
  toProject(): GraphWorkspaceProject;
  set?(path: string, value: number): Promise<GraphWorkspaceProject>;
}

export function readProjectPackage(input: string | ProjectPackage): Promise<ProjectPackage>;
export function instantiateProjectPackage<T extends PackageController = PackageController>(input: string | ProjectPackage, host: PackageHost): Promise<{
  package: ProjectPackage;
  controller: T;
}>;
export function saveProjectPackage(packaged: ProjectPackage, project: GraphWorkspaceProject): ProjectPackage;
