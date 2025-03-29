import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders Teleparty Chat heading', () => {
  render(<App />);
  const headingElement = screen.getByText(/Teleparty Chat/i);
  expect(headingElement).toBeInTheDocument();
}); 