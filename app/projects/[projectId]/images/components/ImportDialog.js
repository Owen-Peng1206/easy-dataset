'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  IconButton,
  CircularProgress,
  Alert,
  TextField,
  Tabs,
  Tab,
  Paper
} from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DeleteIcon from '@mui/icons-material/Delete';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import axios from 'axios';

export default function ImportDialog({ open, projectId, onClose, onSuccess }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState(0); // 0: 目录导入, 1: PDF 导入
  const [directories, setDirectories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputPath, setInputPath] = useState('');
  const [selectedPdf, setSelectedPdf] = useState(null);

  const handleAddDirectory = () => {
    if (inputPath.trim() && !directories.includes(inputPath.trim())) {
      setDirectories([...directories, inputPath.trim()]);
      setInputPath('');
    }
  };

  const handleRemoveDirectory = index => {
    setDirectories(directories.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    if (directories.length === 0) {
      toast.error(t('images.selectAtLeastOne'));
      return;
    }

    try {
      setLoading(true);
      const response = await axios.post(`/api/projects/${projectId}/images`, {
        directories
      });

      toast.success(t('images.importSuccess', { count: response.data.count }));
      setDirectories([]);
      onSuccess?.();
    } catch (error) {
      console.error('Failed to import images:', error);
      toast.error(error.response?.data?.error || t('images.importFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handlePdfSelect = event => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setSelectedPdf(file);
    } else {
      toast.error(t('images.invalidPdfFile', { defaultValue: '请选择有效的 PDF 文件' }));
    }
  };

  const handlePdfImport = async () => {
    if (!selectedPdf) {
      toast.error(t('images.selectPdfFile', { defaultValue: '请选择 PDF 文件' }));
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('file', selectedPdf);

      // 调用 PDF 转换 API
      const response = await axios.post(`/api/projects/${projectId}/images/pdf-convert`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      toast.success(
        t('images.pdfImportSuccess', {
          defaultValue: `成功从 PDF "${response.data.pdfName}" 导入 ${response.data.count} 张图片`,
          count: response.data.count,
          name: response.data.pdfName
        })
      );
      setSelectedPdf(null);
      onSuccess?.();
    } catch (error) {
      console.error('Failed to import PDF:', error);
      toast.error(error.response?.data?.error || t('images.pdfImportFailed', { defaultValue: 'PDF 导入失败' }));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setDirectories([]);
      setSelectedPdf(null);
      setMode(0);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('images.importImages')}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Tabs
          value={mode}
          onChange={(e, newValue) => setMode(newValue)}
          sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab
            label={t('images.importFromDirectory', { defaultValue: '从目录导入' })}
            icon={<FolderOpenIcon />}
            iconPosition="start"
          />
          <Tab
            label={t('images.importFromPdf', { defaultValue: '从 PDF 导入' })}
            icon={<PictureAsPdfIcon />}
            iconPosition="start"
          />
        </Tabs>

        {mode === 0 ? (
          <>
            <Alert severity="info" sx={{ mb: 2 }}>
              {t('images.importTip')}
            </Alert>

            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField
                fullWidth
                size="small"
                label={t('images.directoryPath')}
                placeholder={t('images.enterDirectoryPath')}
                value={inputPath}
                onChange={e => setInputPath(e.target.value)}
                onKeyPress={e => {
                  if (e.key === 'Enter') {
                    handleAddDirectory();
                  }
                }}
                disabled={loading}
              />
              <Button
                variant="contained"
                startIcon={<FolderOpenIcon />}
                onClick={handleAddDirectory}
                disabled={loading || !inputPath.trim()}
              >
                {t('common.add')}
              </Button>
            </Box>

            {directories.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  {t('images.selectedDirectories')} ({directories.length})
                </Typography>
                <List dense>
                  {directories.map((dir, index) => (
                    <ListItem
                      key={index}
                      secondaryAction={
                        <IconButton edge="end" onClick={() => handleRemoveDirectory(index)} disabled={loading}>
                          <DeleteIcon />
                        </IconButton>
                      }
                    >
                      <ListItemText primary={dir} />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </>
        ) : (
          <>
            <Alert severity="info" sx={{ mb: 2 }}>
              {t('images.pdfImportTip', { defaultValue: '选择 PDF 文件，系统会自动将其转换为图片并导入' })}
            </Alert>

            <Paper
              variant="outlined"
              sx={{
                p: 4,
                textAlign: 'center',
                cursor: 'pointer',
                bgcolor: 'background.default',
                border: '2px dashed',
                borderColor: selectedPdf ? 'primary.main' : 'divider',
                transition: 'all 0.3s',
                '&:hover': {
                  bgcolor: 'action.hover',
                  borderColor: 'primary.main'
                }
              }}
              onClick={() => document.getElementById('pdf-file-input').click()}
            >
              <input
                id="pdf-file-input"
                type="file"
                accept=".pdf,application/pdf"
                style={{ display: 'none' }}
                onChange={handlePdfSelect}
                disabled={loading}
              />
              <UploadFileIcon sx={{ fontSize: 64, color: selectedPdf ? 'primary.main' : 'text.secondary', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                {selectedPdf ? selectedPdf.name : t('images.clickToSelectPdf', { defaultValue: '点击选择 PDF 文件' })}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('images.supportedFormat', { defaultValue: '支持格式：PDF' })}
              </Typography>
              {selectedPdf && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  {t('images.fileSize', { defaultValue: '文件大小' })}: {(selectedPdf.size / 1024 / 1024).toFixed(2)} MB
                </Typography>
              )}
            </Paper>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          {t('common.cancel')}
        </Button>
        {mode === 0 ? (
          <Button
            onClick={handleImport}
            variant="contained"
            disabled={loading || directories.length === 0}
            startIcon={loading ? <CircularProgress size={20} /> : null}
          >
            {t('images.startImport')}
          </Button>
        ) : (
          <Button
            onClick={handlePdfImport}
            variant="contained"
            disabled={loading || !selectedPdf}
            startIcon={loading ? <CircularProgress size={20} /> : null}
          >
            {t('images.convertAndImport', { defaultValue: '转换并导入' })}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
