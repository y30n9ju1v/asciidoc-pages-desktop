import { useEffect, useState } from 'react';
import {
  clampEditorFontSize,
  loadEditorFontSize,
  loadVimModeEnabled,
  storeEditorFontSize,
  storeVimModeEnabled,
} from '../services/editorPreferences';
import { PageSizeId, loadStoredPageSizeId, storePageSizeId } from '../services/pageSizeService';
import {
  PublicationStyleId,
  loadStoredPublicationStyleId,
  storePublicationStyleId,
} from '../services/publicationStyleService';
import { ColorMode, loadStoredColorMode, storeColorMode } from '../services/themeService';

/** Owns user-selectable presentation preferences and their durable storage. */
export function useAppPreferences() {
  const [currentPublicationStyle, setCurrentPublicationStyle] = useState<PublicationStyleId>(() => {
    const styleId = loadStoredPublicationStyleId();
    // Persist the resolved value once so old independent preferences are
    // genuinely migrated rather than being reinterpreted at every launch.
    storePublicationStyleId(styleId);
    return styleId;
  });
  const [currentPageSize, setCurrentPageSize] = useState<PageSizeId>(() => loadStoredPageSizeId());
  const [colorMode, setColorMode] = useState<ColorMode>(() => loadStoredColorMode());
  const [vimMode, setVimMode] = useState<boolean>(() => loadVimModeEnabled());
  const [editorFontSize, setEditorFontSize] = useState<number>(() => loadEditorFontSize());

  useEffect(() => {
    document.documentElement.setAttribute('data-color-mode', colorMode);
  }, [colorMode]);

  const changePublicationStyle = (styleId: PublicationStyleId) => {
    setCurrentPublicationStyle(styleId);
    storePublicationStyleId(styleId);
  };
  const changePageSize = (pageSizeId: PageSizeId) => {
    setCurrentPageSize(pageSizeId);
    storePageSizeId(pageSizeId);
  };
  const changeColorMode = (mode: ColorMode) => {
    setColorMode(mode);
    storeColorMode(mode);
  };
  const changeVimMode = (enabled: boolean) => {
    setVimMode(enabled);
    storeVimModeEnabled(enabled);
  };
  const changeEditorFontSize = (size: number) => {
    const nextSize = clampEditorFontSize(size);
    setEditorFontSize(nextSize);
    storeEditorFontSize(nextSize);
  };

  return {
    currentPublicationStyle,
    currentPageSize,
    colorMode,
    vimMode,
    editorFontSize,
    changePublicationStyle,
    changePageSize,
    changeColorMode,
    changeVimMode,
    changeEditorFontSize,
  };
}
