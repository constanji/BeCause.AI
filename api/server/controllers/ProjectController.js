const { logger } = require('@because/data-schemas');
const { getProjects, getProjectById, updateProjectDataSource } = require('~/models/Project');

/**
 * 获取所有项目列表
 * @route GET /api/config/projects
 */
async function listProjectsHandler(req, res) {
  try {
    const { id: userId } = req.user;
    logger.info('[listProjectsHandler] 获取项目列表', { userId });

    const projects = await getProjects(userId);

    res.json({
      success: true,
      data: projects,
    });
  } catch (error) {
    logger.error('[listProjectsHandler] 获取项目列表失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '获取项目列表失败',
    });
  }
}

/**
 * 根据ID获取项目详情
 * @route GET /api/config/projects/:id
 */
async function getProjectHandler(req, res) {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;

    logger.info('[getProjectHandler] 获取项目详情', { id, userId });

    const project = await getProjectById(id);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: '项目不存在',
      });
    }

    res.json({
      success: true,
      data: project,
    });
  } catch (error) {
    logger.error('[getProjectHandler] 获取项目详情失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '获取项目详情失败',
    });
  }
}

/**
 * 更新项目的数据源关联
 * @route PUT /api/config/projects/:id/data-source
 */
async function updateProjectDataSourceHandler(req, res) {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;
    const { data_source_id } = req.body; // 可以是字符串ID或null

    logger.info('[updateProjectDataSourceHandler] 更新项目数据源', { id, userId, data_source_id });

    const project = await getProjectById(id);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: '项目不存在',
      });
    }

    // 更新项目的数据源关联
    const updatedProject = await updateProjectDataSource(id, data_source_id || null);

    res.json({
      success: true,
      data: updatedProject,
      message: data_source_id ? '项目数据源关联成功' : '项目数据源关联已移除',
    });
  } catch (error) {
    logger.error('[updateProjectDataSourceHandler] 更新项目数据源失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '更新项目数据源失败',
    });
  }
}

module.exports = {
  listProjectsHandler,
  getProjectHandler,
  updateProjectDataSourceHandler,
};

