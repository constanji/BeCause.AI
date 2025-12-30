import dataSourceSchema from '~/schema/dataSource';
import type { IDataSource } from '~/types';

/**
 * Creates or returns the DataSource model using the provided mongoose instance and schema
 */
export function createDataSourceModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.DataSource || mongoose.model<IDataSource>('DataSource', dataSourceSchema);
}

