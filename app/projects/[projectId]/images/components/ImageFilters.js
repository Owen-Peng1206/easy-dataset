'use client';

import { Box, TextField, Select, MenuItem, FormControl, InputLabel, InputAdornment } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '@/hooks/useDebounce';
import { useEffect, useState } from 'react';

export default function ImageFilters({
  imageName,
  onImageNameChange,
  hasQuestions,
  onHasQuestionsChange,
  hasDatasets,
  onHasDatasetsChange
}) {
  const { t } = useTranslation();
  const [localImageName, setLocalImageName] = useState(imageName);
  const debouncedImageName = useDebounce(localImageName, 500);

  useEffect(() => {
    onImageNameChange(debouncedImageName);
  }, [debouncedImageName]);

  return (
    <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      <TextField
        placeholder={t('images.searchPlaceholder')}
        value={localImageName}
        onChange={e => setLocalImageName(e.target.value)}
        size="small"
        sx={{ minWidth: 300 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          )
        }}
      />

      <FormControl size="small" sx={{ minWidth: 200 }}>
        <InputLabel>{t('images.hasQuestions')}</InputLabel>
        <Select
          value={hasQuestions}
          onChange={e => onHasQuestionsChange(e.target.value)}
          label={t('images.hasQuestions')}
        >
          <MenuItem value="all">{t('common.all')}</MenuItem>
          <MenuItem value="true">{t('images.withQuestions')}</MenuItem>
          <MenuItem value="false">{t('images.withoutQuestions')}</MenuItem>
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 200 }}>
        <InputLabel>{t('images.hasDatasets')}</InputLabel>
        <Select value={hasDatasets} onChange={e => onHasDatasetsChange(e.target.value)} label={t('images.hasDatasets')}>
          <MenuItem value="all">{t('common.all')}</MenuItem>
          <MenuItem value="true">{t('images.withDatasets')}</MenuItem>
          <MenuItem value="false">{t('images.withoutDatasets')}</MenuItem>
        </Select>
      </FormControl>
    </Box>
  );
}
