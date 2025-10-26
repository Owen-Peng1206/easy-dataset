'use client';

import { useState } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import axios from 'axios';

export function useQuestionsFilter(projectId) {
  // 过滤和搜索状态
  const [answerFilter, setAnswerFilter] = useState('all'); // 'all', 'answered', 'unanswered'
  const [searchTerm, setSearchTerm] = useState('');
  const [chunkNameFilter, setChunkNameFilter] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm);
  const debouncedChunkNameFilter = useDebounce(chunkNameFilter);

  // 选择状态
  const [selectedQuestions, setSelectedQuestions] = useState([]);

  // 处理问题选择
  const handleSelectQuestion = (questionKey, newSelected) => {
    if (newSelected) {
      // 处理批量选择的情况
      setSelectedQuestions(newSelected);
    } else {
      // 处理单个问题选择的情况
      setSelectedQuestions(prev => {
        if (prev.includes(questionKey)) {
          return prev.filter(id => id !== questionKey);
        } else {
          return [...prev, questionKey];
        }
      });
    }
  };

  // 全选/取消全选
  const handleSelectAll = async () => {
    if (selectedQuestions.length > 0) {
      setSelectedQuestions([]);
    } else {
      const response = await axios.get(
        `/api/projects/${projectId}/questions?status=${answerFilter}&input=${searchTerm}&selectedAll=1`
      );
      setSelectedQuestions(response.data.map(dataset => dataset.id));
    }
  };

  // 处理搜索输入变化
  const handleSearchChange = event => {
    setSearchTerm(event.target.value);
  };

  // 处理过滤器变化
  const handleFilterChange = event => {
    setAnswerFilter(event.target.value);
  };

  // 处理文本块名称筛选变化
  const handleChunkNameFilterChange = event => {
    setChunkNameFilter(event.target.value);
  };

  // 清空选择
  const clearSelection = () => {
    setSelectedQuestions([]);
  };

  // 重置所有过滤条件
  const resetFilters = () => {
    setSearchTerm('');
    setAnswerFilter('all');
    setChunkNameFilter('');
    setSelectedQuestions([]);
  };

  return {
    // 状态
    answerFilter,
    searchTerm,
    debouncedSearchTerm,
    chunkNameFilter,
    debouncedChunkNameFilter,
    selectedQuestions,

    // 方法
    setAnswerFilter,
    setSearchTerm,
    setChunkNameFilter,
    setSelectedQuestions,
    handleSelectQuestion,
    handleSelectAll,
    handleSearchChange,
    handleFilterChange,
    handleChunkNameFilterChange,
    clearSelection,
    resetFilters
  };
}
