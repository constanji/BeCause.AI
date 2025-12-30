import { Document, Types } from 'mongoose';

export type DataSourceType = 'mysql' | 'postgresql';

export interface IDataSourceConnectionPool {
  min?: number;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export interface IDataSource extends Document {
  name: string;
  type: DataSourceType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string; // 加密存储
  connectionPool?: IDataSourceConnectionPool;
  status?: 'active' | 'inactive';
  lastTestedAt?: Date;
  lastTestResult?: 'success' | 'failed';
  lastTestError?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

