'use server';
import { db } from '@/lib/db/index';

/**
 * 创建图像数据集
 */
export async function createImageDataset(projectId, datasetData) {
  try {
    return await db.imageDatasets.create({
      data: {
        projectId,
        ...datasetData
      }
    });
  } catch (error) {
    console.error('Failed to create image dataset:', error);
    throw error;
  }
}

/**
 * 获取图片的数据集列表
 */
export async function getImageDatasets(imageId, page = 1, pageSize = 10) {
  try {
    const [data, total] = await Promise.all([
      db.imageDatasets.findMany({
        where: { imageId },
        orderBy: {
          createAt: 'desc'
        },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      db.imageDatasets.count({
        where: { imageId }
      })
    ]);

    return { data, total };
  } catch (error) {
    console.error('Failed to get image datasets:', error);
    throw error;
  }
}

/**
 * 更新图像数据集
 */
export async function updateImageDataset(datasetId, updateData) {
  try {
    return await db.imageDatasets.update({
      where: { id: datasetId },
      data: updateData
    });
  } catch (error) {
    console.error('Failed to update image dataset:', error);
    throw error;
  }
}

/**
 * 删除图像数据集
 */
export async function deleteImageDataset(datasetId) {
  try {
    return await db.imageDatasets.delete({
      where: { id: datasetId }
    });
  } catch (error) {
    console.error('Failed to delete image dataset:', error);
    throw error;
  }
}

/**
 * 根据项目ID获取所有图像数据集
 */
export async function getImageDatasetsByProject(projectId, page = 1, pageSize = 10) {
  try {
    const [data, total] = await Promise.all([
      db.imageDatasets.findMany({
        where: { projectId },
        include: {
          image: {
            select: {
              imageName: true,
              path: true
            }
          }
        },
        orderBy: {
          createAt: 'desc'
        },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      db.imageDatasets.count({
        where: { projectId }
      })
    ]);

    return { data, total };
  } catch (error) {
    console.error('Failed to get image datasets by project:', error);
    throw error;
  }
}
