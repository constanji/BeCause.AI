import { Schema, Document, Types } from 'mongoose';

export interface IMongoProject extends Document {
  name: string;
  promptGroupIds: Types.ObjectId[];
  agentIds: string[];
  data_source_id?: Types.ObjectId; // 关联的数据源ID
  createdAt?: Date;
  updatedAt?: Date;
}

const projectSchema = new Schema<IMongoProject>(
  {
    name: {
      type: String,
      required: true,
      index: true,
    },
    promptGroupIds: {
      type: [Schema.Types.ObjectId],
      ref: 'PromptGroup',
      default: [],
    },
    agentIds: {
      type: [String],
      ref: 'Agent',
      default: [],
    },
    data_source_id: {
      type: Schema.Types.ObjectId,
      ref: 'DataSource',
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

export default projectSchema;
