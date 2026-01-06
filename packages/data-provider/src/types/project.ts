export interface Project {
  _id: string;
  name: string;
  promptGroupIds?: string[];
  agentIds?: string[];
  data_source_id?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectListResponse {
  success: boolean;
  data: Project[];
  error?: string;
}

export interface ProjectResponse {
  success: boolean;
  data: Project;
  error?: string;
}

