'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Container, Box, Typography, Button, CircularProgress } from '@mui/material';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import { toast } from 'sonner';
import axios from 'axios';

import ImageFilters from './components/ImageFilters';
import ImageGrid from './components/ImageGrid';
import ImportDialog from './components/ImportDialog';
import QuestionDialog from './components/QuestionDialog';
import DatasetDialog from './components/DatasetDialog';

export default function ImagesPage() {
  const { projectId } = useParams();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  // 筛选条件
  const [imageName, setImageName] = useState('');
  const [hasQuestions, setHasQuestions] = useState('all');
  const [hasDatasets, setHasDatasets] = useState('all');

  // 对话框状态
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [questionDialogOpen, setQuestionDialogOpen] = useState(false);
  const [datasetDialogOpen, setDatasetDialogOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  // 获取图片列表
  const fetchImages = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString()
      });

      if (imageName) params.append('imageName', imageName);
      if (hasQuestions !== 'all') params.append('hasQuestions', hasQuestions);
      if (hasDatasets !== 'all') params.append('hasDatasets', hasDatasets);

      const response = await axios.get(`/api/projects/${projectId}/images?${params.toString()}`);
      setImages(response.data.data);
      setTotal(response.data.total);
    } catch (error) {
      console.error('Failed to fetch images:', error);
      toast.error(t('common.fetchError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
  }, [projectId, page, imageName, hasQuestions, hasDatasets]);

  // 处理导入成功
  const handleImportSuccess = () => {
    setImportDialogOpen(false);
    setPage(1);
    fetchImages();
  };

  // 处理生成问题
  const handleGenerateQuestions = image => {
    setSelectedImage(image);
    setQuestionDialogOpen(true);
  };

  // 处理生成数据集
  const handleGenerateDataset = image => {
    setSelectedImage(image);
    setDatasetDialogOpen(true);
  };

  // 处理删除图片
  const handleDeleteImage = async imageId => {
    // 显示确认对话框
    const confirmed = window.confirm(t('images.deleteConfirm') || '确定要删除这张图片吗？');
    if (!confirmed) {
      return;
    }

    try {
      await axios.delete(`/api/projects/${projectId}/images?imageId=${imageId}`);
      toast.success(t('images.deleteSuccess'));
      fetchImages();
    } catch (error) {
      console.error('Failed to delete image:', error);
      toast.error(t('images.deleteFailed'));
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1">
          {t('images.title')}
        </Typography>
        <Button variant="contained" startIcon={<AddPhotoAlternateIcon />} onClick={() => setImportDialogOpen(true)}>
          {t('images.importImages')}
        </Button>
      </Box>

      <ImageFilters
        imageName={imageName}
        onImageNameChange={setImageName}
        hasQuestions={hasQuestions}
        onHasQuestionsChange={setHasQuestions}
        hasDatasets={hasDatasets}
        onHasDatasetsChange={setHasDatasets}
      />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <ImageGrid
          images={images}
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onGenerateQuestions={handleGenerateQuestions}
          onGenerateDataset={handleGenerateDataset}
          onDelete={handleDeleteImage}
        />
      )}

      <ImportDialog
        open={importDialogOpen}
        projectId={projectId}
        onClose={() => setImportDialogOpen(false)}
        onSuccess={handleImportSuccess}
      />

      <QuestionDialog
        open={questionDialogOpen}
        projectId={projectId}
        image={selectedImage}
        onClose={() => setQuestionDialogOpen(false)}
        onSuccess={fetchImages}
      />

      <DatasetDialog
        open={datasetDialogOpen}
        projectId={projectId}
        image={selectedImage}
        onClose={() => setDatasetDialogOpen(false)}
        onSuccess={fetchImages}
      />
    </Container>
  );
}
