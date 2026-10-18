import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type pg from 'pg';
import { EventEmitter } from 'node:events';
import { startNotifyBridge, stopNotifyBridge } from '../../src/lib/notify-bridge.js';
import * as scansRoute from '../../src/routes/scans.js';

class MockClient extends EventEmitter {
  query = vi.fn().mockResolvedValue({ rows: [] });
  release = vi.fn();
}

describe('Postgres NOTIFY Bridge (Chunk P2-10)', () => {
  let mockClient: MockClient;
  let mockPool: { connect: ReturnType<typeof vi.fn> };
  let broadcastSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockClient = new MockClient();
    mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
    };
    broadcastSpy = vi.spyOn(scansRoute, 'broadcastScanProgress');
  });

  afterEach(async () => {
    await stopNotifyBridge();
    vi.restoreAllMocks();
  });

  it('connects to pool and executes LISTEN scan_progress', async () => {
    await startNotifyBridge(mockPool as unknown as pg.Pool);

    expect(mockPool.connect).toHaveBeenCalled();
    expect(mockClient.query).toHaveBeenCalledWith('LISTEN scan_progress');
  });

  it('forwards valid scan_progress notifications to broadcastScanProgress', async () => {
    await startNotifyBridge(mockPool as unknown as pg.Pool);

    const scanId = 'scan-test-123';
    const payload = JSON.stringify({
      scanId,
      phase: 'scanning',
      pagesScanned: 12,
      pagesPlanned: 50,
      currentUrl: 'https://example.com/shop',
      status: 'scanning',
    });

    mockClient.emit('notification', {
      channel: 'scan_progress',
      payload,
    });

    expect(broadcastSpy).toHaveBeenCalledWith(scanId, {
      phase: 'scanning',
      pagesScanned: 12,
      pagesPlanned: 50,
      currentUrl: 'https://example.com/shop',
      status: 'scanning',
    });
  });

  it('safely ignores other channels and malformed payloads', async () => {
    await startNotifyBridge(mockPool as unknown as pg.Pool);

    // Other channel
    mockClient.emit('notification', {
      channel: 'other_channel',
      payload: JSON.stringify({ scanId: 'scan-x' }),
    });
    expect(broadcastSpy).not.toHaveBeenCalled();

    // Malformed JSON payload
    mockClient.emit('notification', {
      channel: 'scan_progress',
      payload: '{ broken json ',
    });
    expect(broadcastSpy).not.toHaveBeenCalled();
  });

  it('stopNotifyBridge executes UNLISTEN and releases client', async () => {
    await startNotifyBridge(mockPool as unknown as pg.Pool);
    await stopNotifyBridge();

    expect(mockClient.query).toHaveBeenCalledWith('UNLISTEN scan_progress');
    expect(mockClient.release).toHaveBeenCalled();
  });
});
