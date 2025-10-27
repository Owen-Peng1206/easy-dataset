'use client';

import { useState } from 'react';
import {
  Grid,
  Card,
  CardMedia,
  CardContent,
  CardActions,
  Typography,
  Chip,
  Box,
  Pagination,
  Tooltip,
  Dialog,
  DialogContent,
  IconButton
} from '@mui/material';
import QuestionMarkIcon from '@mui/icons-material/QuestionMark';
import DatasetIcon from '@mui/icons-material/Dataset';
import DeleteIcon from '@mui/icons-material/Delete';
import { useTranslation } from 'react-i18next';

export default function ImageGrid({
  images,
  total,
  page,
  pageSize,
  onPageChange,
  onGenerateQuestions,
  onGenerateDataset,
  onDelete
}) {
  const { t } = useTranslation();
  const [previewImage, setPreviewImage] = useState(null);

  if (!images || images.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6" color="text.secondary">
          {t('images.noImages')}
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <Grid container spacing={3}>
        {images.map(image => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={image.id}>
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardMedia
                component="img"
                height="200"
                image={image.base64 || image.path}
                alt={image.imageName}
                sx={{ objectFit: 'cover', bgcolor: 'grey.200', cursor: 'pointer' }}
                onClick={() => setPreviewImage(image)}
              />
              <CardContent sx={{ flexGrow: 1 }}>
                <Tooltip title={image.imageName}>
                  <Typography variant="subtitle2" noWrap gutterBottom>
                    {image.imageName}
                  </Typography>
                </Tooltip>
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  <Chip
                    label={`${image.questionCount || 0} ${t('images.questions')}`}
                    size="small"
                    color={image.questionCount > 0 ? 'primary' : 'default'}
                    variant="outlined"
                  />
                  <Chip
                    label={`${image.datasetCount || 0} ${t('images.datasets')}`}
                    size="small"
                    color={image.datasetCount > 0 ? 'secondary' : 'default'}
                    variant="outlined"
                  />
                </Box>
                {image.width && image.height && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    {image.width} × {image.height}
                  </Typography>
                )}
              </CardContent>
              <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
                <Box>
                  <Tooltip title={t('images.generateQuestions')}>
                    <IconButton size="small" color="primary" onClick={() => onGenerateQuestions(image)}>
                      <QuestionMarkIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('images.generateDataset')}>
                    <IconButton size="small" color="secondary" onClick={() => onGenerateDataset(image)}>
                      <DatasetIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Tooltip title={t('common.delete')}>
                  <IconButton size="small" color="error" onClick={() => onDelete(image.id)}>
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {total > pageSize && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <Pagination
            count={Math.ceil(total / pageSize)}
            page={page}
            onChange={(_, newPage) => onPageChange(newPage)}
            color="primary"
          />
        </Box>
      )}

      {/* 图片预览对话框 */}
      <Dialog
        open={!!previewImage}
        onClose={() => setPreviewImage(null)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'transparent',
            boxShadow: 'none',
            overflow: 'hidden'
          }
        }}
      >
        <DialogContent
          sx={{ p: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {previewImage && (
            <Box sx={{ width: '100%', textAlign: 'center' }}>
              <img
                src={previewImage.base64 || previewImage.path}
                alt={previewImage.imageName}
                style={{
                  maxWidth: '100%',
                  maxHeight: '90vh',
                  objectFit: 'contain'
                }}
              />
              <Typography
                variant="caption"
                sx={{ display: 'block', mt: 2, color: 'white', textShadow: '0 0 4px rgba(0,0,0,0.8)' }}
              >
                {previewImage.imageName}
              </Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
