import { NextResponse } from 'next/server';
import { getImages, createImages, deleteImage, getImageDetail } from '@/lib/db/images';
import { getProjectPath } from '@/lib/db/base';
import fs from 'fs/promises';
import path from 'path';
import sizeOf from 'image-size';

// 获取图片列表
export async function GET(request, { params }) {
  try {
    const { projectId } = params;
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get('page')) || 1;
    const pageSize = parseInt(searchParams.get('pageSize')) || 20;
    const imageName = searchParams.get('imageName') || '';
    const hasQuestions = searchParams.get('hasQuestions');
    const hasDatasets = searchParams.get('hasDatasets');
    const simple = searchParams.get('simple');

    const result = await getImages(projectId, page, pageSize, imageName, hasQuestions, hasDatasets, simple);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to get images:', error);
    return NextResponse.json({ error: error.message || 'Failed to get images' }, { status: 500 });
  }
}

// 导入图片
export async function POST(request, { params }) {
  try {
    const { projectId } = params;
    const { directories } = await request.json();

    if (!directories || !Array.isArray(directories) || directories.length === 0) {
      return NextResponse.json({ error: '请选择至少一个目录' }, { status: 400 });
    }

    // 项目图片目录
    const projectPath = await getProjectPath(projectId);
    const projectImagesDir = path.join(projectPath, 'images');
    await fs.mkdir(projectImagesDir, { recursive: true });

    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
    const importedImages = [];

    // 遍历所有选择的目录
    for (const directory of directories) {
      try {
        const files = await fs.readdir(directory);

        for (const file of files) {
          const ext = path.extname(file).toLowerCase();
          if (!imageExtensions.includes(ext)) continue;

          const sourcePath = path.join(directory, file);
          const destPath = path.join(projectImagesDir, file);

          // 复制文件（覆盖同名文件）
          await fs.copyFile(sourcePath, destPath);

          // 获取图片信息
          const stats = await fs.stat(destPath);
          let dimensions = { width: null, height: null };

          try {
            const size = sizeOf(destPath);
            dimensions = { width: size.width, height: size.height };
          } catch (err) {
            console.warn(`无法获取图片尺寸: ${file}`, err);
          }

          importedImages.push({
            imageName: file,
            path: `/local-db/${projectId}/images/${file}`,
            size: stats.size,
            width: dimensions.width,
            height: dimensions.height
          });
        }
      } catch (err) {
        console.error(`处理目录失败: ${directory}`, err);
      }
    }

    // 批量保存到数据库
    const savedImages = await createImages(projectId, importedImages);

    return NextResponse.json({
      success: true,
      count: savedImages.length,
      images: savedImages
    });
  } catch (error) {
    console.error('Failed to import images:', error);
    return NextResponse.json({ error: error.message || 'Failed to import images' }, { status: 500 });
  }
}

// 删除图片
export async function DELETE(request, { params }) {
  try {
    const { projectId } = params;
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get('imageId');

    if (!imageId) {
      return NextResponse.json({ error: '缺少图片ID' }, { status: 400 });
    }

    // 获取图片信息
    const image = await getImageDetail(imageId);

    if (!image) {
      return NextResponse.json({ error: '图片不存在' }, { status: 404 });
    }

    // 删除文件
    const projectPath = await getProjectPath(projectId);
    const filePath = path.join(projectPath, 'images', image.imageName);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      console.warn('删除文件失败:', err);
    }

    // 删除数据库记录
    await deleteImage(imageId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete image:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete image' }, { status: 500 });
  }
}
