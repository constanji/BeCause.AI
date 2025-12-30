import knowledgeBaseSchema from '~/schema/knowledgeBase';
import type { IKnowledgeEntry } from '~/schema/knowledgeBase';

/**
 * Creates or returns the KnowledgeEntry model using the provided mongoose instance and schema
 */
export function createKnowledgeBaseModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.KnowledgeEntry || mongoose.model<IKnowledgeEntry>('KnowledgeEntry', knowledgeBaseSchema);
}

