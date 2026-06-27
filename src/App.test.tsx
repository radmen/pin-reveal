import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App', (): void => {
  it('renders the product heading', (): void => {
    render(<App />);

    expect(
      screen.getByRole('heading', {
        name: /reveal what matters, one pin at a time/i
      })
    ).toBeInTheDocument();
  });
});
