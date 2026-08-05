// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FeedbackPage } from '../src/components/FeedbackPage.js';
import { submitFeedback } from '../src/api.js';

vi.mock('../src/api.js', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      readonly status: number = 500,
      readonly code: string | null = null,
    ) {
      super(message);
    }
  },
  submitFeedback: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FeedbackPage（FR-017）', () => {
  it('10文字未満の本文は送信されずエラーを表示する', async () => {
    render(<FeedbackPage />);
    fireEvent.change(screen.getByRole('textbox', { name: /報告内容/ }), {
      target: { value: '短い' },
    });
    fireEvent.click(screen.getByRole('button', { name: '送信' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it('送信成功で受付番号を表示し、フォームをリセットする', async () => {
    vi.mocked(submitFeedback).mockResolvedValue({
      id: 'fb-1',
      status: 'received',
      receivedAt: '2026-07-18T00:00:00Z',
      reference: 'FB-ABC123',
    });
    render(<FeedbackPage />);
    fireEvent.change(screen.getByRole('textbox', { name: /報告内容/ }), {
      target: { value: 'みらい市の道路管理課の電話番号が変わっています（デモ報告）' },
    });
    fireEvent.click(screen.getByRole('button', { name: '送信' }));
    await waitFor(() => {
      expect(screen.getByText(/受付番号: FB-ABC123/)).toBeTruthy();
    });
    expect(submitFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'incorrect_info' }),
    );
  });
});
