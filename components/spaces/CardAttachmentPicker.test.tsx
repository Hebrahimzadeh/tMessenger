import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CardAttachmentPicker } from './CardAttachmentPicker';

const originalFetch = global.fetch;
const originalXHR = global.XMLHttpRequest;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

class FakeXHR {
  static instances: FakeXHR[] = [];
  method = '';
  url = '';
  withCredentials = false;
  status = 0;
  aborted = false;
  sentBody: unknown = null;
  headers: Record<string, string> = {};
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }
  send(body: unknown) {
    this.sentBody = body;
    FakeXHR.instances.push(this);
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
  complete(status: number) {
    this.status = status;
    this.onload?.();
  }
}

function pickFile(kind: 'تصویر' | 'صوت' | 'ویدئو' | 'فایل', file: File) {
  const input = screen.getByLabelText(`افزودن ${kind}`) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe('CardAttachmentPicker (upload progress, cancel, retry)', () => {
  beforeEach(() => {
    FakeXHR.instances = [];
    global.XMLHttpRequest = FakeXHR as unknown as typeof XMLHttpRequest;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    global.XMLHttpRequest = originalXHR;
    vi.restoreAllMocks();
  });

  it('shows real upload progress and finalizes to READY', async () => {
    const ATTACHMENT_ID = '11111111-1111-4111-8111-111111111111';
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(201, { attachmentId: ATTACHMENT_ID, objectKey: 'users/x/card-uploads/y' }))
      .mockResolvedValueOnce(jsonResponse(200, { attachmentId: ATTACHMENT_ID, status: 'READY', rejectionReason: null })) as unknown as typeof fetch;

    const onChange = vi.fn();
    render(<CardAttachmentPicker onChange={onChange} />);

    pickFile('تصویر', new File(['x'], 'photo.png', { type: 'image/png' }));
    await waitFor(() => expect(FakeXHR.instances).toHaveLength(1));

    FakeXHR.instances[0]!.progress(50, 100);
    await waitFor(() => expect(screen.getByText('50%')).toBeInTheDocument());

    FakeXHR.instances[0]!.progress(100, 100);
    FakeXHR.instances[0]!.complete(200);

    await waitFor(() => expect(screen.getByText('آمادهٔ افزودن به کارت')).toBeInTheDocument());
    expect(onChange).toHaveBeenLastCalledWith([ATTACHMENT_ID]);
    expect(FakeXHR.instances[0]!.url).toContain(`/storage/uploads/${ATTACHMENT_ID}`);
  });

  it('cancel aborts the in-flight upload and removes the item', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      jsonResponse(201, { attachmentId: '22222222-2222-4222-8222-222222222222', objectKey: 'k' })
    ) as unknown as typeof fetch;

    render(<CardAttachmentPicker onChange={vi.fn()} />);
    pickFile('صوت', new File(['x'], 'a.mp3', { type: 'audio/mpeg' }));
    await waitFor(() => expect(FakeXHR.instances).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'لغو' }));

    expect(FakeXHR.instances[0]!.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'لغو' })).not.toBeInTheDocument());
  });

  it('shows a rejection reason and lets the user retry, which starts a fresh upload', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(201, { attachmentId: '33333333-3333-4333-8333-333333333333', objectKey: 'k1' }))
      .mockResolvedValueOnce(jsonResponse(200, { attachmentId: '33333333-3333-4333-8333-333333333333', status: 'REJECTED', rejectionReason: 'TYPE_NOT_ALLOWED' }))
      .mockResolvedValueOnce(jsonResponse(201, { attachmentId: '44444444-4444-4444-8444-444444444444', objectKey: 'k2' }))
      .mockResolvedValueOnce(jsonResponse(200, { attachmentId: '44444444-4444-4444-8444-444444444444', status: 'READY', rejectionReason: null })) as unknown as typeof fetch;

    render(<CardAttachmentPicker onChange={vi.fn()} />);
    const file = new File(['x'], 'f.pdf', { type: 'application/pdf' });
    pickFile('فایل', file);
    await waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
    FakeXHR.instances[0]!.complete(200);

    await waitFor(() => expect(screen.getByText(/این نوع فایل برای این دسته مجاز نیست/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }));
    await waitFor(() => expect(FakeXHR.instances).toHaveLength(2));
    FakeXHR.instances[1]!.complete(200);

    await waitFor(() => expect(screen.getByText('آمادهٔ افزودن به کارت')).toBeInTheDocument());
  });
});
