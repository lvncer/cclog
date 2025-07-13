export interface Project {
  encodedName: string;
  path: string;
  sessionCount: number;
  lastActivity: Date;
}

export interface ProjectDisplayItem {
  display: string;
  searchText: string;
  value: string;
  project: Project;
}
