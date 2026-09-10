import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MediaPreview } from './MediaPreview';

describe('MediaPreview', () => {
  it('renders a remote READY image with its alt text and signed read URL', () => {
    render(
      <MediaPreview
        item={{
          source: 'remote',
          attachment: {
            id: '11111111-1111-4111-8111-111111111111',
            kind: 'IMAGE',
            status: 'READY',
            contentType: 'image/png',
            sizeBytes: 100,
            readUrl: 'https://example.org/signed',
            linkUrl: null,
            locationLabel: null,
            approxLat: null,
            approxLng: null,
          },
        }}
        altText="تصویر باغچه"
      />
    );
    const img = screen.getByAltText('تصویر باغچه');
    expect(img).toHaveAttribute('src', 'https://example.org/signed');
  });

  it('renders a LINK attachment as a safe, rel-protected anchor', () => {
    render(
      <MediaPreview
        item={{
          source: 'remote',
          attachment: {
            id: '22222222-2222-4222-8222-222222222222',
            kind: 'LINK',
            status: 'READY',
            contentType: null,
            sizeBytes: null,
            readUrl: null,
            linkUrl: 'https://example.org/info',
            locationLabel: null,
            approxLat: null,
            approxLng: null,
          },
        }}
      />
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.org/info');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
  });

  it('renders an APPROXIMATE_LOCATION attachment as a label, no map/lat-lng leaked as raw coordinates in text', () => {
    render(
      <MediaPreview
        item={{
          source: 'remote',
          attachment: {
            id: '33333333-3333-4333-8333-333333333333',
            kind: 'APPROXIMATE_LOCATION',
            status: 'READY',
            contentType: null,
            sizeBytes: null,
            readUrl: null,
            linkUrl: null,
            locationLabel: 'پارک محله',
            approxLat: 35.7,
            approxLng: 51.4,
          },
        }}
      />
    );
    expect(screen.getByText(/پارک محله/)).toBeInTheDocument();
  });
});
