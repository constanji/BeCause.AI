export type DataSourceType = 'mysql' | 'postgresql';

export interface DataSourceConnectionPool {
  min?: number;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export interface DataSource {
  _id: string;
  name: string;
  type: DataSourceType;
  host: string;
  port: number;
  database: string;
  username: string;
  status?: 'active' | 'inactive';
  connectionPool?: DataSourceConnectionPool;
  lastTestedAt?: string;
  lastTestResult?: 'success' | 'failed';
  lastTestError?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DataSourceCreateParams {
  name: string;
  type: DataSourceType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  connectionPool?: DataSourceConnectionPool;
  status?: 'active' | 'inactive';
}

export interface DataSourceUpdateParams {
  name?: string;
  type?: DataSourceType;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  connectionPool?: DataSourceConnectionPool;
  status?: 'active' | 'inactive';
}

export interface DataSourceListResponse {
  success: boolean;
  data: DataSource[];
  error?: string;
}

export interface DataSourceResponse {
  success: boolean;
  data: DataSource;
  message?: string;
  error?: string;
}

export interface DataSourceTestResponse {
  success: boolean;
  message?: string;
  error?: string;
}

