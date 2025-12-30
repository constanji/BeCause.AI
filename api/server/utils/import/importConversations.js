const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const { logger } = require('@because/data-schemas');
const { getImporter } = require('./importers');

/**
 * Job definition for importing a conversation.
 * @param {{ filepath, requestUserId }} job - The job object.
 */
const importConversations = async (job) => {
  const { filepath, requestUserId } = job;
  try {
    logger.debug(`user: ${requestUserId} | Importing conversation(s) from file...`);

    /* error if file is too large */
    const fileInfo = await fs.stat(filepath);
    if (fileInfo.size > process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `File size is ${fileInfo.size} bytes.  It exceeds the maximum limit of ${process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES} bytes.`,
      );
    }

    const fileData = await fs.readFile(filepath, 'utf8');
    const ext = path.extname(filepath).toLowerCase();
    let jsonData;
    
    // 支持 JSON 和 YAML 文件解析
    if (ext === '.yaml' || ext === '.yml') {
      jsonData = yaml.load(fileData);
    } else {
      jsonData = JSON.parse(fileData);
    }
    
    const importer = getImporter(jsonData);
    await importer(jsonData, requestUserId);
    logger.debug(`user: ${requestUserId} | Finished importing conversations`);
  } catch (error) {
    logger.error(`user: ${requestUserId} | Failed to import conversation: `, error);
    throw error; // throw error all the way up so request does not return success
  } finally {
    try {
      await fs.unlink(filepath);
    } catch (error) {
      logger.error(`user: ${requestUserId} | Failed to delete file: ${filepath}`, error);
    }
  }
};

module.exports = importConversations;
