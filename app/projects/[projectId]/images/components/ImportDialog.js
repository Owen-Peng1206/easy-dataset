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
  TextField
} from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DeleteIcon from '@mui/icons-material/Delete';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import axios from 'axios';

export default function ImportDialog({ open, projectId, onClose, onSuccess }) {
  const { t } = useTranslation();
  const [directories, setDirectories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputPath, setInputPath] = useState('');

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

  const handleClose = () => {
    if (!loading) {
      setDirectories([]);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('images.importImages')}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
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
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          {t('common.cancel')}
        </Button>
        <Button
          onClick={handleImport}
          variant="contained"
          disabled={loading || directories.length === 0}
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          {t('images.startImport')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
